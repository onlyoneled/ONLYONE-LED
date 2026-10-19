// planner/js/app.js — 화면 구성과 이벤트 연결
import { t, setLang, getLang, fmtNum } from './i18n.js';
import { GENERIC_PANELS, PANEL_FIELDS, makePanel, pitchOf, DEFAULT_PANEL_ID, ENVS, sizesFor, pitchesFor, mountsFor, panelId } from './catalog.js';
import * as E from './engine.js';
import * as S from './state.js';
import { planSvg, sceneSvg, slicesSvg, PORT_COLORS, screenEnvelope } from './plan2d.js';
import { buildArenaXml, mergeIntoArenaXml } from './resolume.js';

// ───────────────────────── 상태 ─────────────────────────
const prefs = Object.assign({
  mode: 'simple', theme: document.documentElement.getAttribute('data-theme') || 'light', lang: 'ko', tab: 'design',
  planMode: 'cabs', dims: true, nums: true, person: true, pattern: true,
  sceneView: 'front', snap: 100, showGrid: true, labels: true, sceneDims: true,
}, S.loadPrefs());
const ui = { tool: null, addPanelId: null, selSlices: new Set(), customRot: 15, dragging: false };

let custom = S.loadCatalog();
let panels = S.panelMap(custom);
let project = S.loadCurrent() || S.newProject();
adoptProject(project);

let derived = {};
let scene3d = null, scene3dLoading = false, scene3dFailed = false;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const active = () => project.screens.find((s) => s.id === project.activeId) || project.screens[0];
const scr = (id) => project.screens.find((s) => s.id === id);
const typeLabel = (type) => t('type' + type.charAt(0).toUpperCase() + type.slice(1));
const screenName = (s) => s.name || typeLabel(s.type);
const panelName = (p) => p ? (p.builtin ? `${p.name} · ${t('env_' + p.env)}` : p.name) : '—';
const m2 = (mm) => fmtNum(mm / 1000, 2);

// 프로젝트를 불러올 때: 프로젝트에 담긴 사용자 패널을 카탈로그에 합치고, 없는 패널 참조를 정리한다
function adoptProject(p) {
  let changed = false;
  for (const cp of p.customPanels || []) {
    if (!custom.find((x) => x.id === cp.id)) { custom.push(makePanel({ ...cp, builtin: false })); changed = true; }
  }
  if (changed) { S.saveCatalog(custom); panels = S.panelMap(custom); }
  for (const s of p.screens) {
    if (!panels[s.panelId]) s.panelId = DEFAULT_PANEL_ID;
    if (!panels[s.mix.smallId]) s.mix.smallId = panelId('outdoor', '500x500', '3.9');
    if (!panels[s.mix.bigId]) s.mix.bigId = panelId('outdoor', '500x1000', '3.9');
    const pp = panels[s.panelId];
    if (pp.builtin) s.env = pp.env;
    if (!s.env) s.env = 'outdoor';
    if (!mountsFor(s.env).includes(s.mount)) s.mount = mountsFor(s.env)[0];
    if (s.env === 'indoor') s.mix.on = false;
    s.cabs = (s.cabs || []).filter((c) => panels[c.p]);
    if (!s.cabs.length) S.regen(s, panels);
  }
}

function derive() {
  const out = {};
  for (const s of project.screens) {
    const sum = E.summarize(s.cabs, panels);
    const pm = E.pixelMap(s.cabs, panels);
    const order = E.orderCabs(s.cabs, panels, s.numbering);
    const labels = {};
    order.forEach((id, i) => { labels[id] = String(i + 1); });
    const items = order.map((id) => ({ id, px: pm.map[id].w * pm.map[id].h }));
    const cab = E.assignPorts(items, { capacity: s.cabling.capacity, mode: s.cabling.mode, manualCounts: s.cabling.counts });
    const portOf = {};
    cab.ports.forEach((p) => p.ids.forEach((id, i) => { portOf[id] = { n: p.n, i: i + 1 }; }));
    const panel = panels[s.panelId];
    const ncols = panel ? Math.max(1, Math.round(sum.widthMm / panel.w)) : 1;
    const curv = s.geometry !== 'flat' && panel ? E.curvature(s.geometry, ncols, panel.w, { jointAngle: s.jointAngle, arcAngle: s.arcAngle }) : null;
    const curvWarn = curv ? E.curveWarnings(s.geometry, panel, curv) : [];
    out[s.id] = { sum, pm, order, labels, cab, portOf, curv, curvWarn };
  }
  return out;
}
const sumsOf = () => Object.fromEntries(Object.entries(derived).map(([k, v]) => [k, v.sum]));

// ───────────────────────── 저장 ─────────────────────────
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    project.customPanels = usedCustomPanels();
    S.saveProject(project);
    const n = $('#savedNote');
    if (n) n.textContent = t('autosaved') + ' ' + new Date().toLocaleTimeString(getLang() === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }, 400);
}
function usedCustomPanels() {
  const ids = new Set();
  for (const s of project.screens) { ids.add(s.panelId); ids.add(s.mix.smallId); ids.add(s.mix.bigId); s.cabs.forEach((c) => ids.add(c.p)); }
  return custom.filter((p) => ids.has(p.id));
}
function savePrefs() { S.savePrefs(prefs); }

// ───────────────────────── 공통 조각 ─────────────────────────
function panelOptions(sel, filter) {
  const g = GENERIC_PANELS.filter((p) => !filter || filter(p));
  const c = custom.filter((p) => !filter || filter(p));
  const opt = (p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(panelName(p))}</option>`;
  return (c.length ? `<optgroup label="${esc(t('custom'))}">${c.map(opt).join('')}</optgroup>` : '') + `<optgroup label="${esc(t('generic'))}">${g.map(opt).join('')}</optgroup>`;
}
const opts = (list, sel) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label)}</option>`).join('');
const seg = (bind, list, cur, extra = '') => `<div class="seg small" role="group">${list.map(([v, label]) => `<button type="button" data-act="set" data-bind="${bind}" data-v="${esc(v)}" ${extra} aria-pressed="${String(cur) === String(v)}">${esc(label)}</button>`).join('')}</div>`;
const num = (bind, val, attrs = '') => `<input type="number" data-bind="${bind}" data-kind="num" value="${esc(val)}" ${attrs}>`;
const chk = (bind, val, label, attrs = '') => `<label class="chk"><input type="checkbox" data-bind="${bind}" data-kind="bool" ${val ? 'checked' : ''} ${attrs}> ${esc(label)}</label>`;
const field = (label, inner) => `<label class="field"><span>${esc(label)}</span>${inner}</label>`;

// 혼합 배치 후보: 같은 용도·피치의 기본 사이즈(숨은 사이즈 포함) + 사용자 패널
const mixFilter = (cur) => (x) => !x.builtin || (cur && x.env === 'outdoor' && x.pitchKey === cur.pitchKey);

function panelInfo(p) {
  if (!p) return '';
  return `${p.w}×${p.h} mm · ${p.px}×${p.py} px · ${t('realPitch')} ${pitchOf(p).toFixed(3)} mm${p.weight ? ` · ${p.weight} kg` : ''}${p.pMax ? ` · ${t('powerMax')} ${p.pMax} W` : ''}`;
}

