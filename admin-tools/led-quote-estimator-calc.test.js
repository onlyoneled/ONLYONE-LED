const assert = require('assert');
const {
  computeLED, findNearestBucket, findBoxPrice, computeQuote,
} = require('./led-quote-estimator-calc.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// ── computeLED (복제본이 원본과 동일하게 동작하는지) ─────────────────────
test('computeLED 2000x1500 @ P2.5 -> 640x480 x 9', () => {
  const r = computeLED({ modelId: 'p2.5', W: 2000, H: 1500 });
  assert.strictEqual(r.totalCabinets, 9);
  const base = r.cabinets.find((c) => c.w === 640 && c.h === 480);
  assert.ok(base);
  assert.strictEqual(base.n, 9);
});

// ── findNearestBucket ────────────────────────────────────────────────────
test('findNearestBucket: 정확히 일치하는 버킷 우선', () => {
  const buckets = [
    { area_bucket_sqm: 5, 대표단가: 260, 관측횟수: 10 },
    { area_bucket_sqm: 10, 대표단가: 450, 관측횟수: 5 },
  ];
  const r = findNearestBucket(buckets, 10);
  assert.strictEqual(r.row.area_bucket_sqm, 10);
  assert.strictEqual(r.exact, true);
  assert.strictEqual(r.outOfRange, false);
});

test('findNearestBucket: 범위 밖이면 outOfRange=true, 가장 가까운 값 반환', () => {
  const buckets = [
    { area_bucket_sqm: 5, 대표단가: 260, 관측횟수: 10 },
    { area_bucket_sqm: 90, 대표단가: 7000, 관측횟수: 1 },
  ];
  const r = findNearestBucket(buckets, 200);
  assert.strictEqual(r.row.area_bucket_sqm, 90);
  assert.strictEqual(r.outOfRange, true);
});

test('findNearestBucket: 빈 배열이면 row=null', () => {
  const r = findNearestBucket([], 10);
  assert.strictEqual(r.row, null);
});

// ── findBoxPrice ─────────────────────────────────────────────────────────
test('findBoxPrice: 정확히 일치하는 사이즈', () => {
  const boxes = [
    { size: '640*480mm', 대표단가: 203, 관측횟수: 8 },
    { size: '640*640mm', 대표단가: 300, 관측횟수: 5 },
  ];
  const r = findBoxPrice(boxes, 640, 480);
  assert.strictEqual(r.exact, true);
  assert.strictEqual(r.row.대표단가, 203);
});

test('findBoxPrice: 정확히 없으면 면적이 가장 가까운 사이즈로 대체', () => {
  const boxes = [
    { size: '640*480mm', 대표단가: 203, 관측횟수: 8 },
    { size: '320*160mm', 대표단가: 50, 관측횟수: 3 },
  ];
  const r = findBoxPrice(boxes, 640, 320); // 면적 204800, 640*480=307200(차 102400), 320*160=51200(차 153600)
  assert.strictEqual(r.exact, false);
  assert.strictEqual(r.row.size, '640*480mm');
});

// ── computeQuote (통합) ──────────────────────────────────────────────────
const SAMPLE_COST_DATA = {
  ledModulesSmd: [
    { pitch: 1.86, indoor_outdoor: 'indoor', module_size: '320*160mm', 대표단가: 152, 통화: 'CNY', 관측횟수: 22 },
  ],
  receivingCards: [
    { brand: 'Novastar', model: 'MRV412', 대표단가: 98, 통화: 'CNY', 관측횟수: 15 },
  ],
  smps: [
    { voltage: 'AC220-240V', capacity: '5V40A', 대표단가: 45, 통화: 'CNY', 관측횟수: 10 },
  ],
  processors: [
    { brand: 'Novastar', model: 'TB60', 대표단가: 2880, 통화: 'CNY', 관측횟수: 3 },
  ],
  boxes: [
    { size: '640*480mm', material: 'aluminum', 대표단가: 203, 통화: 'CNY', 관측횟수: 8 },
  ],
  cable220v: [{ length_mm: 750, 대표단가: 22, 통화: 'CNY', 관측횟수: 12 }],
  cableCat6: [{ length_mm: 1000, 대표단가: 20, 통화: 'CNY', 관측횟수: 12 }],
  cable16p: [{ 대표단가: 15, 통화: 'CNY', 관측횟수: 12 }],
  woodBox: [{ area_bucket_sqm: 5, 대표단가: 260, 통화: 'CNY', 관측횟수: 20 }],
  freight: [{ area_bucket_sqm: 5, 대표단가: 300, 통화: 'CNY', 관측횟수: 18 }],
};

test('computeQuote: 2000x1500 SMD P1.86 전체 항목 산출', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86,
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);

  assert.strictEqual(result.layout.totalCabinets, 9);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.ok(moduleItem);
  assert.strictEqual(moduleItem.unitPrice, 152);
  assert.strictEqual(moduleItem.qty, result.layout.totalModules);

  const boxItem = result.items.find((i) => i.label.includes('박스'));
  assert.strictEqual(boxItem.qty, 9);
  assert.strictEqual(boxItem.unitPrice, 203);

  const rcvItem = result.items.find((i) => i.label.includes('수신카드'));
  assert.strictEqual(rcvItem.qty, 9); // totalCabinets

  const woodItem = result.items.find((i) => i.label.includes('우드박스'));
  assert.strictEqual(woodItem.unitPrice, 260);

  assert.ok(result.totalCny > 0);
});

test('computeQuote: 관측횟수 2 이하인 항목은 경고를 단다', () => {
  const lowConfidenceData = JSON.parse(JSON.stringify(SAMPLE_COST_DATA));
  lowConfidenceData.smps[0].관측횟수 = 2;
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86,
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, lowConfidenceData);
  const smpsItem = result.items.find((i) => i.label.includes('SMPS'));
  assert.ok(smpsItem.warning, 'SMPS 관측횟수 2는 경고가 있어야 함');
  const procItem = result.items.find((i) => i.label.includes('프로세서'));
  assert.strictEqual(procItem.warning, null, '프로세서 관측횟수 3은 경고 없음');
});

console.log(`\n${passed} tests passed`);
