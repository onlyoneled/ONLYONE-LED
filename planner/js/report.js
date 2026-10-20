// planner/js/report.js — PDF / PNG 보고서 (캔버스로 그려서 한글 폰트 문제 없이 출력)
const PAGE_W = 1754, PAGE_H = 1240; // A4 가로, 150dpi
const M = 70;
const LIGHT = {
  '--cab': '#eef1f5', '--cab-alt': '#dbe7ff', '--cab-line': '#4b5563', '--ink': '#111827', '--mute': '#6b7280',
  '--accent': '#2563eb', '--accent-soft': '#dbeafe', '--slot-fill': 'transparent', '--grid': '#e5e7eb', '--panel-2': '#f9fafb',
};

function resolveVars(svg) { return svg.replace(/var\((--[a-z0-9-]+)\)/g, (m, k) => LIGHT[k] || '#888'); }

function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([resolveVars(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
function urlToImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

function fitDraw(g, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function newPage(ctx) {
  const cv = document.createElement('canvas');
  cv.width = PAGE_W; cv.height = PAGE_H;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, PAGE_W, PAGE_H);
  // 머리글
  g.fillStyle = '#111827'; g.fillRect(0, 0, PAGE_W, 96);
  g.fillStyle = '#fff'; g.font = '900 34px "Gothic A1", sans-serif'; g.textBaseline = 'middle';
  g.fillText('ONLYONE LED', M, 48);
  g.font = '400 22px "Gothic A1", sans-serif'; g.fillStyle = '#cbd5e1';
  g.fillText(ctx.t('reportTitle'), M + 250, 50);
  g.textAlign = 'right';
  const meta = [ctx.project.name || ctx.t('untitled'), ctx.project.client, ctx.project.rev ? 'Rev ' + ctx.project.rev : '', new Date().toLocaleDateString(ctx.lang === 'ko' ? 'ko-KR' : 'en-US')].filter(Boolean).join('  ·  ');
  g.fillText(meta, PAGE_W - M, 50);
  g.textAlign = 'left';
  // 꼬리말
  g.fillStyle = '#9ca3af'; g.font = '400 16px "Gothic A1", sans-serif';
  g.fillText(ctx.t('disclaimer'), M, PAGE_H - 36);
  g.textAlign = 'right'; g.fillText('only1led.com', PAGE_W - M, PAGE_H - 36); g.textAlign = 'left';
  return { cv, g };
}

function heading(g, txt, x, y) { g.fillStyle = '#111827'; g.font = '700 28px "Gothic A1", sans-serif'; g.textBaseline = 'alphabetic'; g.fillText(txt, x, y); }

function kvTable(g, rows, x, y, w) {
  const rh = 42;
  rows.forEach(([k, v], i) => {
    const yy = y + i * rh;
    if (i % 2 === 0) { g.fillStyle = '#f3f4f6'; g.fillRect(x, yy, w, rh); }
    g.fillStyle = '#6b7280'; g.font = '400 19px "Gothic A1", sans-serif'; g.textBaseline = 'middle';
    g.fillText(k, x + 14, yy + rh / 2);
    g.fillStyle = '#111827'; g.font = '700 19px "Gothic A1", sans-serif'; g.textAlign = 'right';
    g.fillText(String(v), x + w - 14, yy + rh / 2, w * 0.6); g.textAlign = 'left';
  });
  return y + rows.length * rh;
}

function gridTable(g, head, rows, x, y, colW) {
  const rh = 36;
  g.fillStyle = '#111827'; g.fillRect(x, y, colW.reduce((a, b) => a + b, 0), rh);
  g.font = '700 16px "Gothic A1", sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  let xx = x; head.forEach((h, i) => { g.fillText(h, xx + 8, y + rh / 2, colW[i] - 12); xx += colW[i]; });
  rows.forEach((r, ri) => {
    const yy = y + (ri + 1) * rh;
    if (ri % 2 === 1) { g.fillStyle = '#f3f4f6'; g.fillRect(x, yy, colW.reduce((a, b) => a + b, 0), rh); }
    g.fillStyle = '#111827'; g.font = '400 16px "IBM Plex Mono", monospace';
    let x2 = x; r.forEach((c, i) => { g.fillText(String(c), x2 + 8, yy + rh / 2, colW[i] - 12); x2 += colW[i]; });
  });
  return y + (rows.length + 1) * rh;
}

let jspdfPromise = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!jspdfPromise) jspdfPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = rej;
    document.head.appendChild(s);
  });
  return jspdfPromise;
}

