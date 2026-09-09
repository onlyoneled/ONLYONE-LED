const { resolveColumns, isNumeric } = require('./cost-column-resolver.js');

function isQuoteSheet(sheet) {
  const cols = resolveColumns(sheet);
  if (!cols) return { ok: false, reason: '헤더(QTY/PRICE/AMOUNT) 패턴을 찾을 수 없음' };

  const rows = sheet.rows;
  const { headerRow, priceCol, qtyCol } = cols;
  if (priceCol === null) return { ok: false, reason: '단가 컬럼을 특정할 수 없음' };

  const dataRows = Object.keys(rows).map(Number)
    .filter((r) => r > headerRow && rows[r][qtyCol] !== undefined)
    .map((r) => rows[r]);
  if (!dataRows.length) return { ok: false, reason: '데이터 행 없음' };

  const nonzero = dataRows.filter((row) => isNumeric(row[priceCol]) && row[priceCol] > 0);
  if (!nonzero.length) return { ok: false, reason: '모든 단가가 0 또는 비어있음 (내부 메모로 판단)' };

  return { ok: true, reason: 'ok' };
}

module.exports = { isQuoteSheet };
