const XLSX = require('xlsx');
const { resolveColumns, isNumeric } = require('./cost-column-resolver.js');
const { isQuoteSheet } = require('./cost-quote-gate.js');
const { classifyItem, extractAttributes } = require('./cost-classifier.js');

function dumpWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = {};
    const ref = ws['!ref'];
    if (!ref) return { sheet: name, rows };
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;
        rows[r + 1] = rows[r + 1] || {};
        rows[r + 1][c + 1] = cell.v;
      }
    }
    return { sheet: name, rows };
  });
}

function extractDateFromFilename(filename) {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(filename);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectCurrency(sheet, cols) {
  const label = String(sheet.rows[cols.headerRow]?.[cols.amountCol] || '').toLowerCase();
  if (label.includes('rmb') || label.includes('cny') || label.includes('¥') || label.includes('元')) return 'CNY';
  if (label.includes('jpy') || label.includes('円')) return 'JPY';
  if (label.includes('krw') || label.includes('원')) return 'KRW';
  return 'CNY';
}

function extractFile(arrayBuffer, filename, uploadDate) {
  const date = extractDateFromFilename(filename) || uploadDate;
  const result = { included: false, excludeReason: null, lineItems: [], unclassifiedRows: [] };

  let sheets;
  try {
    sheets = dumpWorkbook(arrayBuffer);
  } catch (e) {
    result.excludeReason = `읽기 실패: ${e.message}`;
    return result;
  }

  const rejectedReasons = [];
  let anyQuoteSheet = false;

  for (const sheet of sheets) {
    const { ok, reason } = isQuoteSheet(sheet);
    if (!ok) { rejectedReasons.push(reason); continue; }
    anyQuoteSheet = true;

    const cols = resolveColumns(sheet);
    const currency = detectCurrency(sheet, cols);
    const rows = sheet.rows;
    const headerRow = cols.headerRow;
    let lastName = '';
    let lastDesc = '';

    for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      if (r <= headerRow) continue;
      const row = rows[r];
      const qty = row[cols.qtyCol];
      if (!isNumeric(qty)) continue;

      const name = String(row[cols.nameCol] ?? '').trim();
      const desc = String(row[cols.descCol] ?? '').trim();
      if (name) lastName = name;
      if (desc) lastDesc = desc;
      const effName = name || lastName;
      const effDesc = desc || lastDesc;

      const price = cols.priceCol !== null ? row[cols.priceCol] : undefined;
      const unit = cols.unitCol !== null ? row[cols.unitCol] : undefined;
      let amount = row[cols.amountCol];
      if (!isNumeric(amount)) amount = qty * (isNumeric(price) ? price : 0);

      const category = classifyItem(effName, effDesc);
      const item = {
        category, name: effName, desc: effDesc, qty,
        unit: unit !== undefined ? String(unit) : null,
        price: isNumeric(price) ? price : null, amount, currency,
        attributes: category ? extractAttributes(category, effName, effDesc) : {},
        sheet: sheet.sheet, date,
      };

      if (!isNumeric(price) || price <= 0) {
        result.unclassifiedRows.push(item);
        continue;
      }
      if (category) result.lineItems.push(item);
      else result.unclassifiedRows.push(item);
    }
  }

  if (anyQuoteSheet) {
    result.included = true;
  } else {
    result.excludeReason = rejectedReasons.length
      ? Array.from(new Set(rejectedReasons)).join('; ')
      : '견적성 시트 없음';
  }

  return result;
}

module.exports = { dumpWorkbook, extractFile, extractDateFromFilename };
