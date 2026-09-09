const QTY_KW = ['qty', 'quantity', '수 량', '수량', '數量', '数量', 'ea'];
const PRICE_KW = ['price', '단가', '单价'];
const UNIT_KW = ['unit', '단위'];
const AMOUNT_KW = ['amount', 'total', '소계', '总价', 'subtotal', 'toatl'];
const NAME_KW = ['name', 'item', '设备名称', '품목', 'itern', 'device'];
const DESC_KW = ['description', '规格', 'spec', 'detail', '型号'];

function isNumeric(v) {
  return typeof v === 'number' && !Number.isNaN(v);
}

function textOf(v) {
  return v === null || v === undefined ? '' : String(v).trim().toLowerCase();
}

function findCol(row, keywords) {
  for (const col of Object.keys(row).map(Number).sort((a, b) => a - b)) {
    const t = textOf(row[col]);
    if (keywords.some((kw) => t.includes(kw))) return col;
  }
  return null;
}

function findHeaderRow(rows) {
  const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b).slice(0, 15);
  for (const r of rowNums) {
    const row = rows[r];
    const hasQty = findCol(row, QTY_KW) !== null;
    const hasAmount = findCol(row, AMOUNT_KW) !== null;
    const hasNameOrDesc = findCol(row, NAME_KW) !== null || findCol(row, DESC_KW) !== null;
    if (hasQty && hasAmount && hasNameOrDesc) return r;
  }
  return null;
}

function resolveColumns(sheet) {
  const rows = sheet.rows;
  const headerRow = findHeaderRow(rows);
  if (headerRow === null) return null;
  const header = rows[headerRow];

  const qtyCol = findCol(header, QTY_KW);
  const amountCol = findCol(header, AMOUNT_KW);
  const nameCol = findCol(header, NAME_KW);
  const descCol = findCol(header, DESC_KW);
  const priceLabelCol = findCol(header, PRICE_KW);
  const unitLabelCol = findCol(header, UNIT_KW);

  if (qtyCol === null || amountCol === null) return null;

  const dataRows = Object.keys(rows).map(Number)
    .filter((r) => r > headerRow && rows[r][qtyCol] !== undefined && rows[r][amountCol] !== undefined)
    .sort((a, b) => a - b)
    .slice(0, 8)
    .map((r) => rows[r]);

  let priceCol = priceLabelCol;
  let unitCol = unitLabelCol;

  if (priceLabelCol !== null && unitLabelCol !== null && dataRows.length) {
    let labelOk = 0;
    let swappedOk = 0;
    for (const row of dataRows) {
      const qty = row[qtyCol];
      const amt = row[amountCol];
      if (!isNumeric(qty) || !isNumeric(amt)) continue;
      const pAtPriceLabel = row[priceLabelCol];
      const pAtUnitLabel = row[unitLabelCol];
      const tol = Math.max(1, amt * 0.05);
      if (isNumeric(pAtPriceLabel) && Math.abs(qty * pAtPriceLabel - amt) < tol) labelOk++;
      if (isNumeric(pAtUnitLabel) && Math.abs(qty * pAtUnitLabel - amt) < tol) swappedOk++;
    }
    if (swappedOk > labelOk) {
      priceCol = unitLabelCol;
      unitCol = priceLabelCol;
    }
  }

  if (priceCol === null) {
    for (const col of Object.keys(header).map(Number)) {
      if ([qtyCol, amountCol, nameCol, descCol].includes(col)) continue;
      let candidateOk = 0;
      for (const row of dataRows) {
        const qty = row[qtyCol];
        const amt = row[amountCol];
        const v = row[col];
        if (isNumeric(qty) && isNumeric(amt) && isNumeric(v) && qty) {
          if (Math.abs(qty * v - amt) < Math.max(1, amt * 0.05)) candidateOk++;
        }
      }
      if (candidateOk >= Math.max(1, Math.floor(dataRows.length / 2))) {
        priceCol = col;
        break;
      }
    }
  }

  return { headerRow, nameCol, descCol, qtyCol, unitCol, priceCol, amountCol };
}

module.exports = { resolveColumns, isNumeric, QTY_KW, PRICE_KW, UNIT_KW, AMOUNT_KW, NAME_KW, DESC_KW };
