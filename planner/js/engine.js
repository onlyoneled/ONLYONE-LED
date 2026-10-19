// planner/js/engine.js — 순수 계산 모듈 (DOM 의존 없음, Node 테스트 가능)
// 좌표계: 캐비닛 x,y 는 mm, 원점은 화면 왼쪽 위, x→오른쪽, y→아래. 곡면은 전개(펼친) 평면 기준.

export const DEFAULT_PORT_PX = 650000;

let _uid = 0;
export function uid(prefix = 'c') { _uid += 1; return prefix + Date.now().toString(36) + _uid.toString(36); }

export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

// 회전을 반영한 캐비닛 크기
export function cabDims(cab, panel) {
  const r = cab.rot === 90 || cab.rot === 270;
  return r
    ? { w: panel.h, h: panel.w, px: panel.py, py: panel.px }
    : { w: panel.w, h: panel.h, px: panel.px, py: panel.py };
}

export function buildGrid(panelId, panel, cols, rows) {
  const cabs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cabs.push({ id: uid(), p: panelId, x: c * panel.w, y: r * panel.h, rot: 0 });
    }
  }
  return cabs;
}

export function gridFromMeters(panel, wM, hM) {
  return {
    cols: Math.max(1, Math.round((wM * 1000) / panel.w)),
    rows: Math.max(1, Math.round((hM * 1000) / panel.h)),
  };
}

// 소형+대형 혼합 배치. 두 패널은 가로 폭이 같고, 대형 높이가 소형 높이의 정수배여야 한다.
// goal: fewest | stock | preferBig | preferSmall, band: top | bottom
export function buildMix({ small, big, smallId, bigId, wM, hM, stockSmall = Infinity, stockBig = Infinity, goal = 'fewest', band = 'bottom' }) {
  const warnings = [];
  if (!small || !big) return { cabs: [], cols: 0, bigRows: 0, smallRows: 0, counts: {}, warnings: ['mixMissing'] };
  const k = big.h / small.h;
  if (small.w !== big.w || !Number.isInteger(k) || k < 2) {
    return { cabs: [], cols: 0, bigRows: 0, smallRows: 0, counts: {}, warnings: ['mixIncompatible'] };
  }
  const cols = Math.max(1, Math.round((wM * 1000) / small.w));
  const units = Math.max(1, Math.round((hM * 1000) / small.h));
  const sS = Number.isFinite(+stockSmall) && stockSmall !== '' && stockSmall !== null ? +stockSmall : Infinity;
  const sB = Number.isFinite(+stockBig) && stockBig !== '' && stockBig !== null ? +stockBig : Infinity;

  let bigRows;
  if (goal === 'preferSmall') bigRows = 0;
  else bigRows = Math.floor(units / k);

  if (goal === 'stock') {
    // 대형 재고가 모자라면 대형 줄을 소형 k줄로 바꾼다
    while (bigRows > 0 && bigRows * cols > sB) bigRows -= 1;
    // 소형 재고가 모자라면 가능한 만큼 대형으로 되돌린다
    while ((units - bigRows * k) * cols > sS && (bigRows + 1) * k <= units && (bigRows + 1) * cols <= sB) bigRows += 1;
  }
  const smallRows = units - bigRows * k;

  const cabs = [];
  const smallH = smallRows * small.h;
  const bigTop = band === 'top' ? smallH : 0;
  const smallTop = band === 'top' ? 0 : bigRows * big.h;
  for (let r = 0; r < bigRows; r++) for (let c = 0; c < cols; c++) {
    cabs.push({ id: uid(), p: bigId, x: c * big.w, y: bigTop + r * big.h, rot: 0 });
  }
  for (let r = 0; r < smallRows; r++) for (let c = 0; c < cols; c++) {
    cabs.push({ id: uid(), p: smallId, x: c * small.w, y: smallTop + r * small.h, rot: 0 });
  }
  const nBig = bigRows * cols, nSmall = smallRows * cols;
  if (nBig > sB) warnings.push('stockBigShort');
  if (nSmall > sS) warnings.push('stockSmallShort');
  return { cabs, cols, bigRows, smallRows, counts: { [bigId]: nBig, [smallId]: nSmall }, shortBig: Math.max(0, nBig - sB), shortSmall: Math.max(0, nSmall - sS), warnings };
}

