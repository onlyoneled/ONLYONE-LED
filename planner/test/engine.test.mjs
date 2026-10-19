// planner/test/engine.test.mjs — 실행: node planner/test/engine.test.mjs
import assert from 'node:assert';
import { GENERIC_PANELS } from '../js/catalog.js';
import {
  buildGrid, gridFromMeters, buildMix, ratioSuggestions, summarize, curvature,
  orderCabs, assignPorts, rectCorners, rotateGroup, packCanvas, buildSlices, ratioLabel, slicesCSV,
} from '../js/engine.js';

const panels = Object.fromEntries(GENERIC_PANELS.map((p) => [p.id, p]));
const P1000 = panels['g1000-p39'], P500 = panels['g500-p39'];

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

test('8×4 그리드 500×1000 P3.9: 4m×4m, 32개, 1024×1024, 16㎡', () => {
  const cabs = buildGrid('g1000-p39', P1000, 8, 4);
  const s = summarize(cabs, panels);
  assert.strictEqual(s.count, 32);
  assert.strictEqual(s.widthMm, 4000);
  assert.strictEqual(s.heightMm, 4000);
  assert.strictEqual(s.resW, 1024);
  assert.strictEqual(s.resH, 1024);
  assert.strictEqual(s.totalPx, 1048576);
  assert.strictEqual(s.areaM2, 16);
  assert.strictEqual(s.ratio, '1:1');
  assert.strictEqual(s.holes, false);
  assert.strictEqual(s.weight, null);
  assert.ok(Math.abs(s.vs169 - (-0.4375)) < 1e-9);
});

test('미터 입력 → 열/행 반올림', () => {
  assert.deepStrictEqual(gridFromMeters(P1000, 4, 4), { cols: 8, rows: 4 });
  assert.deepStrictEqual(gridFromMeters(P1000, 5.2, 2.6), { cols: 10, rows: 3 });
});

test('16:9 추천: 32×9, 39×11, 25×7, 18×5', () => {
  const r = ratioSuggestions(128, 256);
  assert.deepStrictEqual(r.map((x) => x.cols + '×' + x.rows), ['32×9', '39×11', '25×7', '18×5']);
  assert.ok(Math.abs(r[0].err) < 1e-12);
});

test('비율 라벨', () => {
  assert.strictEqual(ratioLabel(1920, 1080), '16:9');
  assert.strictEqual(ratioLabel(1000, 333), '3.00:1');
});

test('혼합 배치: 4m×3.5m → 대형 3줄 + 소형 1줄 (아래)', () => {
  const m = buildMix({ small: P500, big: P1000, smallId: 'g500-p39', bigId: 'g1000-p39', wM: 4, hM: 3.5, band: 'bottom' });
  assert.strictEqual(m.cols, 8);
  assert.strictEqual(m.bigRows, 3);
  assert.strictEqual(m.smallRows, 1);
  const s = summarize(m.cabs, panels);
  assert.strictEqual(s.heightMm, 3500);
  assert.strictEqual(s.holes, false);
  const smallYs = m.cabs.filter((c) => c.p === 'g500-p39').map((c) => c.y);
  assert.ok(smallYs.every((y) => y === 3000));
});

test('혼합 배치: 재고 우선 → 대형 재고 부족 시 소형으로 대체', () => {
  const m = buildMix({ small: P500, big: P1000, smallId: 's', bigId: 'b', wM: 4, hM: 3, goal: 'stock', stockBig: 10, stockSmall: 100 });
  // 대형 최대 10개 → 대형 1줄(8개), 나머지 4줄 소형
  assert.strictEqual(m.bigRows, 1);
  assert.strictEqual(m.smallRows, 4);
  assert.deepStrictEqual(m.warnings, []);
});

test('혼합 배치: 폭이 다르면 거부', () => {
  const m = buildMix({ small: panels['g640-p4'], big: P1000, smallId: 'a', bigId: 'b', wM: 4, hM: 3 });
  assert.deepStrictEqual(m.warnings, ['mixIncompatible']);
});