// ───────────────────────── 디자인 (심플 + 프로 1) ─────────────────────────
function sideCards(pro) {
  const s = active();
  const d = derived[s.id];
  const p = panels[s.panelId];
  const pick = pro && project.screens.length > 1
    ? `<div class="card"><label class="field"><span>${t('active')}</span><select data-bind="p.activeId" data-kind="str">${opts(project.screens.map((x) => [x.id, screenName(x)]), s.id)}</select></label></div>` : '';

  // 패널: 용도 → 설치 형태 → 사이즈 → 피치
  const isCustom = p && !p.builtin;
  const envBtns = ENVS.map((v) => `<button type="button" data-act="pick" data-k="env" data-v="${v}" aria-pressed="${s.env === v}">${t('env_' + v)}</button>`).join('');
  const mountBtns = ['install', 'rental'].map((v) => `<button type="button" data-act="pick" data-k="mount" data-v="${v}" aria-pressed="${s.mount === v}" ${mountsFor(s.env).includes(v) ? '' : 'disabled'}>${t('mount_' + v)}</button>`).join('');
  const sizeOpts = opts(sizesFor(s.env).map((z) => [z.key, `${z.w} × ${z.h}`]), isCustom ? '' : p.sizeKey)
    + (custom.length ? `<optgroup label="${esc(t('custom'))}">${opts(custom.map((c) => ['c:' + c.id, c.name]), isCustom ? 'c:' + p.id : '')}</optgroup>` : '');
  const pitchSel = isCustom ? `<input type="text" value="${esc(p.pitchLabel || pitchOf(p).toFixed(2))}" disabled>`
    : `<select data-act-change="pickPitch" ${s.mix.on ? 'disabled' : ''}>${opts(pitchesFor(p.sizeKey).map((x) => [x, 'P' + x]), p.pitchKey)}</select>`;
  const panelCard = `<div class="card"><h2><span class="num">1</span>${t('secPanel')}</h2>
    <div class="grid2">
      <div class="field"><span>${t('useType')}</span><div class="seg small" role="group">${envBtns}</div></div>
      <div class="field"><span>${t('installType')}</span><div class="seg small" role="group">${mountBtns}</div></div>
    </div>
    <div class="grid2" style="margin-top:10px">
      ${field(t('panelSize') + ' (mm)', `<select data-act-change="pickSize" ${s.mix.on ? 'disabled' : ''}>${sizeOpts}</select>`)}
      ${field(t('pitch'), pitchSel)}
    </div>
    ${s.env === 'indoor' ? `<p class="note">${t('indoorInstallOnly')}</p>` : ''}
    <div class="panel-info">${esc(panelInfo(p))}</div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="panelNew">${t('createPanel')}</button></div></div>`;

  let geomExtra = '';
  if (s.geometry === 'concave' || s.geometry === 'convex') geomExtra = field(t('jointAngle'), num('s.jointAngle', s.jointAngle, 'step="0.5" min="0.5" max="45"'));
  if (s.geometry === 'arc') geomExtra = field(t('arcAngle'), num('s.arcAngle', s.arcAngle, 'step="1" min="1" max="359"'));
  let curvTxt = '';
  if (d.curv) {
    curvTxt = `<div class="tiles" style="margin-top:10px">
      <div class="tile"><div class="k">${t('radius')}</div><div class="v">${m2(d.curv.radius)}</div><div class="s">m · ${fmtNum(d.curv.jointAngle, 2)}°</div></div>
      <div class="tile"><div class="k">${t('depth')}</div><div class="v">${m2(d.curv.depth)}</div><div class="s">m · ${t('totalAngle')} ${fmtNum(d.curv.totalAngle, 1)}°</div></div></div>`;
    curvTxt += d.curvWarn.map((w) => `<p class="warn">${esc(t(w))}</p>`).join('');
  }
  const geomCard = `<div class="card"><h2><span class="num">2</span>${t('secGeometry')}</h2>
    ${field(t('geomType'), `<select data-bind="s.geometry" data-kind="str">${opts([['flat', t('flat')], ['concave', t('concave')], ['convex', t('convex')], ['arc', t('arc')], ['cylinder', t('cylinder')]], s.geometry)}</select>`)}
    ${geomExtra ? `<div style="margin-top:10px">${geomExtra}</div>` : ''}${curvTxt}</div>`;

  let sizeBody;
  if (!s.mix.on) {
    sizeBody = seg('s.sizeMode', [['grid', t('byGrid')], ['meters', t('byMeters')]], s.sizeMode, 'data-regen="1"');
    sizeBody += s.sizeMode === 'grid'
      ? `<div class="grid2" style="margin-top:10px">${field(t('cols'), num('s.cols', s.cols, 'min="1" max="200" data-regen="1"'))}${field(t('rows'), num('s.rows', s.rows, 'min="1" max="200" data-regen="1"'))}</div>`
      : `<div class="grid2" style="margin-top:10px">${field(t('widthM'), num('s.wM', s.wM, 'step="0.1" min="0.1" data-regen="1"'))}${field(t('heightM'), num('s.hM', s.hM, 'step="0.1" min="0.1" data-regen="1"'))}</div>
         <p class="note">→ ${s.cols} × ${s.rows}</p>${p && p.env === 'indoor' ? `<p class="note">${t('indoorFillNote')}</p>` : ''}`;
    if (p) {
      const sug = E.ratioSuggestions(p.px, p.py);
      sizeBody += `<h3>${t('near169')}</h3><div class="row">${sug.map((x) => `<button type="button" class="btn sm" data-act="suggest" data-c="${x.cols}" data-r="${x.rows}">${x.cols}×${x.rows} <span class="mono" style="color:var(--mute)">(${x.err >= 0 ? '+' : ''}${(x.err * 100).toFixed(2)}%)</span></button>`).join('')}</div>`;
    }
  }
  const mx = s.mix;
  let mixBody = '';
  if (mx.on) {
    const mi = s.mixInfo || { warnings: [] };
    const sm = panels[mx.smallId], bg = panels[mx.bigId];
    const sameFamily = sm && bg && sm.family && sm.family === bg.family;
    mixBody = `<div class="sub-box">
      <div class="grid2">${field(t('mixSmall'), `<select data-bind="s.mix.smallId" data-kind="str" data-regen="1">${panelOptions(mx.smallId, mixFilter(p))}</select>`)}${field(t('mixBig'), `<select data-bind="s.mix.bigId" data-kind="str" data-regen="1">${panelOptions(mx.bigId, mixFilter(p))}</select>`)}</div>
      <div class="grid2" style="margin-top:10px">${field(t('widthM'), num('s.mix.wM', mx.wM, 'step="0.1" min="0.1" data-regen="1"'))}${field(t('heightM'), num('s.mix.hM', mx.hM, 'step="0.1" min="0.1" data-regen="1"'))}</div>
      <div class="grid2" style="margin-top:10px">${field(t('stockSmall'), `<input type="number" min="0" data-bind="s.mix.stockSmall" data-kind="numOrEmpty" data-regen="1" value="${esc(mx.stockSmall)}" placeholder="∞">`)}${field(t('stockBig'), `<input type="number" min="0" data-bind="s.mix.stockBig" data-kind="numOrEmpty" data-regen="1" value="${esc(mx.stockBig)}" placeholder="∞">`)}</div>
      <div class="grid2" style="margin-top:10px">${field(t('goal'), `<select data-bind="s.mix.goal" data-kind="str" data-regen="1">${opts([['fewest', t('goalFewest')], ['stock', t('goalStock')], ['preferBig', t('goalBig')], ['preferSmall', t('goalSmall')]], mx.goal)}</select>`)}
        <div class="field"><span>${t('band')}</span>${seg('s.mix.band', [['top', t('bandTop')], ['bottom', t('bandBottom')]], mx.band, 'data-regen="1"')}</div></div>
      <p class="note mono">${mi.cols || 0} × (${mi.bigRows || 0} + ${mi.smallRows || 0})</p>
      ${mi.warnings.map((w) => `<p class="warn">${esc(t(w))}${w === 'stockBigShort' ? ` — ${mi.shortBig} ${t('short')}` : ''}${w === 'stockSmallShort' ? ` — ${mi.shortSmall} ${t('short')}` : ''}</p>`).join('')}
      <div style="margin-top:10px">${chk('s.mix.confirmed', mx.confirmed, t('mixConfirm'))}</div>
      ${!(mx.confirmed && sameFamily) ? `<p class="warn">${t('mixUnconfirmed')}</p>` : ''}
    </div>`;
  }
  const sizeCard = `<div class="card"><h2><span class="num">3</span>${t('secSize')}</h2>${sizeBody || ''}
    ${s.env === 'outdoor' ? `<div style="margin-top:14px">${chk('s.mix.on', mx.on, t('mix'), 'data-regen="1"')}</div>${mixBody}` : ''}</div>`;
  return pick + panelCard + geomCard + sizeCard;
}

function resultsCard() {
  const s = active();
  const d = derived[s.id];
  const r = d.sum;
  const counts = Object.entries(r.counts).map(([id, n]) => `${n}× ${panels[id] ? panels[id].w + '×' + panels[id].h : id}`).join(' + ');
  const power = r.pMax !== null || r.pAvg !== null
    ? `${[r.pMax !== null ? `${t('powerMax')} ${fmtNum(r.pMax)} W` : '', r.pAvg !== null ? `${t('powerAvg')} ${fmtNum(r.pAvg)} W` : ''].filter(Boolean).join(' · ')}${r.ampsSingle !== null ? `<br>${t('single')} ${fmtNum(r.ampsSingle, 1)} A · ${t('three')} ${fmtNum(r.ampsThree, 1)} A` : ''}`
    : `${t('power')}: ${t('noData')}`;
  const cases = Object.entries(r.cases).map(([id, n]) => `${n} ${t('cases')} (${panels[id].w}×${panels[id].h})`).join(', ');
  const tiles = [
    [t('width'), `${m2(r.widthMm)} m`, `${fmtNum(r.widthMm)} mm`],
    [t('height'), `${m2(r.heightMm)} m`, `${fmtNum(r.heightMm)} mm`],
    [t('cabinets'), fmtNum(r.count), counts],
    [t('ledArea'), `${fmtNum(r.areaM2, 2)} m²`, r.holes ? `<span class="bad">${t('hasHoles')}</span>` : t('noHoles')],
    [t('resolution'), `${r.resW} × ${r.resH}`, 'px'],
    [t('totalPx'), fmtNum(r.totalPx), 'px'],
    [t('ratio'), r.ratio, `${r.vs169 >= 0 ? '+' : ''}${(r.vs169 * 100).toFixed(2)}% ${t('vs169')}`],
    [t('weightPower'), r.weight !== null ? `${fmtNum(r.weight, 1)} kg` : t('noData'), power + (cases ? '<br>' + cases : '')],
    [t('portsUsed'), fmtNum(d.cab.ports.length), `${t('minPossible')} ${d.cab.minPorts}`],
  ];
  return `<div class="card"><h2>${t('results')}${project.screens.length > 1 ? ` <span style="color:var(--mute);font-weight:400">· ${esc(screenName(s))}</span>` : ''}</h2>
    <div class="tiles">${tiles.map(([k, v, sub]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('')}</div></div>`;
}

