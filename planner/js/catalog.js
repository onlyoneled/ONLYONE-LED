// planner/js/catalog.js — 패널 스키마와 기본 프리셋
// 기본 프리셋은 업계에서 흔한 규격을 바탕으로 한 범용 값이다. 무게·전력은 비워둔다(제품별로 다름).

export const USES = ['indoor', 'outdoor', 'rental', 'install', 'floor', 'transparent'];
export const BUILDS = ['rigid', 'flexible', 'curvedLock'];
export const MOUNTS = ['any', 'hang', 'stack', 'wall'];

// 사용자 정의 패널 폼에 쓰이는 필드 정의. type: text | number | select
export const PANEL_FIELDS = [
  { k: 'name', type: 'text', req: true, sec: 'basic' },
  { k: 'brand', type: 'text', sec: 'basic' },
  { k: 'model', type: 'text', sec: 'basic' },
  { k: 'use', type: 'select', opts: USES, sec: 'basic' },
  { k: 'w', type: 'number', req: true, sec: 'size' },
  { k: 'h', type: 'number', req: true, sec: 'size' },
  { k: 'px', type: 'number', req: true, sec: 'size' },
  { k: 'py', type: 'number', req: true, sec: 'size' },
  { k: 'pitchLabel', type: 'text', sec: 'size' },
  { k: 'family', type: 'text', sec: 'mech' },
  { k: 'familyConfirmed', type: 'select', opts: ['no', 'yes'], sec: 'mech' },
  { k: 'mount', type: 'select', opts: MOUNTS, sec: 'mech' },
  { k: 'weight', type: 'number', sec: 'elec' },
  { k: 'pMax', type: 'number', sec: 'elec' },
  { k: 'pAvg', type: 'number', sec: 'elec' },
  { k: 'perCase', type: 'number', sec: 'elec' },
  { k: 'modW', type: 'number', sec: 'module' },
  { k: 'modH', type: 'number', sec: 'module' },
  { k: 'modPx', type: 'number', sec: 'module' },
  { k: 'modPy', type: 'number', sec: 'module' },
  { k: 'curve', type: 'select', opts: ['no', 'yes'], sec: 'curve' },
  { k: 'build', type: 'select', opts: BUILDS, sec: 'curve' },
  { k: 'angMin', type: 'number', sec: 'curve' },
  { k: 'angMax', type: 'number', sec: 'curve' },
  { k: 'angStep', type: 'number', sec: 'curve' },
  { k: 'rMin', type: 'number', sec: 'curve' },
  { k: 'source', type: 'text', sec: 'note' },
  { k: 'notes', type: 'text', sec: 'note' },
];

const BLANK = {
  id: '', name: '', brand: '', model: '', use: 'rental',
  w: 500, h: 500, px: 128, py: 128, pitchLabel: '',
  family: '', familyConfirmed: 'no', mount: 'any',
  weight: null, pMax: null, pAvg: null, perCase: null,
  modW: null, modH: null, modPx: null, modPy: null,
  curve: 'no', build: 'rigid', angMin: null, angMax: null, angStep: null, rMin: null,
  source: '', notes: '', builtin: false,
  env: '', sizeKey: '', pitchKey: '', hidden: false,
};

export function makePanel(partial = {}) {
  const p = { ...BLANK, ...partial };
  for (const f of PANEL_FIELDS) {
    if (f.type === 'number' && p[f.k] !== null && p[f.k] !== '' && p[f.k] !== undefined) {
      const n = Number(p[f.k]);
      p[f.k] = Number.isFinite(n) ? n : null;
    } else if (f.type === 'number' && (p[f.k] === '' || p[f.k] === undefined)) {
      p[f.k] = null;
    }
  }
  return p;
}

export function pitchOf(p) { return p.px ? p.w / p.px : 0; }

// ── 기본 패널: 용도(옥외/실내) → 설치 형태(설치/렌탈) → 사이즈 → 피치 ──
// 피치 목록의 px 값은 기준 길이(base mm)당 픽셀 수. 패널 픽셀 = 패널 길이 / base × px
const PITCH_SETS = {
  out500: { base: 500, list: [['2.6', 192], ['2.9', 168], ['3.9', 128], ['4.8', 104]] },
  out960: { base: 960, list: [['4', 240], ['5', 192], ['6.67', 144], ['8', 120], ['10', 96]] },
  // 실내: 320×160 모듈 기준 (KI 시리즈)
  in320: { base: 320, list: [['1.25', 256], ['1.53', 208], ['1.86', 172], ['2', 160], ['2.5', 128]] },
};

