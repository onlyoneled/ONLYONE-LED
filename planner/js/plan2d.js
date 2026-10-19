// planner/js/plan2d.js — 도면 / 결선도 / 씬 에디터 SVG 문자열 생성
import { cabDims, bbox, curvature } from './engine.js';

export const PORT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#be123c'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtM = (mm) => { const m = mm / 1000; return (Math.round(m * 100) / 100).toString(); };

function edges(vals) { return [...new Set(vals.map((v) => Math.round(v)))].sort((a, b) => a - b); }

// 도면 SVG. opts: { mode:'cabs'|'cable', dims, nums, labels:{id:'1'}, portOf:{id:{n,i}}, ports, order, pxMap, slots:[{x,y,w,h}], selected:Set }
export function planSvg(cabs, panels, opts = {}) {
  const b = bbox(cabs, panels);
  const unit = Math.max(b.w, b.h, 500);
  const pad = opts.dims ? unit * 0.16 : unit * 0.05;
  const slots = opts.slots || [];
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  for (const s of slots) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); }
  const vb = [x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2];
  const minCab = Math.min(...cabs.map((c) => { const d = cabDims(c, panels[c.p]); return Math.min(d.w, d.h); }), 500);
  const fs = Math.max(minCab * 0.22, unit * 0.012);
  const sw = unit * 0.0025;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" class="plan-svg" font-family="IBM Plex Mono, ui-monospace, monospace">`);

  for (const s of slots) {
    parts.push(`<g class="slot" data-slot="${s.x},${s.y}"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="var(--slot-fill)" stroke="var(--accent)" stroke-width="${sw}" stroke-dasharray="${sw * 4} ${sw * 3}"/><text x="${s.x + s.w / 2}" y="${s.y + s.h / 2}" font-size="${fs * 1.6}" fill="var(--accent)" text-anchor="middle" dominant-baseline="central">+</text></g>`);
  }

  const panelIds = [...new Set(cabs.map((c) => c.p))];
  for (const c of cabs) {
    const d = cabDims(c, panels[c.p]);
    const port = opts.mode === 'cable' && opts.portOf ? opts.portOf[c.id] : null;
    const color = port ? PORT_COLORS[(port.n - 1) % PORT_COLORS.length] : null;
    const alt = panelIds.length > 1 && panelIds.indexOf(c.p) > 0;
    const fill = color ? color + '22' : (alt ? 'var(--cab-alt)' : 'var(--cab)');
    const stroke = color || 'var(--cab-line)';
    const sel = opts.selected && opts.selected.has(c.id);
    parts.push(`<g class="cab${sel ? ' sel' : ''}" data-cab="${c.id}"><rect x="${c.x}" y="${c.y}" width="${d.w}" height="${d.h}" fill="${fill}" stroke="${sel ? 'var(--accent)' : stroke}" stroke-width="${sel ? sw * 3 : sw}"/>`);
    let label = null;
    if (opts.mode === 'cable' && port) label = `P${port.n}:${String(port.i).padStart(2, '0')}`;
    else if (opts.nums && opts.labels) label = opts.labels[c.id];
    if (label) {
      const f = opts.mode === 'cable' ? fs * 0.62 : fs;
      parts.push(`<text x="${c.x + d.w / 2}" y="${c.y + d.h / 2}" font-size="${f}" fill="${color || 'var(--ink)'}" text-anchor="middle" dominant-baseline="central" font-weight="600">${esc(label)}</text>`);
    }
    if (c.rot) parts.push(`<text x="${c.x + d.w - fs * 0.3}" y="${c.y + fs * 0.7}" font-size="${fs * 0.55}" fill="var(--mute)" text-anchor="end">↻</text>`);
    parts.push('</g>');
  }

  // 결선 경로
  if (opts.mode === 'cable' && opts.ports) {
    const center = {};
    for (const c of cabs) { const d = cabDims(c, panels[c.p]); center[c.id] = [c.x + d.w / 2, c.y + d.h / 2]; }
    for (const p of opts.ports) {
      const color = PORT_COLORS[(p.n - 1) % PORT_COLORS.length];
      const pts = p.ids.map((id) => center[id]).filter(Boolean);
      if (!pts.length) continue;
      const off = fs * 0.75;
      const path = pts.map(([x, y]) => `${x},${y + off}`).join(' ');
      parts.push(`<polyline points="${path}" fill="none" stroke="${color}" stroke-width="${sw * 2.2}" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const mx = (ax + bx) / 2, my = (ay + by) / 2 + off;
        const ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
        parts.push(`<path d="M${-fs * 0.22},${-fs * 0.18} L${fs * 0.2},0 L${-fs * 0.22},${fs * 0.18}" transform="translate(${mx},${my}) rotate(${ang})" fill="none" stroke="${color}" stroke-width="${sw * 2}"/>`);
      }
      const [sx, sy] = pts[0];
      parts.push(`<g><circle cx="${sx}" cy="${sy + off}" r="${fs * 0.42}" fill="${color}"/><text x="${sx}" y="${sy + off}" font-size="${fs * 0.36}" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="700">IN</text></g>`);
    }
  }

  if (opts.dims && cabs.length) {
    const xs = edges(cabs.flatMap((c) => { const d = cabDims(c, panels[c.p]); return [c.x, c.x + d.w]; }));
    const ys = edges(cabs.flatMap((c) => { const d = cabDims(c, panels[c.p]); return [c.y, c.y + d.h]; }));
    const g1 = pad * 0.35, g2 = pad * 0.72;
    // side: -1 = 위/왼쪽에 글자, +1 = 아래/오른쪽에 글자
    const dimLine = (xa, ya, xb, yb, txt, vertical, size, side = -1) => {
      const o = side < 0 ? -size * 0.4 : size * 1.1;
      const t = vertical
        ? `<text x="${xa + o}" y="${(ya + yb) / 2}" font-size="${size}" fill="var(--mute)" text-anchor="middle" transform="rotate(-90 ${xa + o} ${(ya + yb) / 2})">${esc(txt)}</text>`
        : `<text x="${(xa + xb) / 2}" y="${ya + o}" font-size="${size}" fill="var(--mute)" text-anchor="middle">${esc(txt)}</text>`;
      const tick = vertical
        ? `<line x1="${xa - size * 0.3}" y1="${ya}" x2="${xa + size * 0.3}" y2="${ya}"/><line x1="${xa - size * 0.3}" y1="${yb}" x2="${xa + size * 0.3}" y2="${yb}"/>`
        : `<line x1="${xa}" y1="${ya - size * 0.3}" x2="${xa}" y2="${ya + size * 0.3}"/><line x1="${xb}" y1="${ya - size * 0.3}" x2="${xb}" y2="${ya + size * 0.3}"/>`;
      return `<g stroke="var(--mute)" stroke-width="${sw}"><line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}"/>${tick}</g>${t}`;
    };
    const total = opts.pxMap ? ` · ${opts.pxMap.W} px` : '';
    const totalH = opts.pxMap ? ` · ${opts.pxMap.H} px` : '';
    parts.push(dimLine(b.x, b.y - g2, b.x + b.w, b.y - g2, `${fmtM(b.w)} m${total}`, false, fs * 0.9));
    parts.push(dimLine(b.x - g2, b.y, b.x - g2, b.y + b.h, `${fmtM(b.h)} m${totalH}`, true, fs * 0.9));
    const small = fs * 0.6;
    if (xs.length <= 41) for (let i = 1; i < xs.length; i++) parts.push(dimLine(xs[i - 1], b.y + b.h + g1, xs[i], b.y + b.h + g1, String(xs[i] - xs[i - 1]), false, small, 1));
    if (ys.length <= 41) for (let i = 1; i < ys.length; i++) parts.push(dimLine(b.x + b.w + g1, ys[i - 1], b.x + b.w + g1, ys[i], String(ys[i] - ys[i - 1]), true, small, 1));
  }
  parts.push('</svg>');
  return parts.join('');
}

