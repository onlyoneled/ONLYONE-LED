import { extractFile } from './cost-pipeline.js';
import { makeSkuKey, aggregateByCategory, judgeConfidence } from './cost-aggregator.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function checkAuth(request, url, env) {
  const token = request.headers.get('X-Auth-Token') || url.searchParams.get('token');
  if (!token) return true; // 토큰 없으면 내부 접근으로 간주해서 허용
  return token === env.ACCESS_PASSWORD;
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 원가 데이터 조회 (공개 계산기 페이지용 — 인증 불필요)
    if (path === '/api/cost-data' && request.method === 'GET') return handleCostData(env);

    if (!checkAuth(request, url, env)) return json({ error: 'Unauthorized' }, 401);

    // xlsx 견적 업로드 → 파싱 → 원가 관측치 저장 / 검토대기 / 승인·반려
    if (path === '/api/cost-upload'         && request.method === 'POST')  return handleCostUpload(request, env);
    if (path === '/api/cost-review'         && request.method === 'GET')   return handleCostReviewList(env);
    if (path.startsWith('/api/cost-review/') && request.method === 'PATCH') return handleCostReviewPatch(path.split('/')[3], request, env);

    // 목록 / 상세 / 업체
    if (path === '/api/quotes'          && request.method === 'GET')    return handleList(url, env);
    if (path === '/api/quotes'          && request.method === 'DELETE') return handleBatchDelete(request, env);
    if (path.startsWith('/api/quotes/') && request.method === 'GET')    return handleGet(path.split('/')[3], env);
    if (path.startsWith('/api/quotes/') && request.method === 'PATCH')  return handlePatch(path.split('/')[3], request, env);
    if (path === '/api/vendors'         && request.method === 'GET')    return handleVendors(env);

    // PDF 업로드 (multipart: vendor + currency + parsed_data + pdf)
    if (path === '/api/upload'          && request.method === 'POST')   return handleUpload(request, env);

    // PDF 서빙 (R2에서)
    if (path.startsWith('/api/pdf/')    && request.method === 'GET')    return handlePDF(path.split('/')[3], env);

    // DB 마이그레이션 (일회용)
    if (path === '/api/migrate'         && request.method === 'POST')   return handleMigrate(env);

    return json({ error: 'Not Found' }, 404);
  },
};

// ── 필드 업데이트 (memo / group_no) ─────────────────────
async function handlePatch(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const allowed = ['memo', 'group_no'];
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return json({ error: 'No valid fields' }, 400);

  const sets = updates.map(([k]) => `${k} = ?`).join(', ');
  const vals = updates.map(([, v]) => v ?? null);
  await env.DB.prepare(`UPDATE quotes SET ${sets} WHERE id = ?`).bind(...vals, id).run();
  return json({ ok: true });
}

// ── DB 마이그레이션 ──────────────────────────────────────
async function handleMigrate(env) {
  const results = [];
  for (const sql of [
    'ALTER TABLE quotes ADD COLUMN memo TEXT',
    'ALTER TABLE quotes ADD COLUMN group_no TEXT',
  ]) {
    try {
      await env.DB.prepare(sql).run();
      results.push({ sql, ok: true });
    } catch (e) {
      results.push({ sql, ok: false, error: e.message });
    }
  }
  return json({ results });
}

