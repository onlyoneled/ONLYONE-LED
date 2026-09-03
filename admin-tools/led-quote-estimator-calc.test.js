const assert = require('assert');
const {
  computeLED, findNearestBucket, findBoxPrice, computeQuote,
} = require('./led-quote-estimator-calc.js');
const layoutEngine = require('./led-layout-engine.js');

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

// ── drift-guard: led-quote-estimator-calc.js의 computeLED가 원본
// (admin-tools/led-layout-engine.js)과 계속 동일한 결과를 내는지 확인한다.
// 원본 파일은 수정 금지이므로, 두 구현이 갈라지면 이 테스트가 잡아낸다.
// 케이스는 led-layout-engine.test.js에서 그대로 가져왔다.
test('drift-guard: computeLED가 led-layout-engine.js 원본과 동일한 결과 (4 cases)', () => {
  const cases = [
    { modelId: 'p2.5', W: 2000, H: 1500 },
    { modelId: 'p2.5', W: 3840, H: 1600 },
    { modelId: 'p2.5', W: 3200, H: 3200 },
    { modelId: 'p2.0', W: 640, H: 480 },
  ];
  for (const input of cases) {
    assert.deepStrictEqual(
      computeLED(input),
      layoutEngine.computeLED(input),
      `mismatch for ${JSON.stringify(input)}`,
    );
  }
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
// receivingCards/smps/processors는 일부러 "배열 순서 ≠ 관측횟수 순위"로
// 구성한다 — convert_cost_data.py가 이미 관측횟수 내림차순으로 정렬해
// 넘겨준다는 가정하에, _pickTop이 인덱스를 그대로 써야 한다는 걸(Fix 1)
// 증명하려면 재정렬된 순서에서도 "인덱스 그대로" 골라야 하기 때문이다.
const SAMPLE_COST_DATA = {
  ledModulesSmd: [
    { pitch: 1.86, indoor_outdoor: 'indoor', module_size: '320*160mm', 대표단가: 152, 통화: 'CNY', 관측횟수: 22 },
    // P3.076 실내/실외 — 실제 프로덕션 데이터에서 발견된 버그(pitch만으로
    // 그룹핑하면 indoor/outdoor 중 배열에서 먼저 나온 행만 보임)를 재현.
    { pitch: 3.076, indoor_outdoor: 'indoor', module_size: '320*160mm', 대표단가: 153, 통화: 'CNY', 관측횟수: 6 },
    { pitch: 3.076, indoor_outdoor: 'outdoor', module_size: '320*160mm', 대표단가: 4550, 통화: 'CNY', 관측횟수: 4 },
  ],
  ledModulesGobCob: [
    { pitch: 4, indoor_outdoor: 'outdoor', module_size: '320*160mm', 대표단가: 800, 통화: 'CNY', 관측횟수: 6 },
  ],
  receivingCards: [
    { brand: 'Novastar', model: 'MRV412', 대표단가: 98, 통화: 'CNY', 관측횟수: 15 },  // idx 0: 최고 관측
    { brand: 'Huidu',    model: 'R708',   대표단가: 70, 통화: 'CNY', 관측횟수: 2  },  // idx 1: 최저 관측
    { brand: 'Novastar', model: 'TB40rc', 대표단가: 85, 통화: 'CNY', 관측횟수: 5  },  // idx 2: 중간 관측
  ],
  smps: [
    { voltage: 'AC220-240V', capacity: '5V60A', 대표단가: 55, 통화: 'CNY', 관측횟수: 20 }, // idx 0: 최고 관측
    { voltage: 'AC110V',     capacity: '5V40A', 대표단가: 45, 통화: 'CNY', 관측횟수: 3  }, // idx 1: 최저 관측
    { voltage: 'AC220V',     capacity: '5V30A', 대표단가: 50, 통화: 'CNY', 관측횟수: 10 }, // idx 2: 중간 관측
  ],
  processors: [
    { brand: 'Novastar', model: 'TB60',  대표단가: 2880, 통화: 'CNY', 관측횟수: 12 }, // idx 0: 최고 관측
    { brand: 'Colorlight', model: 'X5',  대표단가: 900,  통화: 'CNY', 관측횟수: 3  }, // idx 1: 최저 관측
    { brand: 'Novastar', model: 'MCTRL', 대표단가: 1500, 통화: 'CNY', 관측횟수: 7  }, // idx 2: 중간 관측
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
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86, indoorOutdoor: 'indoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);

  assert.strictEqual(result.layout.totalCabinets, 9);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.ok(moduleItem);
  assert.strictEqual(moduleItem.unitPrice, 152);
  assert.strictEqual(moduleItem.qty, result.layout.totalModules);

  const boxItem = result.items.find((i) => i.label.includes('박스') && !i.label.includes('우드'));
  assert.strictEqual(boxItem.qty, 9);
  assert.strictEqual(boxItem.unitPrice, 203);

  const rcvItem = result.items.find((i) => i.label.includes('수신카드'));
  assert.strictEqual(rcvItem.qty, 9); // totalCabinets

  const woodItem = result.items.find((i) => i.label.includes('우드박스'));
  assert.strictEqual(woodItem.unitPrice, 260);

  assert.ok(result.totalCny > 0);
});

// ── Fix 1: 인덱스 기반 선택이 실제로 배열 순서를 재정렬하지 않고 그대로
// 인덱스를 쓰는지 증명한다. receivingCardIndex: 1은 관측횟수 기준으로는
// 최하위(2건)이지만, 배열의 index 1에 있는 행(Huidu R708)이 그대로
// 선택되어야 한다 — 예전 버그(내부 재정렬)였다면 index 1은 관측횟수
// 순위 1위(Novastar MRV412, 15건)를 가리켰을 것이다.
test('computeQuote: receivingCardIndex=1은 배열의 index 1(Huidu R708)을 그대로 선택한다', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86, indoorOutdoor: 'indoor',
    receivingCardIndex: 1, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);

  const rcvItem = result.items.find((i) => i.label.includes('수신카드'));
  assert.ok(rcvItem.label.includes('Huidu'), `expected Huidu, got: ${rcvItem.label}`);
  assert.ok(rcvItem.label.includes('R708'), `expected R708, got: ${rcvItem.label}`);
  assert.strictEqual(rcvItem.unitPrice, 70);
});