// 화면 하나의 실제 외형 크기 (mm). 곡면이면 현 길이·깊이를 쓴다.
export function screenEnvelope(screen, panels, summary) {
  const panel = panels[screen.panelId];
  const curv = screen.geometry !== 'flat' && panel ? curvature(screen.geometry, Math.max(1, Math.round(summary.widthMm / panel.w)), panel.w, { jointAngle: screen.jointAngle, arcAngle: screen.arcAngle }) : null;
  return {
    devW: summary.widthMm, h: summary.heightMm,
    frontW: curv ? curv.span : summary.widthMm,
    depth: curv ? curv.depth : 100,
    curv,
  };
}

// 씬 에디터 SVG. view: front | top | side | developed
export function sceneSvg(project, panels, sums, opts = {}) {
  const view = opts.view || 'front';
  const items = project.screens.map((s) => {
    const sum = sums[s.id];
    const env = screenEnvelope(s, panels, sum);
    let x, y, w, h;
    if (view === 'front') { w = env.frontW; h = env.h; x = s.pos.x; y = -(s.pos.y + h); }
    else if (view === 'developed') { w = env.devW; h = env.h; x = s.pos.x; y = -(s.pos.y + h); }
    else if (view === 'top') { w = env.frontW; h = Math.max(env.depth, 80); x = s.pos.x; y = s.pos.z; }
    else { w = Math.max(env.depth, 80); h = env.h; x = s.pos.z; y = -(s.pos.y + h); }
    return { s, sum, env, x, y, w, h };
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); }
  if (view !== 'top') { y1 = Math.max(y1, 0); }
  const span = Math.max(x1 - x0, y1 - y0, 2000);
  const pad = span * 0.12;
  // 드래그 중에는 호출 측이 viewBox를 고정해서 넘긴다 (좌표가 흔들리지 않도록)
  const vb = opts.vb || [x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2];
  const fs = Math.max(vb[2], vb[3]) * 0.022 * 0.88, sw = Math.max(vb[2], vb[3]) * 0.0015 * 0.88;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" class="scene-svg" data-vb="${vb.join(',')}" font-family="Gothic A1, sans-serif">`];
  if (opts.showGrid) {
    const g = opts.grid && opts.grid > 0 ? opts.grid : 500;
    let step = g; while ((vb[2] / step) > 80) step *= 2;
    const gx0 = Math.floor(vb[0] / step) * step, gy0 = Math.floor(vb[1] / step) * step;
    const lines = [];
    for (let gx = gx0; gx <= vb[0] + vb[2]; gx += step) lines.push(`M${gx},${vb[1]}V${vb[1] + vb[3]}`);
    for (let gy = gy0; gy <= vb[1] + vb[3]; gy += step) lines.push(`M${vb[0]},${gy}H${vb[0] + vb[2]}`);
    parts.push(`<path d="${lines.join('')}" stroke="var(--grid)" stroke-width="${sw * 0.7}" fill="none"/>`);
  }
  if (view !== 'top') parts.push(`<line x1="${vb[0]}" y1="0" x2="${vb[0] + vb[2]}" y2="0" stroke="var(--mute)" stroke-width="${sw * 2}"/><text x="${vb[0] + fs * 0.5}" y="${fs * 1.2}" font-size="${fs * 0.8}" fill="var(--mute)">${esc(opts.floorLabel || 'FLOOR')} 0 m</text>`);
  for (const it of items) {
    const sel = it.s.id === opts.selectedId;
    const label = it.s.name || opts.typeLabel(it.s.type);
    parts.push(`<g class="scr${sel ? ' sel' : ''}" data-scr="${it.s.id}">`);
    if (view === 'top' && it.env.curv) {
      // 위에서 본 곡면: 호를 그린다
      const c = it.env.curv, R = c.radius, tot = Math.min(c.totalAngle, 360) * Math.PI / 180;
      const cx = it.x + it.w / 2, n = 48, pts = [];
      for (let i = 0; i <= n; i++) {
        const a = -tot / 2 + (tot * i) / n;
        const px = cx + R * Math.sin(a);
        const pz = c.inward ? it.y + (R - R * Math.cos(a)) * -1 + c.depth : it.y + (R - R * Math.cos(a));
        pts.push(`${px},${pz}`);
      }
      parts.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="transparent"/>`);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${sel ? 'var(--accent)' : 'var(--ink)'}" stroke-width="${sw * 5}"/>`);
    } else {
      const tr = view === 'top' && it.s.pos.yaw ? ` transform="rotate(${it.s.pos.yaw} ${it.x + it.w / 2} ${it.y + it.h / 2})"` : (view === 'side' && it.s.pos.tilt ? ` transform="rotate(${-it.s.pos.tilt} ${it.x + it.w / 2} ${it.y + it.h})"` : '');
      parts.push(`<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${sel ? 'var(--accent-soft)' : 'var(--cab)'}" stroke="${sel ? 'var(--accent)' : 'var(--cab-line)'}" stroke-width="${sel ? sw * 3 : sw * 1.5}"${tr}/>`);
    }
    if (opts.labels) parts.push(`<text x="${it.x + it.w / 2}" y="${it.y + it.h / 2}" font-size="${fs}" fill="var(--ink)" text-anchor="middle" dominant-baseline="central" font-weight="700" pointer-events="none">${esc(label)}</text>`);
    if (opts.dims) {
      const wTxt = view === 'side' ? fmtM(it.w) : fmtM(it.w);
      parts.push(`<text x="${it.x + it.w / 2}" y="${it.y - fs * 0.5}" font-size="${fs * 0.75}" fill="var(--mute)" text-anchor="middle" pointer-events="none">${wTxt} m</text>`);
      parts.push(`<text x="${it.x + it.w + fs * 0.4}" y="${it.y + it.h / 2}" font-size="${fs * 0.75}" fill="var(--mute)" dominant-baseline="central" pointer-events="none">${fmtM(it.h)} m</text>`);
    }
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('');
}