// ctx: { t, lang, project, overviewRows, screens:[{title, rows:[[k,v]], planSvg, cableSvg, portRows}], snapshot, slices:{head, rows}, include }
export async function buildPages(ctx) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const pages = [];
  const inc = ctx.include;
  // 1쪽: 개요 + 3D
  {
    const { cv, g } = newPage(ctx);
    heading(g, ctx.t('screens'), M, 160);
    let y = gridTable(g, ctx.overviewHead, ctx.overviewRows, M, 185, [300, 330, 150, 220, 220, 170, 160]);
    if (inc.view3d && ctx.snapshot) {
      try { const img = await urlToImage(ctx.snapshot); fitDraw(g, img, M, y + 30, PAGE_W - M * 2, PAGE_H - y - 110); } catch { /* 3D 없음 */ }
    }
    pages.push(cv);
  }
  for (const s of ctx.screens) {
    const { cv, g } = newPage(ctx);
    heading(g, s.title, M, 160);
    let y = 185;
    if (inc.results) y = kvTable(g, s.rows, M, y, 520);
    const right = M + 560, rw = PAGE_W - right - M;
    const both = inc.plan && inc.cabling && s.cableSvg;
    const top = 130, avail = PAGE_H - top - 90;
    if (inc.plan && s.planSvg) { try { fitDraw(g, await svgToImage(s.planSvg), right, top, rw, both ? avail / 2 - 10 : avail); } catch { /* skip */ } }
    if (inc.cabling && s.cableSvg) { try { fitDraw(g, await svgToImage(s.cableSvg), right, both ? top + avail / 2 + 10 : top, rw, both ? avail / 2 - 10 : avail); } catch { /* skip */ } }
    if (inc.cabling && s.portRows && s.portRows.length) gridTable(g, s.portHead, s.portRows.slice(0, 14), M, y + 30, [120, 160, 240]);
    pages.push(cv);
    // 전원선 배선도가 있으면 화면마다 한 쪽 더
    if (inc.power && s.powerSvg) {
      const pg = newPage(ctx);
      heading(pg.g, `${s.title} · ${ctx.t('incPower')}`, M, 160);
      if (s.powerRows.length) gridTable(pg.g, s.powerHead, s.powerRows.slice(0, 20), M, 185, [140, 160, 220]);
      try { fitDraw(pg.g, await svgToImage(s.powerSvg), M + 560, 130, PAGE_W - M * 2 - 560, PAGE_H - 220); } catch { /* skip */ }
      pages.push(pg.cv);
    }
  }
  if (inc.slices && ctx.slices && ctx.slices.rows.length) {
    const per = 26;
    for (let i = 0; i < ctx.slices.rows.length; i += per) {
      const { cv, g } = newPage(ctx);
      heading(g, ctx.t('slices'), M, 160);
      gridTable(g, ctx.slices.head, ctx.slices.rows.slice(i, i + per), M, 185, [330, 110, 110, 110, 110, 190, 110, 110, 110, 110, 100]);
      pages.push(cv);
    }
  }
  return pages;
}

export async function exportPdf(pages, filename) {
  const { jsPDF } = await loadJsPDF();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  pages.forEach((cv, i) => {
    if (i) pdf.addPage('a4', 'landscape');
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  });
  pdf.save(filename);
}

export async function exportPngs(pages, base, download) {
  for (let i = 0; i < pages.length; i++) {
    const blob = await new Promise((r) => pages[i].toBlob(r, 'image/png'));
    download(pages.length > 1 ? `${base}-${i + 1}.png` : `${base}.png`, blob);
  }
}