// 목표 비율에 가까운 열×행 조합 추천 (분수 약분으로 중복 제거)
export function ratioSuggestions(cabPxW, cabPxH, target = 16 / 9, { maxCols = 40, maxRows = 24, limit = 4 } = {}) {
  const seen = new Set();
  const out = [];
  for (let c = 1; c <= maxCols; c++) {
    for (let r = 1; r <= maxRows; r++) {
      const ratio = (c * cabPxW) / (r * cabPxH);
      const g = gcd(c, r);
      const key = c / g + ':' + r / g;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cols: c, rows: r, err: ratio / target - 1 });
    }
  }
  out.sort((a, b) => Math.abs(a.err) - Math.abs(b.err) || (a.cols * a.rows) - (b.cols * b.rows));
  return out.slice(0, limit);
}

export function bbox(cabs, panels) {
  if (!cabs.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cabs) {
    const d = cabDims(c, panels[c.p]);
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + d.w); y1 = Math.max(y1, c.y + d.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// 캐비닛별 픽셀 위치 (화면 왼쪽 위 기준). 기준 피치는 가장 많이 쓰인 패널.
export function pixelMap(cabs, panels) {
  const b = bbox(cabs, panels);
  const freq = {};
  for (const c of cabs) freq[c.p] = (freq[c.p] || 0) + 1;
  const refId = Object.keys(freq).sort((a, z) => freq[z] - freq[a])[0];
  const ref = panels[refId];
  const ppx = ref ? ref.w / ref.px : 1;
  const ppy = ref ? ref.h / ref.py : 1;
  const map = {};
  let W = 0, H = 0;
  for (const c of cabs) {
    const d = cabDims(c, panels[c.p]);
    const x = Math.round((c.x - b.x) / ppx), y = Math.round((c.y - b.y) / ppy);
    map[c.id] = { x, y, w: d.px, h: d.py };
    W = Math.max(W, x + d.px); H = Math.max(H, y + d.py);
  }
  return { map, W, H, pitchX: ppx, pitchY: ppy };
}

export function ratioLabel(W, H) {
  if (!W || !H) return '—';
  const g = gcd(W, H);
  const a = W / g, b = H / g;
  if (a <= 32 && b <= 32) return a + ':' + b;
  return (W / H).toFixed(2) + ':1';
}

function sumOrNull(cabs, panels, key) {
  let s = 0;
  for (const c of cabs) {
    const v = panels[c.p] && panels[c.p][key];
    if (v === null || v === undefined || !Number.isFinite(+v)) return null;
    s += +v;
  }
  return s;
}

export function summarize(cabs, panels) {
  const b = bbox(cabs, panels);
  const pm = pixelMap(cabs, panels);
  let area = 0, totalPx = 0;
  const counts = {};
  for (const c of cabs) {
    const d = cabDims(c, panels[c.p]);
    area += d.w * d.h;
    totalPx += d.px * d.py;
    counts[c.p] = (counts[c.p] || 0) + 1;
  }
  const holes = cabs.length > 0 && Math.abs(b.w * b.h - area) > 1;
  const weight = sumOrNull(cabs, panels, 'weight');
  const pMax = sumOrNull(cabs, panels, 'pMax');
  const pAvg = sumOrNull(cabs, panels, 'pAvg');
  const cases = {};
  for (const id of Object.keys(counts)) {
    const pc = panels[id] && panels[id].perCase;
    if (pc) cases[id] = Math.ceil(counts[id] / pc);
  }
  return {
    widthMm: b.w, heightMm: b.h, count: cabs.length, counts,
    areaM2: area / 1e6, holes,
    resW: pm.W, resH: pm.H, totalPx,
    ratio: ratioLabel(pm.W, pm.H),
    vs169: pm.H ? (pm.W / pm.H) / (16 / 9) - 1 : 0,
    weight, pMax, pAvg,
    ampsSingle: pMax !== null ? pMax / 220 : null,
    ampsThree: pMax !== null ? pMax / (Math.sqrt(3) * 380) : null,
    cases,
  };
}

// 곡면: 캐비닛 사이 각도 a, 반지름 R (캐비닛 폭이 현)
export function curvature(geometry, cols, cabW, { jointAngle = 5, arcAngle = 90 } = {}) {
  if (geometry === 'flat' || cols < 1) return null;
  let a;
  if (geometry === 'cylinder') a = 360 / cols;
  else if (geometry === 'arc') a = arcAngle / cols;
  else a = Math.abs(jointAngle) || 0.0001;
  const rad = (a * Math.PI) / 180;
  const R = cabW / (2 * Math.sin(rad / 2));
  const total = a * cols;
  const half = Math.min(total, 360) * Math.PI / 360;
  const span = total >= 360 ? 2 * R : (total > 180 ? 2 * R : 2 * R * Math.sin(half));
  const depth = R - R * Math.cos(half);
  return { jointAngle: a, radius: R, totalAngle: total, span, depth, inward: geometry !== 'convex' };
}

export function curveWarnings(geom, panel, curv) {
  const w = [];
  if (!curv) return w;
  if (panel.curve !== 'yes') w.push('curveUnsupported');
  if (panel.angMin !== null && panel.angMax !== null) {
    const a = geom === 'convex' ? -curv.jointAngle : curv.jointAngle;
    if (a < Math.min(panel.angMin, panel.angMax) - 1e-6 || a > Math.max(panel.angMin, panel.angMax) + 1e-6) w.push('curveOutOfRange');
  }
  if (panel.rMin && curv.radius < panel.rMin) w.push('curveRadiusSmall');
  return w;
}

// 번호 매기기 순서. dir: h(가로 줄) | v(세로 줄), pattern: zigzag | raster, start: tl|tr|bl|br
export function orderCabs(cabs, panels, { dir = 'v', pattern = 'zigzag', start = 'bl' } = {}) {
  if (!cabs.length) return [];
  const items = cabs.map((c) => {
    const d = cabDims(c, panels[c.p]);
    return { id: c.id, cx: c.x + d.w / 2, cy: c.y + d.h / 2, w: d.w, h: d.h };
  });
  const along = dir === 'h' ? 'cx' : 'cy';
  const across = dir === 'h' ? 'cy' : 'cx';
  const size = dir === 'h' ? 'h' : 'w';
  const minSize = Math.min(...items.map((i) => i[size]));
  // across 축으로 줄 묶기
  const sorted = [...items].sort((a, b) => a[across] - b[across]);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it[across] - last.key) < minSize / 2) last.items.push(it);
    else lines.push({ key: it[across], items: [it] });
  }
  const fromBottom = start === 'bl' || start === 'br';
  const fromRight = start === 'tr' || start === 'br';
  // 줄 순서: 가로 줄이면 위/아래, 세로 줄이면 왼/오른쪽
  const reverseLines = dir === 'h' ? fromBottom : fromRight;
  if (reverseLines) lines.reverse();
  // 첫 줄 진행 방향
  let forward = dir === 'h' ? !fromRight : !fromBottom; // forward = 증가 방향 (오른쪽 / 아래)
  const out = [];
  lines.forEach((ln) => {
    ln.items.sort((a, b) => (forward ? a[along] - b[along] : b[along] - a[along]));
    for (const it of ln.items) out.push(it.id);
    if (pattern === 'zigzag') forward = !forward;
  });
  return out;
}