function addSlots(s, panel) {
  const out = [], seen = new Set();
  const d = { w: panel.w, h: panel.h };
  for (const c of s.cabs) {
    const cd = E.cabDims(c, panels[c.p]);
    const cand = [[c.x + cd.w, c.y], [c.x - d.w, c.y], [c.x, c.y + cd.h], [c.x, c.y - d.h], [c.x + cd.w - d.w, c.y + cd.h], [c.x + cd.w - d.w, c.y - d.h]];
    for (const [x, y] of cand) {
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!overlaps(s, { x, y, w: d.w, h: d.h })) out.push({ x, y, w: d.w, h: d.h });
    }
  }
  return out;
}
function overlaps(s, r, ignoreId) {
  return s.cabs.some((c) => {
    if (c.id === ignoreId) return false;
    const d = E.cabDims(c, panels[c.p]);
    return r.x < c.x + d.w - 0.5 && r.x + r.w > c.x + 0.5 && r.y < c.y + d.h - 0.5 && r.y + r.h > c.y + 0.5;
  });
}

// 도면에서 추가/교체할 수 있는 패널: 같은 용도·피치의 기본 사이즈(보조 사이즈 포함) + 사용자 패널
const addable = (x, cur) => !x.builtin || !cur || !cur.builtin || (x.env === cur.env && x.pitchKey === cur.pitchKey);

function numberingControls(s) {
  const n = s.numbering;
  return `<select data-bind="s.numbering.dir" data-kind="str" title="${t('route')}">${opts([['v', t('dirV')], ['h', t('dirH')]], n.dir)}</select>
    <select data-bind="s.numbering.pattern" data-kind="str">${opts([['zigzag', t('patZig')], ['raster', t('patRaster')]], n.pattern)}</select>
    <select data-bind="s.numbering.start" data-kind="str">${opts([['tl', t('startTL')], ['tr', t('startTR')], ['bl', t('startBL')], ['br', t('startBR')]], n.start)}</select>`;
}

function planCard() {
  const s = active();
  const d = derived[s.id];
  const usedIds = [...new Set([s.panelId, ...s.cabs.map((c) => c.p), ...(s.mix.on ? [s.mix.smallId, s.mix.bigId] : [])])];
  if (!ui.addPanelId || !panels[ui.addPanelId]) ui.addPanelId = usedIds[0];
  const addPanel = panels[ui.addPanelId];
  const slots = ui.tool === 'add' && addPanel ? addSlots(s, addPanel) : [];
  const svg = planSvg(s.cabs, panels, { mode: prefs.planMode, dims: prefs.dims, nums: prefs.nums, labels: d.labels, portOf: d.portOf, ports: d.cab.ports, pxMap: d.pm, slots });
  const hint = ui.tool ? t(ui.tool + 'Hint') : '';
  const foot = Object.entries(d.sum.counts).map(([id, n]) => { const p = panels[id]; return `${n} × ${esc(panelName(p))} — ${p.w}×${p.h} mm — ${p.px}×${p.py} px — pitch ${pitchOf(p).toFixed(3)} mm`; }).join('<br>');
  const tools = [['', t('toolNone')], ['add', t('toolAdd')], ['remove', t('toolRemove')], ['rotate', t('toolRotate')], ['swap', t('toolSwap')]];
  return `<div class="card"><h2>${t('plan')}</h2>
    <div class="plan-tools">
      ${seg('u.planMode', [['cabs', t('viewCabs')], ['cable', t('viewCable')]], prefs.planMode)}
      ${chk('u.dims', prefs.dims, t('dims'))}${chk('u.nums', prefs.nums, t('numbering'))}
      <span class="sep"></span>${numberingControls(s)}
    </div>
    <div class="plan-tools">
      <span style="font-size:13px;color:var(--mute)">${t('editOnPlan')}</span>
      <div class="seg small" role="group">${tools.map(([v, l]) => `<button type="button" data-act="tool" data-v="${v}" aria-pressed="${(ui.tool || '') === v}">${esc(l)}</button>`).join('')}</div>
      <select data-act-change="addPanel" title="${t('addPanel')}">${opts(usedIds.concat(Object.keys(panels).filter((id) => !usedIds.includes(id) && addable(panels[id], panels[s.panelId]))).map((id) => [id, panelName(panels[id])]), ui.addPanelId)}</select>
      <span class="sep"></span>
      <button type="button" class="btn sm" data-act="grow" data-v="col+">${t('plusCol')}</button><button type="button" class="btn sm" data-act="grow" data-v="col-">${t('minusCol')}</button>
      <button type="button" class="btn sm" data-act="grow" data-v="row+">${t('plusRow')}</button><button type="button" class="btn sm" data-act="grow" data-v="row-">${t('minusRow')}</button>
    </div>
    ${hint ? `<p class="note">${esc(hint)}</p>` : ''}${s.edited ? `<p class="note">✎ ${t('manualEdited')}</p>` : ''}
    <div class="plan-wrap" id="planWrap">${svg}</div>
    <div class="plan-foot">${foot}<br>${esc(screenName(s))}: ${d.sum.count} ${t('cabinets')} · ${fmtNum(d.sum.areaM2, 2)} m² · ${d.sum.resW}×${d.sum.resH} px (${fmtNum(d.sum.totalPx)} px)</div></div>`;
}

function view3dCard() {
  return `<div class="card"><h2>${t('view3d')}<span class="right">${chk('u.person', prefs.person, t('person'), 'data-3d="1"')}${chk('u.pattern', prefs.pattern, t('testPattern'), 'data-3d="1"')}<button type="button" class="btn sm" data-act="reset3d">${t('resetView')}</button></span></h2>
    <div id="v3dSlot"></div><p class="note">${t('hint3d')}</p></div>`;
}

function sceneCard() {
  const s = active();
  const list = project.screens.map((x) => `<button type="button" class="scr-item" data-act="selScreen" data-v="${x.id}" aria-pressed="${x.id === s.id}"><b>${esc(screenName(x))}</b><span class="meta">${m2(derived[x.id].sum.widthMm)}×${m2(derived[x.id].sum.heightMm)} m</span></button>`).join('');
  const types = ['main', 'side', 'totem', 'banner', 'dj', 'arc', 'free'];
  const props = `<div class="grid2">${field(t('name'), `<input type="text" data-bind="s.name" data-kind="str" data-render="1" value="${esc(s.name)}" placeholder="${esc(typeLabel(s.type))}">`)}${field(t('type'), `<select data-bind="s.type" data-kind="str">${opts(types.map((x) => [x, typeLabel(x)]), s.type)}</select>`)}</div>
    <div class="grid2" style="margin-top:10px">${field(t('posX'), num('s.pos.x', s.pos.x, 'step="10"'))}${field(t('posY'), num('s.pos.y', s.pos.y, 'step="10"'))}${field(t('posZ'), num('s.pos.z', s.pos.z, 'step="10"'))}${field(t('tilt'), num('s.pos.tilt', s.pos.tilt, 'step="1" min="-90" max="90"'))}${field(t('yaw'), num('s.pos.yaw', s.pos.yaw, 'step="1" min="-180" max="180"'))}</div>
    <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="mount" data-v="0">${t('mountWall')}</button><button type="button" class="btn sm" data-act="mount" data-v="90">${t('mountCeiling')}</button>
    <button type="button" class="btn sm danger" data-act="delScreen" ${project.screens.length < 2 ? 'disabled' : ''} style="margin-left:auto">${t('remove')}</button></div>`;
  const views = [['front', t('vFront')], ['top', t('vTop')], ['side', t('vSide')], ['developed', t('vDeveloped')]];
  return `<div class="card"><h2>${t('sceneEditor')}</h2><div class="scene">
    <div><h3 style="margin-top:0">${t('screens')}</h3><div class="scr-list">${list}</div>
      <select data-act-change="addScreen"><option value="">${t('addScreen')}</option>${opts(types.map((x) => [x, typeLabel(x)]), '')}</select>
      <h3>${esc(screenName(s))}</h3>${props}</div>
    <div><div class="plan-tools">${seg('u.sceneView', views, prefs.sceneView)}
      <select data-bind="u.snap" data-kind="num" title="${t('grid')}">${opts([[0, t('snapNone')], [10, '10 mm'], [100, '100 mm'], [250, '250 mm'], [500, '500 mm']], prefs.snap)}</select>
      ${chk('u.showGrid', prefs.showGrid, t('showGrid'))}${chk('u.labels', prefs.labels, t('labels'))}${chk('u.sceneDims', prefs.sceneDims, t('sceneDims'))}</div>
      <div class="plan-tools"><button type="button" class="btn sm" data-act="fitScene">${t('fit')}</button><button type="button" class="btn sm" data-act="align" data-v="left">${t('alignLeft')}</button><button type="button" class="btn sm" data-act="align" data-v="top">${t('alignTop')}</button><button type="button" class="btn sm" data-act="align" data-v="bottom">${t('alignBottom')}</button><button type="button" class="btn sm" data-act="align" data-v="distribute">${t('distributeH')}</button></div>
      <div class="scene-wrap" id="sceneWrap">${sceneMarkup()}</div></div></div></div>`;
}
function sceneMarkup(vb) {
  return sceneSvg(project, panels, sumsOf(), { view: prefs.sceneView, grid: prefs.snap, showGrid: prefs.showGrid, labels: prefs.labels, dims: prefs.sceneDims, selectedId: project.activeId, typeLabel, vb });
}