// ── Fix 3: 같은 pitch라도 indoor/outdoor가 다르면 가격이 크게 다르다.
// pitch만으로 그룹핑하면 배열에서 먼저 나온 행(indoor)이 무조건 이겨서
// outdoor 가격(¥4550)이 절대 선택되지 못하는 버그였다.
test('computeQuote: pitch 3.076 indoor는 indoor 가격(¥153)을 선택한다', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 3.076, indoorOutdoor: 'indoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.strictEqual(moduleItem.unitPrice, 153);
});

test('computeQuote: pitch 3.076 outdoor는 outdoor 가격(¥4550)을 선택한다', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 3.076, indoorOutdoor: 'outdoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.strictEqual(moduleItem.unitPrice, 4550);
});

// ── moduleGroup: 'gobcob'은 ledModulesSmd가 아닌 ledModulesGobCob에서
// 골라야 한다.
test('computeQuote: moduleGroup=gobcob은 ledModulesGobCob 배열에서 선택한다', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'gobcob', pitch: 4, indoorOutdoor: 'outdoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.strictEqual(moduleItem.unitPrice, 800);
});

// ── 가격 편차(dispersion) 경고 ────────────────────────────────────────────
// 관측횟수가 충분해도(>2건) 최소/최대 가격 차이가 DISPERSION_RATIO_THRESHOLD(2)를
// 넘으면 경고가 붙어야 한다. 넘지 않으면 경고가 없어야 한다.
test('computeQuote: 가격 편차 비율이 임계값을 초과하면 경고 (최소100~최대500, 비율5)', () => {
  const dispersedData = JSON.parse(JSON.stringify(SAMPLE_COST_DATA));
  dispersedData.smps[0].관측횟수 = 5;
  dispersedData.smps[0].최소 = 100;
  dispersedData.smps[0].최대 = 500;
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86, indoorOutdoor: 'indoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, dispersedData);
  const smpsItem = result.items.find((i) => i.label.includes('SMPS'));
  assert.ok(smpsItem.warning, 'SMPS 가격 편차 경고가 있어야 함');
  assert.ok(smpsItem.warning.includes('100'), `warning should mention min: ${smpsItem.warning}`);
  assert.ok(smpsItem.warning.includes('500'), `warning should mention max: ${smpsItem.warning}`);
});

test('computeQuote: 가격 편차 비율이 임계값 이하면 경고 없음 (최소100~최대150, 비율1.5)', () => {
  const tightData = JSON.parse(JSON.stringify(SAMPLE_COST_DATA));
  tightData.smps[0].관측횟수 = 5;
  tightData.smps[0].최소 = 100;
  tightData.smps[0].최대 = 150;
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86, indoorOutdoor: 'indoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, tightData);
  const smpsItem = result.items.find((i) => i.label.includes('SMPS'));
  assert.strictEqual(smpsItem.warning, null, `expected no warning, got: ${smpsItem.warning}`);
});

test('computeQuote: 관측횟수 2 이하인 항목은 경고를 단다', () => {
  const lowConfidenceData = JSON.parse(JSON.stringify(SAMPLE_COST_DATA));
  lowConfidenceData.smps[0].관측횟수 = 2;
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86, indoorOutdoor: 'indoor',
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, lowConfidenceData);
  const smpsItem = result.items.find((i) => i.label.includes('SMPS'));
  assert.ok(smpsItem.warning, 'SMPS 관측횟수 2는 경고가 있어야 함');
  const procItem = result.items.find((i) => i.label.includes('프로세서'));
  assert.strictEqual(procItem.warning, null, '프로세서 관측횟수 12는 경고 없음');
});

console.log(`\n${passed} tests passed`);