// 포트 배분. items: [{id, px}] 순서대로. mode: auto | balanced | manual
export function assignPorts(items, { capacity = DEFAULT_PORT_PX, mode = 'auto', manualCounts = [] } = {}) {
  const cap = Math.max(1, +capacity || DEFAULT_PORT_PX);
  const total = items.reduce((s, i) => s + i.px, 0);
  const minPorts = items.length ? Math.max(1, Math.ceil(total / cap)) : 0;
  const greedy = (limit) => {
    const ports = [];
    let cur = null;
    for (const it of items) {
      if (!cur || (cur.px + it.px > limit && cur.ids.length)) { cur = { ids: [], px: 0 }; ports.push(cur); }
      cur.ids.push(it.id); cur.px += it.px;
    }
    return ports;
  };
  let ports;
  let unassigned = [];
  if (mode === 'manual') {
    ports = [];
    let i = 0;
    for (const n of manualCounts) {
      const p = { ids: [], px: 0 };
      for (let k = 0; k < n && i < items.length; k++, i++) { p.ids.push(items[i].id); p.px += items[i].px; }
      ports.push(p);
    }
    unassigned = items.slice(i).map((x) => x.id);
  } else {
    ports = greedy(cap);
    if (mode === 'balanced' && ports.length > 1) {
      // 같은 포트 수를 유지하면서 가장 무거운 포트를 최소화 (이분 탐색)
      const n = ports.length;
      let lo = Math.max(...items.map((x) => x.px)), hi = cap;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (greedy(mid).length <= n) hi = mid; else lo = mid + 1;
      }
      ports = greedy(lo);
    }
  }
  ports.forEach((p, i) => { p.n = i + 1; p.over = p.px > cap; });
  return { ports, minPorts, total, capacity: cap, unassigned };
}

