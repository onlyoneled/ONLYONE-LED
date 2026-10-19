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

function preset(id, w, h, px, py, label, family, use) {
  return makePanel({
    id, name: `${w}×${h} ${label}`, brand: '', model: '', use,
    w, h, px, py, pitchLabel: label, family, builtin: true,
    curve: family === 'rental-500' ? 'yes' : 'no',
    build: family === 'rental-500' ? 'curvedLock' : 'rigid',
    angMin: family === 'rental-500' ? -10 : null,
    angMax: family === 'rental-500' ? 10 : null,
    angStep: family === 'rental-500' ? 2.5 : null,
  });
}

export const GENERIC_PANELS = [
  preset('g500-p26', 500, 500, 192, 192, 'P2.6', 'rental-500', 'rental'),
  preset('g500-p29', 500, 500, 168, 168, 'P2.9', 'rental-500', 'rental'),
  preset('g500-p39', 500, 500, 128, 128, 'P3.9', 'rental-500', 'rental'),
  preset('g500-p48', 500, 500, 104, 104, 'P4.8', 'rental-500', 'rental'),
  preset('g1000-p26', 500, 1000, 192, 384, 'P2.6', 'rental-500', 'rental'),
  preset('g1000-p29', 500, 1000, 168, 336, 'P2.9', 'rental-500', 'rental'),
  preset('g1000-p39', 500, 1000, 128, 256, 'P3.9', 'rental-500', 'rental'),
  preset('g1000-p48', 500, 1000, 104, 208, 'P4.8', 'rental-500', 'rental'),
  preset('g640-p25', 640, 480, 256, 192, 'P2.5', 'install-640', 'indoor'),
  preset('g640-p4', 640, 480, 160, 120, 'P4', 'install-640', 'indoor'),
  preset('g960-p4', 960, 960, 240, 240, 'P4', 'install-960', 'outdoor'),
  preset('g960-p5', 960, 960, 192, 192, 'P5', 'install-960', 'outdoor'),
  preset('g960-p667', 960, 960, 144, 144, 'P6.67', 'install-960', 'outdoor'),
  preset('g960-p8', 960, 960, 120, 120, 'P8', 'install-960', 'outdoor'),
  preset('g960-p10', 960, 960, 96, 96, 'P10', 'install-960', 'outdoor'),
];

export const DEFAULT_PANEL_ID = 'g1000-p39';
