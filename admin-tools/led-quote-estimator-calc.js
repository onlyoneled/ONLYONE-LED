// admin-tools/led-quote-estimator-calc.js
//
// led-layout-calc.html / admin-tools/led-layout-engine.js의 배치 계산 로직을
// 그대로 복제한 것이다 (원본 수정 금지 원칙 — 새 파일에만 반영).
// 아래 MODULES ~ computeLED까지는 led-layout-engine.js와 동일하다.

const MODULES = [
  { id: 'p2.5',   pitch: 2.5,   resW: 128, resH: 64,  w: 35   },
  { id: 'p2.0',   pitch: 2.0,   resW: 160, resH: 80,  w: 33.3 },
  { id: 'p1.86',  pitch: 1.86,  resW: 172, resH: 86,  w: 33.3 },
  { id: 'p1.538', pitch: 1.538, resW: 208, resH: 104, w: 35   },
  { id: 'p1.25',  pitch: 1.25,  resW: 256, resH: 128, w: 38   },
];
const MODULE_MM_W = 320, MODULE_MM_H = 160;
const PX_PER_LINE = 650000;

const CABINET_WEIGHT = {
  '640x640': 8.9, '640x480': 7.0, '640x320': 4.8, '640x160': 2.3,
  '320x640': 4.2, '320x480': 4.1, '320x320': 2.2, '320x160': 1.8,
};
function cabWeight(w, h) { return CABINET_WEIGHT[w + 'x' + h] || 0; }

const BREAKER_SIZES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800];
function nextBreaker(a) { for (const b of BREAKER_SIZES) if (b >= a) return b; return Math.ceil(a / 100) * 100; }
const SINGLE_V = 220, THREE_V = 380, PF = 0.8;

function decompWidth(W) {
  const usable = Math.floor(W / 320) * 320;
  const discard = W - usable;
  const units = usable / 320;
  const cols = [];
  const n640 = Math.floor(units / 2);
  for (let i = 0; i < n640; i++) cols.push(640);
  if (units % 2 === 1) cols.push(320);
  return { cols, usable, discard };
}

function decompHeight(H) {
  const usable = Math.floor(H / 160) * 160;
  const discard = H - usable;
  const rows = [];
  const q = Math.floor(usable / 480);
  const r = usable - q * 480;
  if (r === 0) {
    for (let i = 0; i < q; i++) rows.push(480);
  } else if (r === 320) {
    for (let i = 0; i < q; i++) rows.push(480);
    rows.push(320);
  } else if (r === 160) {
    if (q >= 1) { for (let i = 0; i < q - 1; i++) rows.push(480); rows.push(640); }
    else rows.push(160);
  } else {
    throw new Error('decompHeight: unexpected remainder ' + r);
  }
  return { rows, usable, discard };
}

function cabRole(w, h) {
  if (w === 640 && h === 480) return 'base';
  if (w === 640 && h === 640) return 'combine';
  return 'fill';
}