function designView(pro) {
  return (pro ? sceneCard() : '') + `<div class="layout" style="${pro ? 'margin-top:18px' : ''}"><aside class="side">${sideCards(pro)}</aside><section class="content">${resultsCard()}${planCard()}${view3dCard()}</section></div>`;
}

// ───────────────────────── 결선 ─────────────────────────
function cablingView() {
  const s = active();
  const d = derived[s.id];
  const c = s.cabling;
  const chips = project.screens.length > 1 ? `<div class="scr-chips">${project.screens.map((x) => `<button type="button" class="btn sm" data-act="selScreen" data-v="${x.id}" aria-pressed="${x.id === s.id}">${esc(screenName(x))}</button>`).join('')}</div>` : '';
  const ports = d.cab.ports.map((p) => {
    const color = PORT_COLORS[(p.n - 1) % PORT_COLORS.length];
    const pct = Math.min(100, (p.px / d.cab.capacity) * 100);
    return `<div class="port${p.over ? ' over' : ''}"><span class="dot" style="background:${color}"></span>
      <div><b>${t('port')} ${p.n}</b> · ${p.ids.length} ${t('cabsShort')}${p.over ? ` · <span class="bad">${t('overCap')}</span>` : ''}<div class="bar"><i style="width:${pct}%;background:${p.over ? 'var(--bad)' : color}"></i></div></div>
      <span class="px">${fmtNum(p.px)} / ${fmtNum(d.cab.capacity)}</span></div>`;
  }).join('');
  const manual = c.mode === 'manual'
    ? `<h3>${t('manualCounts')}</h3><div class="grid3">${(c.counts || []).map((n, i) => field(`${t('port')} ${i + 1}`, num(`s.cabling.counts.${i}`, n, 'min="0"'))).join('')}</div>
       <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="port" data-v="+">${t('addPort')}</button><button type="button" class="btn sm" data-act="port" data-v="-">${t('delPort')}</button></div>
       ${d.cab.unassigned.length ? `<p class="warn">${t('unassigned')}: ${d.cab.unassigned.length}</p>` : ''}` : '';
  const svg = planSvg(s.cabs, panels, { mode: 'cable', dims: false, labels: d.labels, portOf: d.portOf, ports: d.cab.ports, pxMap: d.pm });
  return chips + `<div class="layout"><aside class="side"><div class="card"><h2>${t('dataPorts')} · ${esc(screenName(s))}</h2>
      ${seg('s.cabling.mode', [['auto', t('auto')], ['balanced', t('balanced')], ['manual', t('manual')]], c.mode)}
      <div style="margin-top:10px">${field(t('capacity'), num('s.cabling.capacity', c.capacity, 'step="1000" min="1000"'))}</div>
      <h3>${t('route')}</h3><div class="row">${numberingControls(s)}</div>
      <p class="note">${t('portsUsed')}: <b>${d.cab.ports.length}</b> (${t('minPossible')}: ${d.cab.minPorts}) · ${fmtNum(d.cab.total)} px</p>
      ${manual}
      <div class="ports" style="margin-top:12px">${ports}</div>
      <p class="note">${t('cablingNote')}</p></div></aside>
    <section class="content"><div class="card"><h2>${t('pixelPlot')}</h2><div class="plan-wrap">${svg}</div>
      <div class="plan-foot">${esc(screenName(s))} · ${d.sum.resW}×${d.sum.resH} px · ${d.cab.ports.length} ${t('port')}<br>${d.cab.ports.map((p) => `P${p.n} · IN → ${p.ids.length} ${t('cabsShort')} · ${fmtNum(p.px)} / ${fmtNum(d.cab.capacity)} px`).join('<br>')}</div></div></section></div>`;
}