// ── PDF 업로드 → R2 저장 + D1 저장 ─────────────────────
async function handleUpload(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'multipart 파싱 실패' }, 400); }

  const vendor     = (form.get('vendor') || '').trim();
  const currency   = form.get('currency') || 'KRW';
  const parsedStr  = form.get('parsed_data') || '{}';
  const pdfFile    = form.get('pdf');

  if (!vendor)   return json({ error: '업체명 필요' }, 400);
  if (!pdfFile)  return json({ error: 'PDF 파일 필요' }, 400);

  const fileName = pdfFile.name;
  const r2Key    = `${vendor}/${fileName}`;

  // 중복 체크
  const existing = await env.DB.prepare(
    'SELECT id FROM quotes WHERE drive_file_id = ?'
  ).bind(r2Key).first();
  if (existing) return json({ skipped: true, message: `이미 처리됨: ${fileName}` });

  // R2에 PDF 저장
  const pdfBytes = await pdfFile.arrayBuffer();
  await env.PDF_BUCKET.put(r2Key, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  // 파싱 데이터
  let parsed = {};
  try { parsed = JSON.parse(parsedStr); } catch { /* 파싱 실패 시 빈 객체 */ }

  // D1 저장
  await env.DB.prepare(
    `INSERT INTO quotes
       (vendor, title, date, items, content, total_price, currency, drive_file_id, drive_file_name, r2_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    vendor,
    parsed.title     || fileName,
    parsed.date      || null,
    JSON.stringify(parsed.items || []),
    parsed.content   || null,
    parsed.total_price ?? null,
    currency,
    r2Key,
    fileName,
    r2Key,
  ).run();

  return json({ ok: true, title: parsed.title || fileName });
}

// ── PDF 서빙 (R2) ────────────────────────────────────────
async function handlePDF(id, env) {
  const row = await env.DB.prepare(
    'SELECT r2_key, drive_file_name FROM quotes WHERE id = ?'
  ).bind(id).first();
  if (!row?.r2_key) return json({ error: 'Not found' }, 404);

  const obj = await env.PDF_BUCKET.get(row.r2_key);
  if (!obj) return json({ error: 'PDF 파일 없음' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.drive_file_name || 'quote.pdf')}"`,
      ...CORS,
    },
  });
}

// ── 업체 목록 (건수 + 최근날짜 포함) ────────────────────
async function handleVendors(env) {
  const { results } = await env.DB.prepare(
    `SELECT vendor, COUNT(*) as count, MAX(date) as latest_date,
            GROUP_CONCAT(DISTINCT currency) as currencies
     FROM quotes GROUP BY vendor ORDER BY vendor`
  ).all();
  return json(results);
}

