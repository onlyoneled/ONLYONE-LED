const assert = require('assert');
const { makeSkuKey, aggregateByCategory, judgeConfidence } = require('./cost-aggregator.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

test('makeSkuKey: 같은 속성이면 같은 키', () => {
  const a = makeSkuKey('led_module', { pitch: 1.86, indoor_outdoor: 'indoor', type: 'GOB' });
  const b = makeSkuKey('led_module', { pitch: 1.86, indoor_outdoor: 'indoor', type: 'GOB' });
  const c = makeSkuKey('led_module', { pitch: 2.5, indoor_outdoor: 'indoor', type: 'GOB' });
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('aggregateByCategory: 대표단가는 최신 관측일 기준', () => {
  const items = [
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 150, currency: 'CNY', date: '2025-04-01' },
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 182, currency: 'CNY', date: '2026-08-01' },
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 138, currency: 'CNY', date: '2025-07-01' },
  ];
  const grouped = aggregateByCategory(items);
  const rows = grouped.led_module;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].representativePrice, 182);
  assert.strictEqual(rows[0].minPrice, 138);
  assert.strictEqual(rows[0].maxPrice, 182);
  assert.strictEqual(rows[0].observationCount, 3);
});

test('judgeConfidence: 기존 대표단가 대비 2배 이내면 approved', () => {
  const r = judgeConfidence(150, 100);
  assert.strictEqual(r.status, 'approved');
});
test('judgeConfidence: 기존 대비 2배 이상이면 pending', () => {
  const r = judgeConfidence(250, 100);
  assert.strictEqual(r.status, 'pending');
  assert.ok(r.reason);
});
test('judgeConfidence: 기존 대비 절반 이하도 pending', () => {
  const r = judgeConfidence(40, 100);
  assert.strictEqual(r.status, 'pending');
});
test('judgeConfidence: 비교 기준(기존 대표단가) 자체가 없으면 무조건 pending', () => {
  const r = judgeConfidence(100, null);
  assert.strictEqual(r.status, 'pending');
  assert.ok(r.reason.includes('신규'));
});
