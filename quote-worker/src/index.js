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
  return token === env.ACCESS_PASSWORD;
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!checkAuth(request, url, env)) return json({ error: 'Unauthorized' }, 401);

    // 목록 / 상세 / 업체
    if (path === '/api/quotes'          && request.method === 'GET')    return handleList(url, env);
    if (path === '/api/quotes'          && request.method === 'DELETE') return handleBatchDelete(request, env);
    if (path.startsWith('/api/quotes/') && request.method === 'GET')    return handleGet(path.split('/')[3], env);
    if (path.startsWith('/api/quotes/') && request.method === 'PATCH')  return handleMemo(path.split('/')[3], request, env);
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

// ── memo 업데이트 ────────────────────────────────────────
async function handleMemo(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  await env.DB.prepare('UPDATE quotes SET memo = ? WHERE id = ?')
    .bind(body.memo ?? null, id).run();
  return json({ ok: true });
}

// ── DB 마이그레이션 (memo 컬럼 추가) ────────────────────
async function handleMigrate(env) {
  try {
    await env.DB.prepare('ALTER TABLE quotes ADD COLUMN memo TEXT').run();
    return json({ ok: true, message: 'memo column added' });
  } catch (e) {
    return json({ ok: false, error: e.message });
  }
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
    `SELECT vendor, COUNT(*) as count, MAX(date) as latest_date
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
    `SELECT id, vendor, title, date, total_price, currency, drive_file_name, memo
     FROM quotes WHERE ${where}
     ORDER BY date DESC, created_at DESC`
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