// ───────────────────────── 캔버스 · Arena ─────────────────────────
function canvasView() {
  const cv = project.canvas;
  const outputs = cv.outputs.map((o, i) => `<div class="out-row"><input type="text" data-bind="p.canvas.outputs.${i}.name" data-kind="str" data-render="1" value="${esc(o.name)}">${num(`p.canvas.outputs.${i}.w`, o.w, 'min="1"')}${num(`p.canvas.outputs.${i}.h`, o.h, 'min="1"')}<button type="button" class="btn sm" data-act="delOutput" data-v="${i}" ${cv.outputs.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('');
  const sl = cv.slices;
  const outOpts = (sel) => opts(cv.outputs.map((o, i) => [i, o.name]), sel);
  const rows = sl.map((s, i) => `<tr class="${ui.selSlices.has(s.id) ? 'sel' : ''}"><td><input type="checkbox" data-act="selSlice" data-v="${s.id}" ${ui.selSlices.has(s.id) ? 'checked' : ''}></td>
    <td><input type="text" data-bind="p.canvas.slices.${i}.name" data-kind="str" value="${esc(s.name)}"></td>
    ${['x', 'y', 'w', 'h'].map((k) => `<td>${num(`p.canvas.slices.${i}.in.${k}`, s.in[k])}</td>`).join('')}
    <td><select data-bind="p.canvas.slices.${i}.output" data-kind="num">${outOpts(s.output)}</select></td>
    ${['x', 'y', 'w', 'h'].map((k) => `<td>${num(`p.canvas.slices.${i}.out.${k}`, s.out[k])}</td>`).join('')}
    <td>${num(`p.canvas.slices.${i}.rot`, s.rot || 0, 'step="0.5"')}</td><td class="mono">${esc(s.group || '')}</td></tr>`).join('');
  const table = sl.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" data-act="selAll" ${ui.selSlices.size && ui.selSlices.size === sl.length ? 'checked' : ''} title="${t('all')}"></th><th>${t('colName')}</th><th>${t('colInX')}</th><th>${t('colInY')}</th><th>${t('colInW')}</th><th>${t('colInH')}</th><th>${t('colOut')}</th><th>${t('colOutX')}</th><th>${t('colOutY')}</th><th>${t('colOutW')}</th><th>${t('colOutH')}</th><th>${t('colRot')}</th><th>${t('colGroup')}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="note">${t('noSlices')}</p>`;
  const sel = new Set(ui.selSlices);
  const previews = sl.length ? `<div class="grid2" style="margin-top:14px">
      <div><h3>Canvas ${cv.W}×${cv.H}</h3><div class="plan-wrap">${slicesSvg(cv.W, cv.H, sl, { selected: sel })}</div></div>
      ${cv.outputs.map((o, i) => `<div><h3>${esc(o.name)} ${o.w}×${o.h}</h3><div class="plan-wrap">${slicesSvg(o.w, o.h, sl.filter((s) => s.output === i), { selected: sel, useOut: true })}</div></div>`).join('')}</div>` : '';
  const rotBtns = [[-1, '↺ 1°'], [1, '↻ 1°'], [-5, '↺ 5°'], [5, '↻ 5°'], [90, '↻ 90°']].map(([v, l]) => `<button type="button" class="btn sm" data-act="rot" data-v="${v}" ${sel.size ? '' : 'disabled'}>${l}</button>`).join('');
  return `<div class="layout"><aside class="side">
      <div class="card"><h2>${t('canvasOut')}</h2><p class="note" style="margin-top:0">${t('canvasNote')}</p>
        <div class="grid2" style="margin-top:12px">${field(t('canvasW'), num('p.canvas.W', cv.W, 'min="1"'))}${field(t('canvasH'), num('p.canvas.H', cv.H, 'min="1"'))}</div>
        <div class="row" style="margin-top:10px">${field(t('canvasPreset'), `<select data-bind="p.canvas.preset" data-kind="str">${opts([['custom', 'Custom'], ['1920x1080', '1920 × 1080'], ['3840x2160', '3840 × 2160']], cv.preset)}</select>`)}</div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="fitCanvas">${t('fitContent')}</button></div>
        <h3>${t('outputs')}</h3><div class="outs">${outputs}</div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="addOutput">${t('addOutput')}</button></div></div>
      <div class="card"><h2>${t('arena')}</h2><p class="note" style="margin-top:0">${t('arenaNote')}</p>
        <h3>${t('arenaDirect')}</h3><p class="note" style="margin-top:0">${t('arenaDirectNote')}</p>
        <button type="button" class="btn" data-act="arenaExport">${t('arenaExport')}</button>
        <h3>${t('arenaBase')}</h3><p class="note" style="margin-top:0">${t('arenaBaseNote')}</p>
        <div class="row"><button type="button" class="btn" data-act="arenaImport">${t('arenaImport')}</button>
        ${cv.arenaBase ? `<button type="button" class="btn primary" data-act="arenaMerge">${t('arenaMerge')}</button>` : ''}</div>
        ${cv.arenaBase ? `<p class="note">${t('arenaLoaded')}: ${esc(cv.arenaBaseName || '')}</p>` : ''}
        ${!sl.length ? `<p class="warn">${t('needSlices')}</p>` : ''}</div>
    </aside><section class="content"><div class="card"><h2>${t('slices')}</h2>
      <div class="plan-tools"><button type="button" class="btn sm" data-act="mkSlices" data-v="screen">${t('perScreen')}</button><button type="button" class="btn sm" data-act="mkSlices" data-v="cabinet">${t('perCabinet')}</button>
        <span class="sep"></span><button type="button" class="btn sm" data-act="group" ${sel.size > 1 ? '' : 'disabled'}>${t('makeGroup')}</button><button type="button" class="btn sm" data-act="ungroup" ${sel.size ? '' : 'disabled'}>${t('ungroup')}</button></div>
      <div class="plan-tools"><span style="font-size:13px;color:var(--mute)">${t('rotateSel')}:</span>${rotBtns}
        <input type="number" id="customRot" value="${esc(ui.customRot)}" step="0.5" style="width:80px"> °<button type="button" class="btn sm" data-act="rotCustom" ${sel.size ? '' : 'disabled'}>${t('apply')}</button></div>
      <p class="note" style="margin-top:0;margin-bottom:10px">${t('rotNote')}</p>
      ${table}
      <div class="row" style="margin-top:10px"><button type="button" class="btn sm" data-act="dlCsv" ${sl.length ? '' : 'disabled'}>${t('csv')}</button><button type="button" class="btn sm" data-act="dlSlices" ${sl.length ? '' : 'disabled'}>${t('slicesJson')}</button></div>
      ${previews}</div></section></div>`;
}

// ───────────────────────── 카탈로그 ─────────────────────────
function catalogView() {
  const item = (p, isCustom) => `<div class="cat-item"><div class="t">${esc(p.name)}</div>
    <div class="d">${p.w}×${p.h} mm · ${p.px}×${p.py} px · ${pitchOf(p).toFixed(3)} mm${p.weight ? ` · ${p.weight} kg` : ''}${p.pMax ? ` · ${p.pMax} W` : ''}</div>
    <div class="row">${isCustom ? `<button type="button" class="btn sm" data-act="panelEdit" data-v="${p.id}">${t('edit')}</button>` : ''}
    <button type="button" class="btn sm" data-act="panelDup" data-v="${p.id}">${t('dup')}</button>
    ${isCustom ? `<button type="button" class="btn sm danger" data-act="panelDel" data-v="${p.id}">${t('del')}</button>` : ''}</div></div>`;
  return `<div class="card"><h2>${t('customPanels')}<span class="right"><button type="button" class="btn sm primary" data-act="panelNew">${t('createPanel')}</button><button type="button" class="btn sm" data-act="catExport">${t('exportCatalog')}</button><button type="button" class="btn sm" data-act="catImport">${t('importCatalog')}</button></span></h2>
    ${custom.length ? `<div class="cat-list">${custom.map((p) => item(p, true)).join('')}</div>` : `<p class="note">${t('noCustom')}</p>`}
    <details open><summary>${t('builtinPresets')} (${GENERIC_PANELS.filter((p) => !p.hidden).length})</summary><div class="cat-list">${GENERIC_PANELS.filter((p) => !p.hidden).map((p) => item(p, false)).join('')}</div></details></div>`;
}

// ───────────────────────── 렌더 ─────────────────────────
function renderChrome() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.mode)));
  document.querySelectorAll('#langSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === getLang())));
  $('#proTabs').hidden = prefs.mode !== 'pro';
  document.querySelectorAll('#proTabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.tab)));
  document.querySelectorAll('.projbar [data-bind]').forEach((el) => { const v = getPath(el.dataset.bind); if (document.activeElement !== el) el.value = v ?? ''; });
  $('#pName').placeholder = t('untitled');
}

function render() {
  derived = derive();
  renderChrome();
  const focus = document.activeElement;
  const fKey = focus && (focus.dataset.bind || focus.id);
  const sel = focus && typeof focus.selectionStart === 'number' ? [focus.selectionStart, focus.selectionEnd] : null;
  const main = $('#main');
  let html;
  if (prefs.mode === 'simple') html = designView(false);
  else if (prefs.tab === 'cabling') html = cablingView();
  else if (prefs.tab === 'canvas') html = canvasView();
  else if (prefs.tab === 'catalog') html = catalogView();
  else html = designView(true);
  $('#v3dStore').appendChild(V3D_HOST); // 다시 그리기 전에 3D 영역을 빼둔다
  main.innerHTML = html;
  if (fKey && main.contains(focus) === false) {
    const el = main.querySelector(`[data-bind="${CSS.escape(fKey)}"]`) || document.getElementById(fKey);
    if (el && el.closest('#main')) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* number input */ } } }
  }
  place3d();
}
let rq = 0;
// rAF는 백그라운드 탭에서 멈추므로 setTimeout을 쓴다 (Tab 이동 후 포커스가 정해진 다음 그린다)
function scheduleRender() { clearTimeout(rq); rq = setTimeout(render, 0); }

// ───────────────────────── 3D ─────────────────────────
const V3D_HOST = document.getElementById('v3dHost');
function place3d() {
  const slot = $('#v3dSlot');
  if (slot) { slot.appendChild(V3D_HOST); ensure3d(); schedule3d(); }
}
async function ensure3d() {
  if (scene3d || scene3dLoading || scene3dFailed) return;
  scene3dLoading = true;
  const host = V3D_HOST;
  host.innerHTML = '<div class="v3d-msg">3D…</div>';
  try {
    const mod = await import('./scene3d.js');
    host.innerHTML = '';
    scene3d = mod.createScene(host);
    schedule3d(true);
  } catch (e) {
    scene3dFailed = true;
    host.innerHTML = '<div class="v3d-msg">3D를 불러오지 못했습니다 / 3D failed to load</div>';
    console.error(e);
  } finally { scene3dLoading = false; }
}
let t3d = null, reframe3d = false;
function schedule3d(reframe) {
  if (reframe) reframe3d = true;
  clearTimeout(t3d);
  t3d = setTimeout(() => {
    if (!scene3d) return;
    const view = prefs.mode === 'simple' ? { ...project, screens: [{ ...active(), pos: { ...active().pos, x: 0, y: 0, z: 0, tilt: 0, yaw: 0 } }] } : project;
    scene3d.update(view, panels, sumsOf(), { selectedId: prefs.mode === 'pro' ? project.activeId : null, person: prefs.person, pattern: prefs.pattern, dark: prefs.theme === 'dark', typeLabel, reframe: reframe3d });
    reframe3d = false;
  }, 120);
}

// ───────────────────────── 값 연결 ─────────────────────────
function rootOf(path) {
  const [r, ...rest] = path.split('.');
  if (r === 'p') return [project, rest];
  if (r === 's') return [active(), rest];
  if (r === 'u') return [prefs, rest];
  return [null, rest];
}
function getPath(path) { let [o, keys] = rootOf(path); for (const k of keys) { if (o == null) return undefined; o = o[k]; } return o; }
function setPath(path, v) {
  let [o, keys] = rootOf(path);
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = v;
}
function parseVal(el, raw) {
  const k = el.dataset.kind;
  if (k === 'bool') return !!el.checked;
  if (k === 'num') { const n = Number(raw); return Number.isFinite(n) ? n : 0; }
  if (k === 'numOrEmpty') return raw === '' ? '' : Math.max(0, Number(raw) || 0);
  return raw;
}

// 값이 바뀐 뒤 따라오는 처리
function afterSet(path, el) {
  const s = active();
  if (path === 'p.canvas.preset' && project.canvas.preset !== 'custom') {
    const [w, h] = project.canvas.preset.split('x').map(Number);
    project.canvas.W = w; project.canvas.H = h;
  }
  if (path === 'p.canvas.W' || path === 'p.canvas.H') project.canvas.preset = 'custom';
  if (/^p\.canvas\.slices\.\d+\.rot$/.test(path)) { const i = +path.split('.')[3]; project.canvas.slices[i].rot = E.normDeg(project.canvas.slices[i].rot); }
  if (path === 's.type' && s.type === 'arc' && s.geometry === 'flat') s.geometry = 'cylinder';
  if (path === 's.cabling.mode' && s.cabling.mode === 'manual' && !s.cabling.counts.length) s.cabling.counts = derived[s.id].cab.ports.map((p) => p.ids.length);
  if (path === 's.cabling.capacity') s.cabling.capacity = Math.max(1000, s.cabling.capacity);
  if (path === 'p.activeId') { ui.tool = null; ui.addPanelId = null; }
  if (path === 'u.lang') setLang(prefs.lang);
  if (el && el.dataset.regen) S.regen(s, panels);
  if (path.startsWith('u.')) savePrefs(); else persist();
  if (path.startsWith('s.pos') || path === 's.geometry' || path === 's.jointAngle' || path === 's.arcAngle' || el && el.dataset.regen) schedule3d(path !== 's.pos.x' && !path.startsWith('s.pos'));
  else schedule3d();
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bind || el.dataset.kind !== 'str' || el.tagName === 'SELECT') return;
  setPath(el.dataset.bind, el.value);
  persist();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.actChange) { changeActs[el.dataset.actChange]?.(el); return; }
  if (!el.dataset || !el.dataset.bind) return;
  if (el.type === 'checkbox' && el.dataset.act) return;
  setPath(el.dataset.bind, parseVal(el, el.value));
  afterSet(el.dataset.bind, el);
  if (el.dataset['3d'] && !el.dataset.regen) { schedule3d(); savePrefs(); return; }
  if (el.dataset.kind === 'str' && el.tagName === 'INPUT' && !el.dataset.render && !el.closest('#main')) return;
  scheduleRender();
});