// 직사각형 네 꼭짓점을 중심 기준 회전
export function rectCorners({ x, y, w, h }, deg = 0) {
  const cx = x + w / 2, cy = y + h / 2;
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
}

// 그룹 회전: 각 슬라이스 출력 중심을 공통 중심으로 돌리고 개별 회전각을 더한다
export function rotateGroup(slices, deg) {
  if (!slices.length) return;
  let sx = 0, sy = 0;
  for (const s of slices) { sx += s.out.x + s.out.w / 2; sy += s.out.y + s.out.h / 2; }
  const gx = sx / slices.length, gy = sy / slices.length;
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  for (const s of slices) {
    const cx = s.out.x + s.out.w / 2, cy = s.out.y + s.out.h / 2;
    const dx = cx - gx, dy = cy - gy;
    const nx = gx + dx * cos - dy * sin, ny = gy + dx * sin + dy * cos;
    s.out.x = Math.round(nx - s.out.w / 2);
    s.out.y = Math.round(ny - s.out.h / 2);
    s.rot = normDeg((s.rot || 0) + deg);
  }
}

export function normDeg(d) { let x = ((d % 360) + 360) % 360; if (x > 180) x -= 360; return Math.round(x * 100) / 100; }

// 화면들을 콘텐츠 캔버스에 왼쪽부터 나란히 배치 (1:1)
export function packCanvas(sizes) {
  let x = 0, H = 0;
  const pos = sizes.map((s) => { const p = { x, y: 0 }; x += s.w; H = Math.max(H, s.h); return p; });
  return { pos, W: x, H };
}

// 슬라이스 생성. screens: [{id, name, offX, offY, W, H, cabs:[{id, label, x, y, w, h}]}]
export function buildSlices(screens, mode = 'screen', output = 0) {
  const out = [];
  for (const s of screens) {
    if (mode === 'screen') {
      const r = { x: s.offX, y: s.offY, w: s.W, h: s.H };
      out.push({ id: uid('s'), name: s.name, in: { ...r }, out: { ...r }, output, rot: 0, group: null });
    } else {
      for (const c of s.cabs) {
        const r = { x: s.offX + c.x, y: s.offY + c.y, w: c.w, h: c.h };
        out.push({ id: uid('s'), name: s.name + ' ' + c.label, in: { ...r }, out: { ...r }, output, rot: 0, group: null });
      }
    }
  }
  return out;
}

export function slicesCSV(slices, outputs) {
  const head = ['name', 'in_x', 'in_y', 'in_w', 'in_h', 'output', 'out_x', 'out_y', 'out_w', 'out_h', 'rotation'];
  const esc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const rows = slices.map((s) => [s.name, s.in.x, s.in.y, s.in.w, s.in.h, (outputs[s.output] || {}).name || s.output, s.out.x, s.out.y, s.out.w, s.out.h, s.rot || 0].map(esc).join(','));
  return [head.join(','), ...rows].join('\n');
}