// ── 견적서 목록 ──────────────────────────────────────────
async function handleList(url, env) {
  const vendor = url.searchParams.get('vendor') || '';
  const q      = url.searchParams.get('q')      || '';
  const from   = url.searchParams.get('from')   || '';
  const to     = url.searchParams.get('to')     || '';

  let where = '1=1';
  const params = [];
  if (vendor) { where += ' AND vendor = ?'; params.push(vendor); }
  if (q) {
    where += ' AND (title LIKE ? OR content LIKE ? OR vendor LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (from) { where += ' AND date >= ?'; params.push(from); }
  if (to)   { where += ' AND date <= ?'; params.push(to); }

  const { results } = await env.DB.prepare(
    `SELECT id, vendor, title, date, total_price, currency, drive_file_name, memo, group_no
     FROM quotes WHERE ${where}
     ORDER BY CASE WHEN group_no IS NULL THEN 1 ELSE 0 END, group_no, date DESC, created_at DESC`
  ).bind(...params).all();

  return json(results);
}

// ── 견적서 상세 ──────────────────────────────────────────
async function handleGet(id, env) {
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  row.items = JSON.parse(row.items || '[]');
  return json(row);
}

// ── 일괄 삭제 ────────────────────────────────────────────
async function handleBatchDelete(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const ids = body.ids;
  if (!Array.isArray(ids) || !ids.length) return json({ error: 'ids 배열 필요' }, 400);

  const placeholders = ids.map(() => '?').join(',');

  // R2 키 조회 후 삭제
  const { results } = await env.DB.prepare(
    `SELECT r2_key FROM quotes WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  await Promise.all(results.filter(r => r.r2_key).map(r => env.PDF_BUCKET.delete(r.r2_key)));

  // D1 삭제
  await env.DB.prepare(
    `DELETE FROM quotes WHERE id IN (${placeholders})`
  ).bind(...ids).run();

  return json({ ok: true, deleted: ids.length });
}

// ── xlsx 업로드 → 파싱 → D1/R2 저장 ─────────────────────
async function handleCostUpload(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'multipart 파싱 실패' }, 400); }

  const file = form.get('file');
  if (!file) return json({ error: 'file 필요' }, 400);

  const filename = file.name;
  const arrayBuffer = await file.arrayBuffer();
  const uploadDate = new Date().toISOString().slice(0, 10);

  let extracted;
  try {
    extracted = extractFile(arrayBuffer, filename, uploadDate);
  } catch (e) {
    return json({ error: `파싱 실패: ${e.message}` }, 400);
  }

  if (!extracted.included) {
    return json({ ok: false, reason: extracted.excludeReason });
  }

  const r2Key = `xlsx/${Date.now()}_${filename}`;
  await env.PDF_BUCKET.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });

  const uploadRow = await env.DB.prepare(
    `INSERT INTO uploaded_quotes (filename, r2_key, line_items_count) VALUES (?, ?, ?) RETURNING id`
  ).bind(filename, r2Key, extracted.lineItems.length).first();
  const uploadId = uploadRow.id;

  let pendingCount = 0;
  for (const item of extracted.lineItems) {
    const skuKey = makeSkuKey(item.category, item.attributes);
    const existing = await env.DB.prepare(
      `SELECT price FROM cost_observations WHERE category = ? AND sku_key = ? AND status = 'approved' ORDER BY observed_date DESC LIMIT 1`
    ).bind(item.category, skuKey).first();
    const existingPrice = existing ? existing.price : null;

    let judged;
    if (!item.category) {
      judged = { status: 'pending', reason: '자동 분류 실패' };
    } else {
      judged = judgeConfidence(item.price, existingPrice);
    }
    if (judged.status === 'pending') pendingCount++;

    await env.DB.prepare(
      `INSERT INTO cost_observations
         (category, sku_key, attributes, price, currency, observed_date, source_file, upload_id, status, status_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.category || 'unclassified', skuKey, JSON.stringify(item.attributes),
      item.price, item.currency, item.date, filename, uploadId,
      judged.status, judged.reason,
    ).run();
  }

  await env.DB.prepare(`UPDATE uploaded_quotes SET pending_count = ? WHERE id = ?`)
    .bind(pendingCount, uploadId).run();

  return json({
    ok: true, uploadId, filename,
    lineItemsCount: extracted.lineItems.length,
    pendingCount,
    unclassifiedCount: extracted.unclassifiedRows.length,
  });
}

// ── 검토대기 목록 ────────────────────────────────────────
async function handleCostReviewList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, category, sku_key, attributes, price, currency, observed_date, source_file, status_reason
     FROM cost_observations WHERE status = 'pending' ORDER BY created_at DESC`
  ).all();
  return json(results.map((r) => ({ ...r, attributes: JSON.parse(r.attributes) })));
}

// ── 승인/반려 ────────────────────────────────────────────
async function handleCostReviewPatch(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!['approve', 'reject'].includes(body.action)) return json({ error: 'action은 approve|reject' }, 400);

  const status = body.action === 'approve' ? 'approved' : 'rejected';
  await env.DB.prepare(`UPDATE cost_observations SET status = ? WHERE id = ?`).bind(status, id).run();
  return json({ ok: true, id: Number(id), status });
}

// ── 승인된 관측치 집계 → 계산기용 API (인증 불필요) ──────
async function handleCostData(env) {
  const { results } = await env.DB.prepare(
    `SELECT category, attributes, price, currency, observed_date AS date
     FROM cost_observations WHERE status = 'approved'`
  ).all();
  const lineItems = results.map((r) => ({ ...r, attributes: JSON.parse(r.attributes) }));
  const grouped = aggregateByCategory(lineItems);
  return json(grouped);
}
