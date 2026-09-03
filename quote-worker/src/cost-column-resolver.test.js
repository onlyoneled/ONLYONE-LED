const assert = require('assert');
const { resolveColumns, isNumeric } = require('./cost-column-resolver.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// 실측: P1.86-2240x2560-GOB.xlsx의 실제 헤더/데이터 구조 (Phase 1에서 확인됨)
// row5 헤더: NO/PHOTO/NAME/DESCRIPTION/(blank)/(blank)/QTY/PRICE/UNIT/AMOUNT/REMARK
// row6 데이터: qty=112(col7), unit='PCS'(col8, 라벨은 PRICE), price=182(col9, 라벨은 UNIT), amount=20384(col10)
function makeSheet() {
  return {
    sheet: 'P1.86',
    rows: {
      5: { 1: 'NO ', 2: 'PHOTO', 3: 'NAME', 4: 'DESCRIPTION', 7: 'QTY', 8: ' PRICE', 9: 'UNIT', 10: 'AMOUNT', 11: 'REMARK ' },
      6: { 1: 1, 3: 'LED module', 4: 'P1.86 Indoor module:320*160mm-GOB', 7: 112, 8: 'PCS', 9: 182, 10: 20384, 11: 'Ruisheng' },
    },
  };
}

test('resolveColumns: 라벨-데이터 뒤바뀜을 보정한다', () => {
  const cols = resolveColumns(makeSheet());
  assert.ok(cols);
  assert.strictEqual(cols.headerRow, 5);
  assert.strictEqual(cols.qtyCol, 7);
  assert.strictEqual(cols.amountCol, 10);
  assert.strictEqual(cols.unitCol, 8);
  assert.strictEqual(cols.priceCol, 9);
});

test('resolveColumns: QTY/PRICE/AMOUNT 패턴이 전혀 없으면 null', () => {
  const cols = resolveColumns({ sheet: 'x', rows: { 1: { 1: 'foo', 2: 'bar' } } });
  assert.strictEqual(cols, null);
});

test('resolveColumns: 헤더에 "Quantity" 리터럴도 인식한다', () => {
  const sheet = {
    sheet: 'x',
    rows: {
      1: { 1: 'Device name', 3: 'Model specification', 6: 'Quantity', 7: 'Unit', 8: 'Unit price', 9: 'Subtotal(RMB)' },
      2: { 1: 'P2.5', 3: 'L320*H160mm', 6: 484, 7: 'PCS', 8: 110, 9: 53240 },
    },
  };
  const cols = resolveColumns(sheet);
  assert.ok(cols);
  assert.strictEqual(cols.qtyCol, 6);
});

test('resolveColumns: PRICE 라벨이 없어도 QTY*x=AMOUNT인 컬럼을 price로 역산한다', () => {
  const sheet = {
    sheet: 'x',
    rows: {
      1: { 1: 'ITEM', 2: 'QTY', 3: 'COST', 4: 'AMOUNT' },
      2: { 1: 'a', 2: 10, 3: 5, 4: 50 },
      2.1: undefined,
      3: { 1: 'b', 2: 4, 3: 25, 4: 100 },
    },
  };
  delete sheet.rows[2.1];
  const cols = resolveColumns(sheet);
  assert.ok(cols);
  assert.strictEqual(cols.priceCol, 3);
});

test('isNumeric: 불리언은 숫자로 취급하지 않는다', () => {
  assert.strictEqual(isNumeric(true), false);
  assert.strictEqual(isNumeric(5), true);
  assert.strictEqual(isNumeric('5'), false);
});
