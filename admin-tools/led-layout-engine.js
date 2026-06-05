// admin-tools/led-layout-engine.js
const MODULES = [
  { id: 'p2.5',   pitch: 2.5,   resW: 128, resH: 64,  w: 35   },
  { id: 'p2.0',   pitch: 2.0,   resW: 160, resH: 80,  w: 33.3 },
  { id: 'p1.86',  pitch: 1.86,  resW: 172, resH: 86,  w: 33.3 },
  { id: 'p1.538', pitch: 1.538, resW: 208, resH: 104, w: 35   },
  { id: 'p1.25',  pitch: 1.25,  resW: 256, resH: 128, w: 38   },
];
const MODULE_MM_W = 320, MODULE_MM_H = 160;
const PX_PER_LINE = 650000;

const CABINET_WEIGHT = {
  '640x640': 8.9, '640x480': 7.0, '640x320': 4.8, '640x160': 2.3,
  '320x640': 4.2, '320x480': 4.1, '320x320': 2.2, '320x160': 1.8,
};
function cabWeight(w, h) { return CABINET_WEIGHT[w + 'x' + h] || 0; }

const BREAKER_SIZES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800];
function nextBreaker(a) { for (const b of BREAKER_SIZES) if (b >= a) return b; return Math.ceil(a / 100) * 100; }
const SINGLE_V = 220, THREE_V = 380, PF = 0.8;

function decompWidth(W) {
  const usable = Math.floor(W / 320) * 320;
  const discard = W - usable;
  const units = usable / 320;
  const cols = [];
  const n640 = Math.floor(units / 2);
  for (let i = 0; i < n640; i++) cols.push(640);
  if (units % 2 === 1) cols.push(320);
  return { cols, usable, discard };
}

function decompHeight(H) {
  const usable = Math.floor(H / 160) * 160;
  const discard = H - usable;
  const rows = [];
  const q = Math.floor(usable / 480);
  const r = usable - q * 480;
  if (r === 0) {
    for (let i = 0; i < q; i++) rows.push(480);
  } else if (r === 320) {
    for (let i = 0; i < q; i++) rows.push(480);
    rows.push(320);
  } else if (r === 160) {
    if (q >= 1) { for (let i = 0; i < q - 1; i++) rows.push(480); rows.push(640); }
    else rows.push(160);
  } else {
    throw new Error('decompHeight: unexpected remainder ' + r);
  }
  return { rows, usable, discard };
}

function cabRole(w, h) {
  if (w === 640 && h === 480) return 'base';
  if (w === 640 && h === 640) return 'combine';
  return 'fill';
}

function computeLED(input) {
  const m = MODULES.find(x => x.id === input.modelId) || MODULES[0];
  const inW = Math.max(0, Math.round(input.W || 0));
  const inH = Math.max(0, Math.round(input.H || 0));
  const dw = decompWidth(inW);
  const dh = decompHeight(inH);
  const cols = dw.cols, rows = dh.rows;
  const tally = {};
  for (const w of cols) for (const h of rows) {
    const key = w + 'x' + h;
    if (!tally[key]) tally[key] = { w, h, n: 0, role: cabRole(w, h) };
    tally[key].n++;
  }
  const cabinets = Object.values(tally).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  cabinets.forEach(c => { c.kg = cabWeight(c.w, c.h); c.kgTotal = c.kg * c.n; });
  const totalCabinets = cols.length * rows.length;
  const totalWeight = cabinets.reduce((s, c) => s + c.kgTotal, 0);
  const modCountW = dw.usable / 320;
  const modCountH = dh.usable / 160;
  const totalModules = modCountW * modCountH;
  const totalResW = modCountW * m.resW;
  const totalResH = modCountH * m.resH;
  const totalPx = totalResW * totalResH;
  const usableW = dw.usable, usableH = dh.usable;
  const area = (usableW / 1000) * (usableH / 1000);
  const power = totalModules * m.w;
  const ampSingle = power / SINGLE_V;
  const ampThree = power / (Math.sqrt(3) * THREE_V * PF);
  const brkSingle = nextBreaker(ampSingle);
  const brkThree = nextBreaker(ampThree);
  const dataLines = totalPx > 0 ? Math.ceil(totalPx / PX_PER_LINE) : 0;
  return {
    model: m, inW, inH,
    cols, rows, cabinets, totalCabinets,
    usableW, usableH, discardW: dw.discard, discardH: dh.discard,
    modCountW, modCountH, totalModules,
    totalResW, totalResH, totalPx,
    area, power, ampSingle, ampThree, brkSingle, brkThree,
    dataLines, totalWeight,
    tooSmall: usableW === 0 || usableH === 0,
  };
}

function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
function fmt2(n) { return (Math.round(n * 100) / 100).toFixed(2); }

module.exports = {
  MODULES, MODULE_MM_W, MODULE_MM_H, PX_PER_LINE,
  CABINET_WEIGHT, BREAKER_SIZES, SINGLE_V, THREE_V, PF,
  cabWeight, nextBreaker, decompWidth, decompHeight, cabRole,
  computeLED, fmtInt, fmt1, fmt2,
};