test('곡률: 원통 8열 → 45°, 반지름', () => {
  const c = curvature('cylinder', 8, 500);
  assert.strictEqual(c.jointAngle, 45);
  assert.ok(Math.abs(c.radius - 500 / (2 * Math.sin(Math.PI / 8))) < 1e-9);
  assert.ok(Math.abs(c.depth - 2 * c.radius) < 1e-9);
  assert.strictEqual(curvature('flat', 8, 500), null);
});

test('번호: 세로 지그재그, 왼쪽 아래 시작 (8×4)', () => {
  const cabs = buildGrid('g1000-p39', P1000, 8, 4);
  const order = orderCabs(cabs, panels, { dir: 'v', pattern: 'zigzag', start: 'bl' });
  const at = (c, r) => cabs[r * 8 + c].id;
  assert.strictEqual(order[0], at(0, 3));
  assert.strictEqual(order[3], at(0, 0));
  assert.strictEqual(order[4], at(1, 0));
  assert.strictEqual(order[7], at(1, 3));
  assert.strictEqual(order[31], at(7, 3));
});

test('번호: 가로 일방향, 왼쪽 위 시작', () => {
  const cabs = buildGrid('g1000-p39', P1000, 3, 2);
  const order = orderCabs(cabs, panels, { dir: 'h', pattern: 'raster', start: 'tl' });
  assert.deepStrictEqual(order, cabs.map((c) => c.id));
});

test('포트 자동: 32×32768px → 19 + 13, 최소 2', () => {
  const items = Array.from({ length: 32 }, (_, i) => ({ id: 'c' + i, px: 32768 }));
  const r = assignPorts(items, { capacity: 650000 });
  assert.deepStrictEqual(r.ports.map((p) => p.ids.length), [19, 13]);
  assert.strictEqual(r.minPorts, 2);
  const b = assignPorts(items, { capacity: 650000, mode: 'balanced' });
  assert.deepStrictEqual(b.ports.map((p) => p.ids.length), [16, 16]);
});

test('포트 수동: 초과/미배정 표시', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, px: 100 }));
  const r = assignPorts(items, { capacity: 450, mode: 'manual', manualCounts: [5, 3] });
  assert.strictEqual(r.ports[0].over, true);
  assert.strictEqual(r.ports[1].over, false);
  assert.deepStrictEqual(r.unassigned, ['c8', 'c9']);
});

test('사각형 회전 90°', () => {
  const c = rectCorners({ x: 0, y: 0, w: 4, h: 2 }, 90).map((p) => p.map((v) => Math.round(v * 1e6) / 1e6));
  assert.deepStrictEqual(c[0], [3, -1]);
});

test('그룹 회전 180°: 두 슬라이스 자리 교환', () => {
  const s = [{ out: { x: 0, y: 0, w: 10, h: 10 }, rot: 0 }, { out: { x: 20, y: 0, w: 10, h: 10 }, rot: 0 }];
  rotateGroup(s, 180);
  assert.strictEqual(s[0].out.x, 20);
  assert.strictEqual(s[1].out.x, 0);
  assert.strictEqual(s[0].rot, 180);
});

test('캔버스 배치와 슬라이스', () => {
  const p = packCanvas([{ w: 1024, h: 1024 }, { w: 256, h: 512 }]);
  assert.deepStrictEqual(p, { pos: [{ x: 0, y: 0 }, { x: 1024, y: 0 }], W: 1280, H: 1024 });
  const sl = buildSlices([{ name: 'A', offX: 0, offY: 0, W: 10, H: 5, cabs: [{ label: '1', x: 0, y: 0, w: 5, h: 5 }, { label: '2', x: 5, y: 0, w: 5, h: 5 }] }], 'cabinet');
  assert.strictEqual(sl.length, 2);
  assert.deepStrictEqual(sl[1].in, { x: 5, y: 0, w: 5, h: 5 });
  assert.ok(slicesCSV(sl, [{ name: 'Out 1' }]).split('\n')[1].startsWith('A 1,0,0,5,5,Out 1'));
});

console.log(`\n${passed} passed`);
