// admin-tools/led-layout-engine.test.js
const assert = require('assert');
const { computeLED, decompWidth, decompHeight, fmt1 } = require('./led-layout-engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch(e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// ── decompWidth ──────────────────────────────────────────────────────────
test('decompWidth(2000): usable=1920 discard=80 cols=[640,640,640]', () => {
  const r = decompWidth(2000);
  assert.strictEqual(r.usable, 1920);
  assert.strictEqual(r.discard, 80);
  assert.deepStrictEqual(r.cols, [640, 640, 640]);
});

test('decompWidth(3840): usable=3840 discard=0 cols=[640×6]', () => {
  const r = decompWidth(3840);
  assert.strictEqual(r.usable, 3840);
  assert.strictEqual(r.discard, 0);
  assert.strictEqual(r.cols.length, 6);
  assert.ok(r.cols.every(c => c === 640));
});

// ── decompHeight ─────────────────────────────────────────────────────────
test('decompHeight(1500): usable=1440 discard=60 rows=[480,480,480]', () => {
  const r = decompHeight(1500);
  assert.strictEqual(r.usable, 1440);
  assert.strictEqual(r.discard, 60);
  assert.deepStrictEqual(r.rows, [480, 480, 480]);
});

test('decompHeight(1600): usable=1600 discard=0 rows=[480,480,640]', () => {
  const r = decompHeight(1600);
  assert.strictEqual(r.usable, 1600);
  assert.strictEqual(r.discard, 0);
  assert.deepStrictEqual(r.rows, [480, 480, 640]);
});

// ── computeLED full cases ─────────────────────────────────────────────────
test('2000×1500 → usable 1920×1440, waste 80×60, 640×480 × 9', () => {
  const r = computeLED({ modelId: 'p2.5', W: 2000, H: 1500 });
  assert.strictEqual(r.usableW, 1920);
  assert.strictEqual(r.usableH, 1440);
  assert.strictEqual(r.discardW, 80);
  assert.strictEqual(r.discardH, 60);
  assert.strictEqual(r.totalCabinets, 9);
  const base = r.cabinets.find(c => c.w === 640 && c.h === 480);
  assert.ok(base, '640×480 cabinet entry must exist');
  assert.strictEqual(base.n, 9);
});

test('3840×1600 → waste 0, 640×640×6 + 640×480×12 = 18 total', () => {
  const r = computeLED({ modelId: 'p2.5', W: 3840, H: 1600 });
  assert.strictEqual(r.discardW, 0);
  assert.strictEqual(r.discardH, 0);
  assert.strictEqual(r.totalCabinets, 18);
  const c640 = r.cabinets.find(c => c.w === 640 && c.h === 640);
  const c480 = r.cabinets.find(c => c.w === 640 && c.h === 480);
  assert.ok(c640, '640×640 must exist');
  assert.ok(c480, '640×480 must exist');
  assert.strictEqual(c640.n, 6);
  assert.strictEqual(c480.n, 12);
});

test('3200×3200 → waste 0, 640×480×30 + 640×320×5 = 35 total', () => {
  const r = computeLED({ modelId: 'p2.5', W: 3200, H: 3200 });
  assert.strictEqual(r.discardW, 0);
  assert.strictEqual(r.discardH, 0);
  assert.strictEqual(r.totalCabinets, 35);
  const c480 = r.cabinets.find(c => c.w === 640 && c.h === 480);
  const c320 = r.cabinets.find(c => c.w === 640 && c.h === 320);
  assert.ok(c480); assert.strictEqual(c480.n, 30);
  assert.ok(c320); assert.strictEqual(c320.n, 5);
});

test('640×480 @ P2.0 → 6 modules, power ≈ 200W', () => {
  const r = computeLED({ modelId: 'p2.0', W: 640, H: 480 });
  assert.strictEqual(r.totalModules, 6);
  assert.ok(Math.abs(r.power - 199.8) < 0.01, `power=${r.power}`);
});

test('640×320 @ P2.5 → 4 modules, power = 140W', () => {
  const r = computeLED({ modelId: 'p2.5', W: 640, H: 320 });
  assert.strictEqual(r.totalModules, 4);
  assert.strictEqual(r.power, 140);
});

test('320×480 @ P1.86 → 3 modules, power ≈ 100W', () => {
  const r = computeLED({ modelId: 'p1.86', W: 320, H: 480 });
  assert.strictEqual(r.totalModules, 3);
  assert.ok(Math.abs(r.power - 99.9) < 0.01, `power=${r.power}`);
});

test('4480×2400 @ P2.5 → 640×480 × 35, weight = 245.0 kg', () => {
  const r = computeLED({ modelId: 'p2.5', W: 4480, H: 2400 });
  assert.strictEqual(r.totalCabinets, 35);
  const base = r.cabinets.find(c => c.w === 640 && c.h === 480);
  assert.ok(base); assert.strictEqual(base.n, 35);
  assert.strictEqual(fmt1(r.totalWeight), '245.0');
});

console.log(`\n${passed} tests passed`);
