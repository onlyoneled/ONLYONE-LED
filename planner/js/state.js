// planner/js/state.js — 프로젝트 모델, 화면 재생성, 저장/불러오기
import { GENERIC_PANELS, DEFAULT_PANEL_ID, makePanel, panelId as pid } from './catalog.js';
import { buildGrid, buildMix, gridFromMeters, decomposeIndoor, buildFromStrips, uid, DEFAULT_PORT_PX } from './engine.js';

const LS_PROJECTS = 'o1p.projects';
const LS_CURRENT = 'o1p.current';
const LS_CATALOG = 'o1p.catalog';
export const LS_PREFS = 'o1p.prefs';

export const SCREEN_TYPES = {
  main: { cols: 8, rows: 4 },
  side: { cols: 4, rows: 4 },
  totem: { cols: 2, rows: 5 },
  banner: { cols: 16, rows: 1 },
  dj: { cols: 5, rows: 1 },
  arc: { cols: 12, rows: 4, geometry: 'cylinder' },
  free: { cols: 3, rows: 2 },
};

function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

export function loadPrefs() { return lsGet(LS_PREFS, {}); }
export function savePrefs(p) { lsSet(LS_PREFS, p); }

// 사용자 패널 카탈로그는 프로젝트와 별도로 브라우저에 보관하고, 프로젝트 파일에도 사용 중인 사용자 패널을 함께 담는다.
export function loadCatalog() { return (lsGet(LS_CATALOG, []) || []).map((p) => makePanel({ ...p, builtin: false })); }
export function saveCatalog(list) { lsSet(LS_CATALOG, list.map((p) => ({ ...p, builtin: false }))); }

export function panelMap(custom) {
  const m = {};
  for (const p of GENERIC_PANELS) m[p.id] = p;
  for (const p of custom) m[p.id] = p;
  return m;
}

export function newScreen(type = 'main', idx = 1, panelId = DEFAULT_PANEL_ID) {
  const d = SCREEN_TYPES[type] || SCREEN_TYPES.free;
  return {
    id: uid('scr'), name: '', type, panelId, env: 'outdoor', mount: 'rental',
    geometry: d.geometry || 'flat', jointAngle: 5, arcAngle: 90,
    sizeMode: 'grid', cols: d.cols, rows: d.rows, wM: 4, hM: 2,
    mix: { on: false, smallId: pid('outdoor', '500x500', '3.9'), bigId: pid('outdoor', '500x1000', '3.9'), wM: 4, hM: 3.5, stockSmall: '', stockBig: '', goal: 'fewest', band: 'bottom', confirmed: false },
    cabs: [], edited: false,
    numbering: { dir: 'v', pattern: 'zigzag', start: 'bl' },
    cabling: { mode: 'auto', capacity: DEFAULT_PORT_PX, counts: [] },
    pos: { x: (idx - 1) * 5000, y: 0, z: 0, tilt: 0, yaw: 0 },
    canvas: { x: 0, y: 0 },
  };
}

export function newProject() {
  const s = newScreen('main', 1);
  const p = {
    v: 1, id: uid('prj'), name: '', client: '', rev: 'A',
    created: Date.now(), updated: Date.now(),
    screens: [s], activeId: s.id,
    canvas: { W: 1920, H: 1080, preset: '1920x1080', outputs: [{ name: 'Output 1', w: 1920, h: 1080 }], slices: [], groups: 0 },
    customPanels: [],
  };
  return p;
}

// 크기 설정으로 캐비닛 배열을 다시 만든다
export function regen(screen, panels) {
  const panel = panels[screen.panelId] || panels[DEFAULT_PANEL_ID];
  if (screen.mix.on) {
    const m = screen.mix;
    const r = buildMix({ small: panels[m.smallId], big: panels[m.bigId], smallId: m.smallId, bigId: m.bigId, wM: +m.wM || 0, hM: +m.hM || 0, stockSmall: m.stockSmall === '' ? Infinity : +m.stockSmall, stockBig: m.stockBig === '' ? Infinity : +m.stockBig, goal: m.goal, band: m.band });
    screen.cabs = r.cabs;
    screen.mixInfo = { warnings: r.warnings, bigRows: r.bigRows, smallRows: r.smallRows, cols: r.cols, shortBig: r.shortBig || 0, shortSmall: r.shortSmall || 0 };
  } else if (panel.env === 'indoor' && screen.sizeMode === 'meters') {
    // 실내형: 목표 크기에 맞춰 보조 캐비닛까지 자동 조합
    const d = decomposeIndoor(panel.h, (+screen.wM || 0) * 1000, (+screen.hM || 0) * 1000);
    screen.cabs = buildFromStrips(d.cols, d.rows, (w, h) => pid('indoor', `${w}x${h}`, panel.pitchKey));
    screen.cols = d.cols.length; screen.rows = d.rows.length;
    screen.mixInfo = null;
  } else {
    if (screen.sizeMode === 'meters') {
      const g = gridFromMeters(panel, +screen.wM || 0, +screen.hM || 0);
      screen.cols = g.cols; screen.rows = g.rows;
    }
    screen.cols = Math.max(1, Math.min(200, Math.round(+screen.cols || 1)));
    screen.rows = Math.max(1, Math.min(200, Math.round(+screen.rows || 1)));
    screen.cabs = buildGrid(screen.panelId, panel, screen.cols, screen.rows);
    screen.mixInfo = null;
  }
  screen.edited = false;
}

export function normalizeProject(p) {
  const base = newProject();
  const out = { ...base, ...p, canvas: { ...base.canvas, ...(p.canvas || {}) } };
  out.screens = (p.screens || []).map((s, i) => {
    const d = newScreen(s.type || 'main', i + 1);
    return { ...d, ...s, mix: { ...d.mix, ...(s.mix || {}) }, numbering: { ...d.numbering, ...(s.numbering || {}) }, cabling: { ...d.cabling, ...(s.cabling || {}) }, pos: { ...d.pos, ...(s.pos || {}) }, canvas: { ...d.canvas, ...(s.canvas || {}) } };
  });
  if (!out.screens.length) out.screens = base.screens;
  if (!out.screens.find((s) => s.id === out.activeId)) out.activeId = out.screens[0].id;
  out.customPanels = (p.customPanels || []).map((x) => makePanel({ ...x, builtin: false }));
  return out;
}

export function listSaved() { return lsGet(LS_PROJECTS, []) || []; }

export function saveProject(p) {
  p.updated = Date.now();
  const all = listSaved().filter((x) => x.id !== p.id);
  all.unshift(JSON.parse(JSON.stringify(p)));
  lsSet(LS_PROJECTS, all.slice(0, 50));
  lsSet(LS_CURRENT, p.id);
}

export function deleteSaved(id) { lsSet(LS_PROJECTS, listSaved().filter((x) => x.id !== id)); }

export function loadCurrent() {
  const id = lsGet(LS_CURRENT, null);
  const all = listSaved();
  const p = all.find((x) => x.id === id) || null;
  return p ? normalizeProject(p) : null;
}

export function duplicateProject(p, suffix) {
  const c = JSON.parse(JSON.stringify(p));
  c.id = uid('prj');
  c.name = (p.name || '') + ' (' + suffix + ')';
  c.created = Date.now();
  return normalizeProject(c);
}

export function download(filename, text, type = 'application/json') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result) });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    inp.click();
  });
}

export function safeName(s) { return (s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project'; }
