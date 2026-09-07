const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { dumpWorkbook, extractFile, extractDateFromFilename } = require('./cost-pipeline.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

const SAMPLE_PATH = 'C:\\Users\\aquab\\xwechat_files\\wxid_wwblqsdogthi12_8609\\msg\\file\\2026-08\\P1.86-2240x2560-GOB.xlsx';

test('dumpWorkbook: 실제 샘플 파일의 셀 구조를 복원한다', () => {
  const buf = fs.readFileSync(SAMPLE_PATH);
  const sheets = dumpWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.strictEqual(sheets.length, 1);
  const rows = sheets[0].rows;
  assert.strictEqual(rows[6][1], 1);
  assert.strictEqual(rows[6][3], 'LED module');
  assert.ok(String(rows[6][4]).includes('GOB'));
  assert.strictEqual(rows[6][7], 112);
});

test('extractDateFromFilename: YYMMDD 접두사 인식', () => {
  assert.strictEqual(extractDateFromFilename('250625 제주 JEJU BASALT.xlsx'), '2025-06-25');
});
test('extractDateFromFilename: 접두사 없으면 null', () => {
  assert.strictEqual(extractDateFromFilename('P1.86-2240x2560-GOB.xlsx'), null);
});

test('extractFile: 실제 샘플 파일에서 라인아이템을 뽑는다', () => {
  const buf = fs.readFileSync(SAMPLE_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = extractFile(ab, 'P1.86-2240x2560-GOB.xlsx', '2026-09-03');
  assert.strictEqual(result.included, true);
  const led = result.lineItems.find((i) => i.category === 'led_module' && i.qty === 112);
  assert.ok(led);
  assert.strictEqual(led.price, 182);
  assert.strictEqual(led.attributes.pitch, 1.86);
  // 파일명에 날짜 접두사가 없으므로 업로드일을 그대로 쓴다
  assert.strictEqual(led.date, '2026-09-03');
});

test('extractFile: 단가가 전부 0인 파일은 제외된다', () => {
  // 견적성 시트가 없는 최소 워크북을 즉석에서 만든다
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['ITEM', 'DETAIL', 'EA', 'TOATL'],
    ['MODULE', '', 43, 0],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'S1');
  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const result = extractFile(ab, 'memo.xlsx', '2026-09-03');
  assert.strictEqual(result.included, false);
  assert.ok(result.excludeReason);
});