// 실내 모듈(320×160) 1장당 소비전력 W, 캐비닛 무게 kg — 기존 배치 계산기(admin-tools/led-layout-engine.js)와 같은 값
const IN_MODULE_W = { '1.25': 38, '1.53': 35, '1.86': 33.3, '2': 33.3, '2.5': 35 };
const IN_WEIGHT = { '640x640': 8.9, '640x480': 7.0, '640x320': 4.8, '640x160': 2.3, '320x640': 4.2, '320x480': 4.1, '320x320': 2.2, '320x160': 1.8 };

// hidden: 패널 선택에는 안 보이고, 크기에 맞춰 자동 조합할 때만 쓰는 사이즈
export const SIZES = [
  { key: '500x1000', w: 500, h: 1000, env: 'outdoor', mounts: ['install', 'rental'], pitch: 'out500', curve: true },
  { key: '1000x1000', w: 1000, h: 1000, env: 'outdoor', mounts: ['install', 'rental'], pitch: 'out500', curve: true },
  { key: '960x960', w: 960, h: 960, env: 'outdoor', mounts: ['install', 'rental'], pitch: 'out960' },
  { key: '500x500', w: 500, h: 500, env: 'outdoor', mounts: ['install', 'rental'], pitch: 'out500', curve: true, hidden: true },
  { key: '640x640', w: 640, h: 640, env: 'indoor', mounts: ['install'], pitch: 'in320' },
  { key: '640x480', w: 640, h: 480, env: 'indoor', mounts: ['install'], pitch: 'in320' },
  { key: '640x320', w: 640, h: 320, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
  { key: '640x160', w: 640, h: 160, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
  { key: '320x640', w: 320, h: 640, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
  { key: '320x480', w: 320, h: 480, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
  { key: '320x320', w: 320, h: 320, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
  { key: '320x160', w: 320, h: 160, env: 'indoor', mounts: ['install'], pitch: 'in320', hidden: true },
];
export const ENVS = ['outdoor', 'indoor'];

export function panelId(env, sizeKey, pitch) { return `${env}-${sizeKey}-p${pitch}`; }
export function sizesFor(env, withHidden = false) { return SIZES.filter((s) => s.env === env && (withHidden || !s.hidden)); }
export function pitchesFor(sizeKey) { const s = SIZES.find((x) => x.key === sizeKey); return s ? PITCH_SETS[s.pitch].list.map(([p]) => p) : []; }
export function mountsFor(env) { return env === 'indoor' ? ['install'] : ['install', 'rental']; }

function build(size, pitch, perBase) {
  const set = PITCH_SETS[size.pitch];
  const px = Math.round((size.w / set.base) * perBase), py = Math.round((size.h / set.base) * perBase);
  const indoor = size.env === 'indoor';
  const modules = indoor ? (size.w / 320) * (size.h / 160) : 0;
  return makePanel({
    id: panelId(size.env, size.key, pitch), name: `${size.w}×${size.h} P${pitch}`,
    use: size.env, env: size.env, sizeKey: size.key, pitchKey: pitch, hidden: !!size.hidden,
    w: size.w, h: size.h, px, py, pitchLabel: 'P' + pitch, family: `${size.env}-${size.pitch}`, familyConfirmed: 'yes', builtin: true,
    weight: indoor ? IN_WEIGHT[size.key] ?? null : null,
    pMax: indoor ? Math.round(modules * IN_MODULE_W[pitch] * 10) / 10 : null,
    modW: indoor ? 320 : null, modH: indoor ? 160 : null,
    modPx: indoor ? perBase : null, modPy: indoor ? perBase / 2 : null,
    curve: size.curve ? 'yes' : 'no', build: size.curve ? 'curvedLock' : 'rigid',
    angMin: size.curve ? -10 : null, angMax: size.curve ? 10 : null, angStep: size.curve ? 2.5 : null,
    source: indoor ? 'KI series spec' : '',
  });
}

export const GENERIC_PANELS = SIZES.flatMap((s) => PITCH_SETS[s.pitch].list.map(([p, per]) => build(s, p, per)));

export const DEFAULT_PANEL_ID = panelId('outdoor', '500x1000', '3.9');
