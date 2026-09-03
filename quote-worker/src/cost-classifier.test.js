const assert = require('assert');
const { classifyItem, extractAttributes } = require('./cost-classifier.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

test('classifyItem: LED 모듈 (영문)', () => {
  assert.strictEqual(classifyItem('LED module', 'P1.86 Indoor module:320*160mm-GOB'), 'led_module');
});
test('classifyItem: LED 모듈 (중문)', () => {
  assert.strictEqual(classifyItem('室内LED显示单元', 'TC-DM1.86 P1.86'), 'led_module');
});
test('classifyItem: 수신카드', () => {
  assert.strictEqual(classifyItem('Receiving card ', 'Nova MRV412-N'), 'receiving_card');
});
test('classifyItem: SMPS', () => {
  assert.strictEqual(classifyItem('SMPS Power supply ', ' AC220-240V/5V40A'), 'smps');
});
test('classifyItem: 박스', () => {
  assert.strictEqual(classifyItem('Die-casting aluminum box', '640*480mm'), 'box');
});
test('classifyItem: CAT6', () => {
  assert.strictEqual(classifyItem('Network cable CAT6', '6 categories 1000mm'), 'cable_cat6');
});
test('classifyItem: 16P — desc에 "receiving card"가 있어도 name이 우선', () => {
  assert.strictEqual(classifyItem('16P short flat cable', 'Receiving card cable'), 'cable_16p');
});
test('classifyItem: 우드박스', () => {
  assert.strictEqual(classifyItem('Export wooden crate', 'Export specific fumigation free wooden box packaging'), 'wood_box');
});
test('classifyItem: 운송비', () => {
  assert.strictEqual(classifyItem('Freight ', 'From Shenzhen to Guangzhou'), 'freight');
});
test('classifyItem: 播放器(프로세서) — 개행 포함', () => {
  assert.strictEqual(classifyItem('多媒体\n播放器', '诺瓦TB40'), 'processor');
});
test('classifyItem: 미분류는 null', () => {
  assert.strictEqual(classifyItem('Screwdriver set', 'random tool'), null);
});

test('extractAttributes: LED 모듈', () => {
  const attrs = extractAttributes('led_module', 'LED module', 'P1.86 Indoor module:320*160mm-GOB');
  assert.strictEqual(attrs.pitch, 1.86);
  assert.strictEqual(attrs.indoor_outdoor, 'indoor');
  assert.strictEqual(attrs.module_size, '320*160mm');
  assert.strictEqual(attrs.type, 'GOB');
});
test('extractAttributes: 박스', () => {
  const attrs = extractAttributes('box', 'Die-casting aluminum box', '640*480mm');
  assert.strictEqual(attrs.size, '640*480mm');
  assert.strictEqual(attrs.material, 'aluminum');
});
test('extractAttributes: 수신카드', () => {
  const attrs = extractAttributes('receiving_card', 'Receiving card', 'Nova MRV412-N');
  assert.strictEqual(attrs.brand, 'Novastar');
  assert.ok(attrs.model.includes('MRV412'));
});
test('extractAttributes: SMPS', () => {
  const attrs = extractAttributes('smps', 'SMPS Power supply', 'AC220-240V/5V40A');
  assert.strictEqual(attrs.voltage, 'AC220-240V');
  assert.strictEqual(attrs.capacity, '5V40A');
});