function computeLED(input) {
  const m = MODULES.find((x) => x.id === input.modelId) || MODULES[0];
  const inW = Math.max(0, Math.round(input.W || 0));
  const inH = Math.max(0, Math.round(input.H || 0));
  const dw = decompWidth(inW);
  const dh = decompHeight(inH);
  const cols = dw.cols, rows = dh.rows;
  const tally = {};
  for (const w of cols) for (const h of rows) {
    const key = w + 'x' + h;
    if (!tally[key]) tally[key] = { w, h, n: 0, role: cabRole(w, h) };
    tally[key].n++;
  }
  const cabinets = Object.values(tally).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  cabinets.forEach((c) => { c.kg = cabWeight(c.w, c.h); c.kgTotal = c.kg * c.n; });
  const totalCabinets = cols.length * rows.length;
  const totalWeight = cabinets.reduce((s, c) => s + c.kgTotal, 0);
  const modCountW = dw.usable / 320;
  const modCountH = dh.usable / 160;
  const totalModules = modCountW * modCountH;
  const totalResW = modCountW * m.resW;
  const totalResH = modCountH * m.resH;
  const totalPx = totalResW * totalResH;
  const usableW = dw.usable, usableH = dh.usable;
  const area = (usableW / 1000) * (usableH / 1000);
  const power = totalModules * m.w;
  const ampSingle = power / SINGLE_V;
  const ampThree = power / (Math.sqrt(3) * THREE_V * PF);
  const brkSingle = nextBreaker(ampSingle);
  const brkThree = nextBreaker(ampThree);
  const dataLines = totalPx > 0 ? Math.ceil(totalPx / PX_PER_LINE) : 0;
  return {
    model: m, inW, inH,
    cols, rows, cabinets, totalCabinets,
    usableW, usableH, discardW: dw.discard, discardH: dh.discard,
    modCountW, modCountH, totalModules,
    totalResW, totalResH, totalPx,
    area, power, ampSingle, ampThree, brkSingle, brkThree,
    dataLines, totalWeight,
    tooSmall: usableW === 0 || usableH === 0,
  };
}

// ── 여기서부터 이 태스크(Task 3)의 신규 함수 ────────────────────────────

function findNearestBucket(sortedBuckets, targetAreaSqm) {
  if (!sortedBuckets.length) return { row: null, exact: false, outOfRange: false };
  let best = sortedBuckets[0];
  let bestDiff = Math.abs(best.area_bucket_sqm - targetAreaSqm);
  for (const b of sortedBuckets) {
    const diff = Math.abs(b.area_bucket_sqm - targetAreaSqm);
    if (diff < bestDiff) { best = b; bestDiff = diff; }
  }
  const min = sortedBuckets[0].area_bucket_sqm;
  const max = sortedBuckets[sortedBuckets.length - 1].area_bucket_sqm;
  const exact = bestDiff === 0;
  const outOfRange = targetAreaSqm < min || targetAreaSqm > max;
  return { row: best, exact, outOfRange };
}

