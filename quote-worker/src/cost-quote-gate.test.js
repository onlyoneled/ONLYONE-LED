const assert = require('assert');
const { isQuoteSheet } = require('./cost-quote-gate.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

test('isQuoteSheet: 정상 견적 시트는 true', () => {
  const sheet = {
    sheet: 'x',
    rows: {
      5: { 1: 'NO ', 3: 'NAME', 4: 'DESCRIPTION', 7: 'QTY', 8: ' PRICE', 9: 'UNIT', 10: 'AMOUNT' },
      6: { 1: 1, 3: 'LED module', 4: 'desc', 7: 112, 8: 'PCS', 9: 182, 10: 20384 },
    },
  };
  const { ok } = isQuoteSheet(sheet);
  assert.strictEqual(ok, true);
});

test('isQuoteSheet: 단가가 전부 0/공백이면 false', () => {
  const sheet = {
    sheet: 'x',
    rows: {
      1: { 1: 'Order date', 3: 'TOPIC' },
      3: { 1: 'ITEM', 2: 'DETAIL', 3: 'EA', 4: 'TOATL', 5: 'unit price', 6: 'Subtotal(RMB)' },
      4: { 1: 'MODULE', 3: 43, 6: 0 },
    },
  };
  const { ok, reason } = isQuoteSheet(sheet);
  assert.strictEqual(ok, false);
  assert.ok(reason);
});

test('isQuoteSheet: 헤더 자체가 없으면 false, 이유 문구 포함', () => {
  const { ok, reason } = isQuoteSheet({ sheet: 'x', rows: { 1: { 1: 'foo' } } });
  assert.strictEqual(ok, false);
  assert.ok(reason.includes('헤더'));
});