// 슬라이스 미리보기 (캔버스 / 출력)
export function slicesSvg(W, H, rects, { selected = new Set(), useOut = false, rotKey = 'rot' } = {}) {
  const span = Math.max(W, H, 1);
  const fs = span * 0.022, sw = span * 0.0015;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-span * 0.02} ${-span * 0.02} ${W + span * 0.04} ${H + span * 0.04}" class="slice-svg" font-family="IBM Plex Mono, monospace">`];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="var(--panel-2)" stroke="var(--mute)" stroke-width="${sw * 1.5}" stroke-dasharray="${sw * 6} ${sw * 4}"/>`);
  rects.forEach((s, i) => {
    const r = useOut ? s.out : s.in;
    const rot = useOut ? (s[rotKey] || 0) : 0;
    const sel = selected.has(s.id);
    const color = PORT_COLORS[i % PORT_COLORS.length];
    parts.push(`<g transform="rotate(${rot} ${r.x + r.w / 2} ${r.y + r.h / 2})"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${color}${sel ? '55' : '22'}" stroke="${color}" stroke-width="${sel ? sw * 3 : sw * 1.2}"/>`);
    parts.push(`<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="${Math.min(fs, r.h * 0.3, r.w * 0.12)}" fill="var(--ink)" text-anchor="middle" dominant-baseline="central">${esc(s.name)}</text></g>`);
  });
  parts.push('</svg>');
  return parts.join('');
}