// ───────────────────────── 클릭 동작 ─────────────────────────
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.tm); toast.tm = setTimeout(() => { el.hidden = true; }, 2600);
}
function openModal(html) { const m = $('#modal'); m.querySelector('.modal-box').innerHTML = html; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function growScreen(kind) {
  const s = active();
  const p = panels[s.panelId];
  const d = kind.endsWith('+') ? 1 : -1;
  if (s.mix.on) {
    const sm = panels[s.mix.smallId];
    if (kind.startsWith('col')) s.mix.wM = Math.max(sm.w / 1000, Math.round((+s.mix.wM + d * sm.w / 1000) * 1000) / 1000);
    else s.mix.hM = Math.max(sm.h / 1000, Math.round((+s.mix.hM + d * sm.h / 1000) * 1000) / 1000);
  } else if (s.sizeMode === 'meters') {
    if (kind.startsWith('col')) s.wM = Math.max(p.w / 1000, Math.round((+s.wM + d * p.w / 1000) * 1000) / 1000);
    else s.hM = Math.max(p.h / 1000, Math.round((+s.hM + d * p.h / 1000) * 1000) / 1000);
  } else if (kind.startsWith('col')) s.cols = Math.max(1, s.cols + d);
  else s.rows = Math.max(1, s.rows + d);
  S.regen(s, panels);
}

function applyTool(cabId) {
  const s = active();
  const c = s.cabs.find((x) => x.id === cabId);
  if (!c) return;
  if (ui.tool === 'remove') { s.cabs = s.cabs.filter((x) => x.id !== cabId); }
  else if (ui.tool === 'rotate') {
    const nrot = c.rot ? 0 : 90;
    const d = E.cabDims({ ...c, rot: nrot }, panels[c.p]);
    if (overlaps(s, { x: c.x, y: c.y, w: d.w, h: d.h }, c.id)) return toast(t('overlap'));
    c.rot = nrot;
  } else if (ui.tool === 'swap') {
    const np = ui.addPanelId;
    if (!panels[np] || np === c.p) return;
    const d = E.cabDims({ ...c, p: np }, panels[np]);
    if (overlaps(s, { x: c.x, y: c.y, w: d.w, h: d.h }, c.id)) return toast(t('overlap'));
    c.p = np;
  } else return;
  s.edited = true;
  persist(); scheduleRender(); schedule3d();
}

function sliceSources() {
  return project.screens.map((s) => {
    const d = derived[s.id];
    return { name: screenName(s), offX: s.canvas.x, offY: s.canvas.y, W: d.pm.W, H: d.pm.H, cabs: d.order.map((id) => ({ label: d.labels[id], ...d.pm.map[id] })) };
  });
}

function fitCanvas() {
  const sizes = project.screens.map((s) => ({ w: derived[s.id].pm.W, h: derived[s.id].pm.H }));
  const pk = E.packCanvas(sizes);
  project.screens.forEach((s, i) => { s.canvas = { ...pk.pos[i] }; });
  project.canvas.W = Math.max(1, pk.W); project.canvas.H = Math.max(1, pk.H); project.canvas.preset = 'custom';
}

function rotateSelected(deg) {
  const sl = project.canvas.slices;
  const sel = sl.filter((s) => ui.selSlices.has(s.id));
  const groups = new Set(sel.map((s) => s.group).filter(Boolean));
  for (const g of groups) E.rotateGroup(sl.filter((s) => s.group === g), deg);
  for (const s of sel) if (!s.group) s.rot = E.normDeg((s.rot || 0) + deg);
}

const actions = {
  pick(el) {
    const s = active();
    if (el.dataset.k === 'mount') { s.mount = el.dataset.v; persist(); render(); return; }
    const env = el.dataset.v;
    if (env === s.env) return;
    s.env = env;
    const cur = panels[s.panelId];
    const size = sizesFor(env)[0].key;
    applyPanel(s, resolvePanel(env, size, cur && cur.builtin ? cur.pitchKey : '2.5'));
  },
  mode(el) { prefs.mode = el.dataset.v; savePrefs(); render(); schedule3d(true); },
  theme() { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', prefs.theme); savePrefs(); schedule3d(); },
  lang(el) { prefs.lang = el.dataset.v; setLang(prefs.lang); savePrefs(); render(); schedule3d(); },
  tab(el) { prefs.tab = el.dataset.v; savePrefs(); render(); },
  set(el) {
    const path = el.dataset.bind;
    const cur = getPath(path);
    const v = typeof cur === 'number' ? Number(el.dataset.v) : el.dataset.v;
    setPath(path, v);
    afterSet(path, el);
    render();
  },
  suggest(el) { const s = active(); s.cols = +el.dataset.c; s.rows = +el.dataset.r; s.sizeMode = 'grid'; S.regen(s, panels); persist(); render(); schedule3d(true); },
  tool(el) { ui.tool = el.dataset.v || null; render(); },
  grow(el) { growScreen(el.dataset.v); persist(); render(); schedule3d(true); },
  reset3d() { if (scene3d) scene3d.resetView(); },
  selScreen(el) { project.activeId = el.dataset.v; ui.tool = null; ui.addPanelId = null; persist(); render(); schedule3d(); },
  mount(el) { active().pos.tilt = +el.dataset.v; persist(); render(); schedule3d(); },
  delScreen() {
    if (project.screens.length < 2 || !confirm(t('confirmDelete'))) return;
    project.screens = project.screens.filter((s) => s.id !== project.activeId);
    project.activeId = project.screens[0].id;
    persist(); render(); schedule3d(true);
  },
  fitScene() { const w = $('#sceneWrap'); if (w) w.innerHTML = sceneMarkup(); schedule3d(true); },
  align(el) {
    const sums = sumsOf();
    const env = (s) => screenEnvelope(s, panels, sums[s.id]);
    const list = project.screens;
    if (el.dataset.v === 'left') { const x = Math.min(...list.map((s) => s.pos.x)); list.forEach((s) => { s.pos.x = x; }); }
    if (el.dataset.v === 'bottom') { const y = Math.min(...list.map((s) => s.pos.y)); list.forEach((s) => { s.pos.y = y; }); }
    if (el.dataset.v === 'top') { const top = Math.max(...list.map((s) => s.pos.y + env(s).h)); list.forEach((s) => { s.pos.y = top - env(s).h; }); }
    if (el.dataset.v === 'distribute' && list.length > 1) {
      const sorted = [...list].sort((a, b) => a.pos.x - b.pos.x);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const widths = sorted.map((s) => env(s).frontW);
      const spanTotal = (last.pos.x + widths[widths.length - 1]) - first.pos.x;
      const gap = Math.max(0, (spanTotal - widths.reduce((a, b) => a + b, 0)) / (sorted.length - 1));
      let x = first.pos.x;
      sorted.forEach((s, i) => { s.pos.x = Math.round(x); x += widths[i] + gap; });
    }
    persist(); render(); schedule3d(true);
  },
  port(el) {
    const c = active().cabling;
    if (el.dataset.v === '+') c.counts.push(0); else if (c.counts.length > 1) c.counts.pop();
    persist(); render();
  },
  addOutput() { const o = project.canvas.outputs; o.push({ name: 'Output ' + (o.length + 1), w: 1920, h: 1080 }); persist(); render(); },
  delOutput(el) {
    const i = +el.dataset.v;
    project.canvas.outputs.splice(i, 1);
    project.canvas.slices.forEach((s) => { if (s.output === i) s.output = 0; else if (s.output > i) s.output -= 1; });
    persist(); render();
  },
  fitCanvas() { fitCanvas(); persist(); render(); },
  mkSlices(el) {
    if (project.canvas.preset !== 'custom' && project.canvas.slices.length === 0) { /* 캔버스 크기는 그대로 둔다 */ }
    project.canvas.slices = E.buildSlices(sliceSources(), el.dataset.v, 0);
    ui.selSlices.clear();
    persist(); render();
  },
  selSlice(el) { const id = el.dataset.v; if (el.checked) ui.selSlices.add(id); else ui.selSlices.delete(id); render(); },
  selAll(el) { ui.selSlices = el.checked ? new Set(project.canvas.slices.map((s) => s.id)) : new Set(); render(); },
  group() { const g = 'G' + (++project.canvas.groups); project.canvas.slices.forEach((s) => { if (ui.selSlices.has(s.id)) s.group = g; }); persist(); render(); },
  ungroup() { project.canvas.slices.forEach((s) => { if (ui.selSlices.has(s.id)) s.group = null; }); persist(); render(); },
  rot(el) { rotateSelected(+el.dataset.v); persist(); render(); },
  rotCustom() { const v = Number($('#customRot').value) || 0; ui.customRot = v; rotateSelected(v); persist(); render(); },
  dlCsv() { S.download(S.safeName(project.name) + '-slices.csv', '﻿' + E.slicesCSV(project.canvas.slices, project.canvas.outputs), 'text/csv;charset=utf-8'); },
  dlSlices() { S.download(S.safeName(project.name) + '-slices.json', JSON.stringify({ canvas: { W: project.canvas.W, H: project.canvas.H }, outputs: project.canvas.outputs, slices: project.canvas.slices }, null, 2)); },
  arenaExport() {
    if (!project.canvas.slices.length) return toast(t('needSlices'));
    const xml = buildArenaXml({ name: project.name || 'ONLYONE LED', canvasW: project.canvas.W, canvasH: project.canvas.H, outputs: project.canvas.outputs, slices: project.canvas.slices });
    S.download(S.safeName(project.name) + '-arena.xml', xml, 'application/xml');
  },
  async arenaImport() {
    const f = await S.pickFile('.xml,application/xml,text/xml');
    if (!f) return;
    if (!/<ScreenSetup/i.test(f.text)) return toast(t('xmlError'));
    project.canvas.arenaBase = f.text; project.canvas.arenaBaseName = f.name;
    persist(); render();
  },
  arenaMerge() {
    if (!project.canvas.slices.length) return toast(t('needSlices'));
    try {
      const xml = mergeIntoArenaXml(project.canvas.arenaBase, { canvasW: project.canvas.W, canvasH: project.canvas.H, outputs: project.canvas.outputs, slices: project.canvas.slices });
      S.download(S.safeName(project.name) + '-arena-merged.xml', xml, 'application/xml');
    } catch { toast(t('xmlError')); }
  },
  panelNew() { panelForm(makePanel({ id: '', name: '' })); },
  panelEdit(el) { const p = custom.find((x) => x.id === el.dataset.v); if (p) panelForm(p); },
  panelDup(el) { const p = panels[el.dataset.v]; if (p) panelForm(makePanel({ ...p, id: '', builtin: false, name: p.name + ' ' + t('copy') })); },
  panelDel(el) {
    const id = el.dataset.v;
    const used = project.screens.some((s) => s.panelId === id || s.mix.smallId === id || s.mix.bigId === id || s.cabs.some((c) => c.p === id));
    if (used) return toast(t('inUse'));
    custom = custom.filter((p) => p.id !== id); S.saveCatalog(custom); panels = S.panelMap(custom); render();
  },
  panelSave() {
    const box = $('#modal .modal-box');
    const data = {};
    for (const f of PANEL_FIELDS) { const el = box.querySelector(`[name="${f.k}"]`); data[f.k] = el ? el.value : ''; }
    const missing = PANEL_FIELDS.filter((f) => f.req && (data[f.k] === '' || (f.type === 'number' && !(Number(data[f.k]) > 0))));
    if (missing.length) { box.querySelector('.form-err').hidden = false; return; }
    const id = box.dataset.id || E.uid('u');
    const p = makePanel({ ...data, id, builtin: false });
    const i = custom.findIndex((x) => x.id === id);
    if (i >= 0) custom[i] = p; else custom.push(p);
    S.saveCatalog(custom); panels = S.panelMap(custom);
    closeModal();
    if (i < 0 && prefs.tab !== 'catalog') { const s = active(); if (!s.mix.on) { s.panelId = id; S.regen(s, panels); } }
    persist(); render(); schedule3d(true);
  },
  closeModal() { closeModal(); },
  catExport() { S.download('onlyone-led-catalog.json', JSON.stringify({ type: 'onlyone-led-catalog', v: 1, panels: custom }, null, 2)); },
  async catImport() {
    const f = await S.pickFile('.json,application/json');
    if (!f) return;
    try {
      const j = JSON.parse(f.text);
      const list = Array.isArray(j) ? j : j.panels;
      if (!Array.isArray(list)) throw new Error('bad');
      for (const raw of list) {
        const p = makePanel({ ...raw, builtin: false });
        if (!p.id || panels[p.id] && panels[p.id].builtin) p.id = E.uid('u');
        const i = custom.findIndex((x) => x.id === p.id);
        if (i >= 0) custom[i] = p; else custom.push(p);
      }
      S.saveCatalog(custom); panels = S.panelMap(custom); render();
    } catch { toast(t('importError')); }
  },
  newProject() {
    if (!confirm(t('confirmNew'))) return;
    S.saveProject(project);
    project = S.newProject(); adoptProject(project); ui.selSlices.clear();
    persist(); render(); schedule3d(true);
  },
  openSaved() {
    const list = S.listSaved();
    const when = (ts) => new Date(ts).toLocaleString(getLang() === 'ko' ? 'ko-KR' : 'en-US');
    openModal(`<h2>${t('savedProjects')}</h2>${list.length ? `<div class="saved-list">${list.map((p) => `<div class="saved-item"><div class="grow"><b>${esc(p.name || t('untitled'))}</b> ${p.client ? '· ' + esc(p.client) : ''} ${p.rev ? '· Rev ' + esc(p.rev) : ''}<div class="when">${t('updated')} ${when(p.updated)} · ${(p.screens || []).length} ${t('screens')}</div></div>
      <button type="button" class="btn sm primary" data-act="openOne" data-v="${p.id}">${t('open')}</button><button type="button" class="btn sm danger" data-act="delSaved" data-v="${p.id}">${t('del')}</button></div>`).join('')}</div>` : `<p class="note">${t('noSaved')}</p>`}
      <div class="modal-foot"><button type="button" class="btn" data-act="closeModal">${t('close')}</button></div>`);
  },
  openOne(el) {
    S.saveProject(project);
    const p = S.listSaved().find((x) => x.id === el.dataset.v);
    if (!p) return;
    project = S.normalizeProject(p); adoptProject(project); ui.selSlices.clear(); ui.tool = null;
    closeModal(); persist(); render(); schedule3d(true);
  },
  delSaved(el) { if (el.dataset.v === project.id) return; S.deleteSaved(el.dataset.v); actions.openSaved(); },
  duplicate() { S.saveProject(project); project = S.duplicateProject(project, t('copy')); persist(); render(); toast(t('duplicate') + ' ✓'); },
  async importJson() {
    const f = await S.pickFile('.json,application/json');
    if (!f) return;
    try {
      const j = JSON.parse(f.text);
      if (!j || !Array.isArray(j.screens)) throw new Error('bad');
      S.saveProject(project);
      project = S.normalizeProject(j);
      if (S.listSaved().some((x) => x.id === project.id)) project.id = E.uid('prj');
      adoptProject(project); ui.selSlices.clear();
      persist(); render(); schedule3d(true);
    } catch { toast(t('importError')); }
  },
  exportJson() {
    project.customPanels = usedCustomPanels();
    S.download(S.safeName(project.name) + '.onlyone-led.json', JSON.stringify(project, null, 2));
  },
  exportReport() {
    openModal(`<h2>${t('exportTitle')}</h2>
      <div class="field"><span>${t('format')}</span><div class="row"><label class="chk"><input type="radio" name="fmt" value="pdf" checked> PDF</label><label class="chk"><input type="radio" name="fmt" value="png"> PNG</label></div></div>
      <div class="field" style="margin-top:12px"><span>${t('include')}</span><div class="row">
        ${[['results', 'incResults'], ['plan', 'incPlan'], ['cabling', 'incCabling'], ['view3d', 'inc3d'], ['slices', 'incSlices']].map(([k, l]) => `<label class="chk"><input type="checkbox" name="inc" value="${k}" checked> ${t(l)}</label>`).join('')}</div></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="closeModal">${t('cancel')}</button><button type="button" class="btn primary" data-act="doExport">${t('download')}</button></div>`);
  },
  async doExport(el) {
    const box = $('#modal .modal-box');
    const fmt = box.querySelector('input[name="fmt"]:checked').value;
    const include = {};
    box.querySelectorAll('input[name="inc"]').forEach((i) => { include[i.value] = i.checked; });
    el.disabled = true; el.textContent = t('generating');
    try {
      const rep = await import('./report.js');
      const pages = await rep.buildPages(reportContext(include));
      const base = S.safeName(project.name || 'onlyone-led-planner');
      if (fmt === 'pdf') await rep.exportPdf(pages, base + '.pdf'); else await rep.exportPngs(pages, base, S.download);
      closeModal();
    } catch (e) { console.error(e); toast('Export error'); el.disabled = false; el.textContent = t('download'); }
  },
};

// 기본 패널 고르기: 피치가 없으면 숫자가 가장 가까운 피치로
function resolvePanel(env, sizeKey, pitch) {
  const list = pitchesFor(sizeKey);
  const pk = list.includes(pitch) ? pitch : list.slice().sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0];
  return panelId(env, sizeKey, pk);
}
function applyPanel(s, id) {
  if (!panels[id]) return;
  s.panelId = id;
  const p = panels[id];
  if (p.builtin) s.env = p.env;
  if (!mountsFor(s.env).includes(s.mount)) s.mount = mountsFor(s.env)[0];
  if (s.env === 'indoor') s.mix.on = false;
  ui.addPanelId = null;
  S.regen(s, panels);
  persist(); render(); schedule3d(true);
}

const changeActs = {
  pickSize(el) {
    const s = active(), cur = panels[s.panelId];
    if (el.value.startsWith('c:')) return applyPanel(s, el.value.slice(2));
    applyPanel(s, resolvePanel(s.env, el.value, cur && cur.builtin ? cur.pitchKey : '3.9'));
  },
  pickPitch(el) { const s = active(), cur = panels[s.panelId]; if (cur && cur.builtin) applyPanel(s, panelId(cur.env, cur.sizeKey, el.value)); },
  addPanel(el) { ui.addPanelId = el.value; render(); },
  addScreen(el) {
    const type = el.value;
    if (!type) return;
    const sums = sumsOf();
    const right = Math.max(...project.screens.map((s) => s.pos.x + screenEnvelope(s, panels, sums[s.id]).frontW));
    const s = S.newScreen(type, project.screens.length + 1, active().panelId);
    s.pos.x = Math.round(right + 500);
    S.regen(s, panels);
    project.screens.push(s); project.activeId = s.id;
    persist(); render(); schedule3d(true);
  },
};

function reportContext(include) {
  const rows = project.screens.map((s) => {
    const d = derived[s.id];
    return [screenName(s), panelName(panels[s.panelId]), d.sum.count, `${m2(d.sum.widthMm)} × ${m2(d.sum.heightMm)} m`, `${d.sum.resW} × ${d.sum.resH}`, `${fmtNum(d.sum.areaM2, 2)} m²`, d.cab.ports.length];
  });
  const screens = project.screens.map((s) => {
    const d = derived[s.id], r = d.sum;
    const kv = [
      [t('secPanel'), panelName(panels[s.panelId])],
      [t('secGeometry'), t(s.geometry === 'flat' ? 'flat' : s.geometry)],
      [t('width') + ' × ' + t('height'), `${m2(r.widthMm)} × ${m2(r.heightMm)} m`],
      [t('cabinets'), Object.entries(r.counts).map(([id, n]) => `${n}× ${panels[id].w}×${panels[id].h}`).join(' + ')],
      [t('ledArea'), `${fmtNum(r.areaM2, 2)} m²`],
      [t('resolution'), `${r.resW} × ${r.resH} px`],
      [t('totalPx'), fmtNum(r.totalPx)],
      [t('ratio'), `${r.ratio} (${r.vs169 >= 0 ? '+' : ''}${(r.vs169 * 100).toFixed(2)}% ${t('vs169')})`],
      [t('weightPower'), r.weight !== null ? `${fmtNum(r.weight, 1)} kg · ${fmtNum(r.pMax)} W` : t('noData')],
      [t('portsUsed'), `${d.cab.ports.length} (${t('minPossible')} ${d.cab.minPorts})`],
    ];
    if (d.curv) kv.push([t('radius') + ' / ' + t('depth'), `${m2(d.curv.radius)} m / ${m2(d.curv.depth)} m`]);
    return {
      title: screenName(s), rows: kv,
      planSvg: planSvg(s.cabs, panels, { mode: 'cabs', dims: true, nums: true, labels: d.labels, pxMap: d.pm }),
      cableSvg: planSvg(s.cabs, panels, { mode: 'cable', dims: false, labels: d.labels, portOf: d.portOf, ports: d.cab.ports, pxMap: d.pm }),
      portHead: [t('port'), t('cabinets'), 'px'],
      portRows: d.cab.ports.map((p) => [`P${p.n}`, p.ids.length, `${fmtNum(p.px)} / ${fmtNum(d.cab.capacity)}`]),
    };
  });
  const sl = project.canvas.slices;
  return {
    t, lang: getLang(), project, include, screens,
    overviewHead: [t('name'), t('secPanel'), t('cabinets'), t('width') + ' × ' + t('height'), t('resolution'), t('ledArea'), t('portsUsed')],
    overviewRows: rows,
    snapshot: include.view3d && scene3d ? scene3d.snapshot() : null,
    slices: { head: [t('colName'), t('colInX'), t('colInY'), t('colInW'), t('colInH'), t('colOut'), t('colOutX'), t('colOutY'), t('colOutW'), t('colOutH'), t('colRot')], rows: sl.map((s) => [s.name, s.in.x, s.in.y, s.in.w, s.in.h, (project.canvas.outputs[s.output] || {}).name || '', s.out.x, s.out.y, s.out.w, s.out.h, s.rot || 0]) },
  };
}

function panelForm(p) {
  const secs = ['basic', 'size', 'mech', 'elec', 'module', 'curve', 'note'];
  const secLabel = { basic: 'secBasic', size: 'secSizeF', mech: 'secMech', elec: 'secElec', module: 'secModule', curve: 'secCurve', note: 'secNote' };
  const input = (f) => {
    const v = p[f.k] ?? '';
    const label = t('f_' + f.k) + (f.req ? ' *' : '');
    if (f.type === 'select') return field(label, `<select name="${f.k}">${opts(f.opts.map((o) => [o, t('o_' + o)]), v)}</select>`);
    return field(label, `<input type="${f.type}" name="${f.k}" value="${esc(v)}" ${f.type === 'number' ? 'step="any"' : ''}>`);
  };
  openModal(`<h2>${t('panelForm')}</h2>${secs.map((sec) => `<div class="form-sec"><h4>${t(secLabel[sec])}</h4><div class="grid3">${PANEL_FIELDS.filter((f) => f.sec === sec).map(input).join('')}</div></div>`).join('')}
    <p class="warn form-err" hidden>${t('required')}</p>
    <div class="modal-foot"><button type="button" class="btn" data-act="closeModal">${t('cancel')}</button><button type="button" class="btn primary" data-act="panelSave">${t('save')}</button></div>`);
  $('#modal .modal-box').dataset.id = p.id || '';
}

document.addEventListener('click', (e) => {
  const actEl = e.target.closest('[data-act]');
  if (actEl && !actEl.disabled) {
    if (actEl.type === 'checkbox' && actEl.dataset.act) { actions[actEl.dataset.act]?.(actEl, e); return; }
    if (actEl.tagName !== 'INPUT') { actions[actEl.dataset.act]?.(actEl, e); return; }
  }
  // 도면 편집
  const wrap = e.target.closest('#planWrap');
  if (wrap && ui.tool) {
    const slot = e.target.closest('[data-slot]');
    if (slot && ui.tool === 'add') {
      const [x, y] = slot.dataset.slot.split(',').map(Number);
      const s = active();
      s.cabs.push({ id: E.uid(), p: ui.addPanelId, x, y, rot: 0 });
      s.edited = true; persist(); scheduleRender(); schedule3d(); return;
    }
    const cab = e.target.closest('[data-cab]');
    if (cab) applyTool(cab.dataset.cab);
  }
});

// ───────────────────────── 씬 드래그 ─────────────────────────
document.addEventListener('pointerdown', (e) => {
  const g = e.target.closest('#sceneWrap [data-scr]');
  if (!g || e.button !== 0) return;
  const svg = g.ownerSVGElement;
  const id = g.dataset.scr;
  const s = scr(id);
  if (!s) return;
  e.preventDefault();
  const vb = svg.dataset.vb.split(',').map(Number);
  const ctm = svg.getScreenCTM().inverse();
  const toSvg = (ev) => { const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm); return { x: pt.x, y: pt.y }; };
  const start = toSvg(e);
  const p0 = { ...s.pos };
  const snap = (v) => (prefs.snap > 0 ? Math.round(v / prefs.snap) * prefs.snap : Math.round(v));
  const changedActive = project.activeId !== id;
  project.activeId = id;
  let moved = false;
  const onMove = (ev) => {
    const pt = toSvg(ev);
    const dx = pt.x - start.x, dy = pt.y - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    const v = prefs.sceneView;
    if (v === 'front' || v === 'developed') { s.pos.x = snap(p0.x + dx); s.pos.y = Math.max(0, snap(p0.y - dy)); }
    else if (v === 'top') { s.pos.x = snap(p0.x + dx); s.pos.z = snap(p0.z + dy); }
    else { s.pos.z = snap(p0.z + dx); s.pos.y = Math.max(0, snap(p0.y - dy)); }
    $('#sceneWrap').innerHTML = sceneMarkup(vb);
    schedule3d();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (moved || changedActive) { persist(); render(); }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
});

// ───────────────────────── 시작 ─────────────────────────
setLang(prefs.lang);
document.documentElement.setAttribute('data-theme', prefs.theme);
render();
persist();