function _parseBoxSize(size) {
  const m = /(\d+)\s*\*\s*(\d+)/.exec(size || '');
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

function findBoxPrice(boxes, w, h) {
  const exactLabel = `${w}*${h}mm`;
  const exactMatch = boxes.find((b) => b.size === exactLabel);
  if (exactMatch) return { row: exactMatch, exact: true };

  const targetArea = w * h;
  let best = null;
  let bestDiff = Infinity;
  for (const b of boxes) {
    const dims = _parseBoxSize(b.size);
    if (!dims) continue;
    const diff = Math.abs(dims.w * dims.h - targetArea);
    if (diff < bestDiff) { best = b; bestDiff = diff; }
  }
  return { row: best, exact: false };
}

// rows는 이미 convert_cost_data.py에서 관측횟수 내림차순으로 정렬되어
// 도착한다 — 여기서 다시 정렬하지 않는다. led-quote-estimator.html의
// fillSelect()가 이 배열을 그대로 순회해 option.value=index를 만들고
// 그 index를 그대로 여기로 넘기므로, 이 함수가 배열을 재정렬하면
// 드롭다운에서 고른 행과 실제로 가격이 매겨지는 행이 어긋난다
// (2026-08-31 리뷰에서 발견된 버그 — 데이터 정렬은 소스에서 한 번만).
function _pickTop(rows, index) {
  if (!rows || !rows.length) return null;
  const i = (typeof index === 'number' && index >= 0 && index < rows.length) ? index : 0;
  return rows[i] || rows[0] || null;
}

function _pickDefault(rows) {
  return _pickTop(rows, 0);
}

const LOW_CONFIDENCE_THRESHOLD = 2;
const DISPERSION_RATIO_THRESHOLD = 2;

// 관측횟수가 충분해도(예: >2건) 최소/최대 가격 차이가 비정상적으로 크면
// Phase 1 원본 데이터의 단위 혼선(㎡당 단가와 모듈당 단가가 섞이는 등)일
// 가능성이 높다 — 관측횟수만 보는 경고로는 이런 케이스를 놓친다.
function _dispersionWarning(row, label) {
  if (!row) return null;
  const min = row.최소, max = row.최대;
  if (typeof min !== 'number' || typeof max !== 'number' || min <= 0) return null;
  if (max / min > DISPERSION_RATIO_THRESHOLD) {
    return `${label} 가격 편차가 큼 (최소 ¥${min} ~ 최대 ¥${max}) — 데이터 확인 필요`;
  }
  return null;
}

function _confWarning(row, label) {
  if (!row) return `${label} 데이터 없음`;
  const msgs = [];
  if ((row.관측횟수 || 0) <= LOW_CONFIDENCE_THRESHOLD) {
    msgs.push(`${label} 관측 ${row.관측횟수 || 0}건 — 표본이 적어 참고용`);
  }
  const dispersion = _dispersionWarning(row, label);
  if (dispersion) msgs.push(dispersion);
  return msgs.length ? msgs.join('; ') : null;
}

// 같은 pitch라도 실내/실외(indoor_outdoor)가 다르면 단가가 크게 다를 수
// 있다(예: P3.076 실내 ¥153 vs 실외 ¥4550) — pitch만으로 그룹핑하면
// 파일 순서상 먼저 나온 행이 무조건 이기면서 훨씬 저렴하거나 훨씬 비싼
// 행이 사용자에게 아예 안 보일 수 있다. pitch+indoor_outdoor 조합으로
// 찾고, 그래도 남는 중복(같은 pitch·같은 indoor_outdoor)이 있으면
// 관측횟수가 가장 높은 행을 쓴다 — 배열 순서에 의존하지 않기 위해
// 명시적으로 비교한다(led 모듈 배열은 Fix 1의 정렬 대상이 아니므로).
function _pickModuleRow(rows, pitch, indoorOutdoor) {
  let best = null;
  for (const r of rows || []) {
    if (r.pitch !== pitch || r.indoor_outdoor !== indoorOutdoor) continue;
    if (!best || (r.관측횟수 || 0) > (best.관측횟수 || 0)) best = r;
  }
  return best;
}

function computeQuote(input, costData) {
  const layout = computeLED({ modelId: `p${input.pitch}`, W: input.W, H: input.H });
  const warnings = [];
  const items = [];

  const moduleRows = input.moduleGroup === 'gobcob' ? costData.ledModulesGobCob : costData.ledModulesSmd;
  const moduleRow = _pickModuleRow(moduleRows, input.pitch, input.indoorOutdoor);
  {
    const price = moduleRow ? moduleRow.대표단가 : 0;
    const w = _confWarning(moduleRow, 'LED 모듈');
    if (w) warnings.push(w);
    items.push({
      label: `LED 모듈 (P${input.pitch})`, qty: layout.totalModules, unitPrice: price,
      subtotal: layout.totalModules * price, currency: moduleRow ? moduleRow.통화 : 'CNY',
      observationCount: moduleRow ? moduleRow.관측횟수 : 0, warning: w,
    });
  }

  let boxSubtotal = 0;
  let boxQty = 0;
  const boxWarnings = [];
  for (const cab of layout.cabinets) {
    const { row: boxRow, exact } = findBoxPrice(costData.boxes || [], cab.w, cab.h);
    const price = boxRow ? boxRow.대표단가 : 0;
    boxSubtotal += price * cab.n;
    boxQty += cab.n;
    if (!exact) boxWarnings.push(`${cab.w}×${cab.h}mm 박스 단가 없음 — 근접 사이즈로 대체`);
    const w2 = _confWarning(boxRow, `박스(${cab.w}×${cab.h})`);
    if (w2) boxWarnings.push(w2);
  }
  boxWarnings.forEach((w) => warnings.push(w));
  items.push({
    label: '다이캐스팅 박스 (전체)', qty: boxQty, unitPrice: boxQty ? boxSubtotal / boxQty : 0,
    subtotal: boxSubtotal, currency: 'CNY', observationCount: null,
    warning: boxWarnings.length ? boxWarnings.join('; ') : null,
  });

  const rcvRow = _pickTop(costData.receivingCards, input.receivingCardIndex);
  {
    const price = rcvRow ? rcvRow.대표단가 : 0;
    const w = _confWarning(rcvRow, '수신카드');
    if (w) warnings.push(w);
    items.push({
      label: `수신카드 (${rcvRow ? rcvRow.brand + ' ' + rcvRow.model : '-'})`,
      qty: layout.totalCabinets, unitPrice: price, subtotal: layout.totalCabinets * price,
      currency: rcvRow ? rcvRow.통화 : 'CNY', observationCount: rcvRow ? rcvRow.관측횟수 : 0, warning: w,
    });
  }

  const smpsRow = _pickTop(costData.smps, input.smpsIndex);
  {
    const price = smpsRow ? smpsRow.대표단가 : 0;
    const w = _confWarning(smpsRow, 'SMPS');
    if (w) warnings.push(w);
    items.push({
      label: 'SMPS', qty: layout.totalCabinets, unitPrice: price,
      subtotal: layout.totalCabinets * price, currency: smpsRow ? smpsRow.통화 : 'CNY',
      observationCount: smpsRow ? smpsRow.관측횟수 : 0, warning: w,
    });
  }

  const cableSpecs = [
    ['cable220v', '220V 케이블'],
    ['cableCat6', 'CAT6 케이블'],
    ['cable16p', '16P 플랫케이블'],
  ];
  for (const [key, label] of cableSpecs) {
    const row = _pickDefault(costData[key]);
    const price = row ? row.대표단가 : 0;
    const w = _confWarning(row, label);
    if (w) warnings.push(w);
    items.push({
      label, qty: layout.totalCabinets, unitPrice: price, subtotal: layout.totalCabinets * price,
      currency: row ? row.통화 : 'CNY', observationCount: row ? row.관측횟수 : 0, warning: w,
    });
  }

  const procRow = _pickTop(costData.processors, input.processorIndex);
  {
    const price = procRow ? procRow.대표단가 : 0;
    const w = _confWarning(procRow, '프로세서');
    if (w) warnings.push(w);
    items.push({
      label: `프로세서 (${procRow ? procRow.brand + ' ' + procRow.model : '-'})`,
      qty: 1, unitPrice: price, subtotal: price,
      currency: procRow ? procRow.통화 : 'CNY', observationCount: procRow ? procRow.관측횟수 : 0, warning: w,
    });
  }

  for (const [key, label] of [['woodBox', '우드박스'], ['freight', '운송비']]) {
    const { row, exact, outOfRange } = findNearestBucket(costData[key] || [], layout.area);
    const price = row ? row.대표단가 : 0;
    let w = _confWarning(row, label);
    if (outOfRange) {
      const rangeMsg = `${label} 면적(${layout.area.toFixed(1)}㎡)이 관측 범위 밖 — 가장 가까운 값으로 대체`;
      w = w ? `${w}; ${rangeMsg}` : rangeMsg;
    }
    if (w) warnings.push(w);
    items.push({
      label, qty: 1, unitPrice: price, subtotal: price,
      currency: row ? row.통화 : 'CNY', observationCount: row ? row.관측횟수 : 0, warning: w,
    });
  }

  const totalCny = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  return { layout, items, totalCny, warnings };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MODULES, MODULE_MM_W, MODULE_MM_H, PX_PER_LINE,
    CABINET_WEIGHT, BREAKER_SIZES, SINGLE_V, THREE_V, PF,
    cabWeight, nextBreaker, decompWidth, decompHeight, cabRole, computeLED,
    findNearestBucket, findBoxPrice, computeQuote, _pickModuleRow,
  };
}
