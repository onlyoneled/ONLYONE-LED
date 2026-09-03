// Phase 1 산출물(온리원LED_원가데이터_추출.xlsx)의 카테고리 시트를 읽어
// cost_observations에 넣을 INSERT문을 생성한다. 이미 Phase 1에서 신뢰도
// 검증을 거친 대표단가이므로 전부 status='approved'로 시딩한다.
const XLSX = require('xlsx');
const fs = require('fs');

const SRC = process.argv[2] || 'C:\\Users\\aquab\\Downloads\\온리원LED_원가데이터_추출.xlsx';
const OUT = process.argv[3] || './seed-cost-observations.sql';

const CATEGORY_SHEETS = {
  led_module: 'LED모듈',
  receiving_card: '수신카드',
  smps: 'SMPS',
  processor: '프로세서',
  box: '박스(다이캐스팅_철함체)',
  cable_220v: '케이블_220V',
  cable_cat6: '케이블_CAT6',
  cable_16p: '케이블_16P플랫',
  wood_box: '우드박스',
  freight: '운송비',
};

// NOTE: 실제 소스 파일의 각 카테고리 시트에는 브리프가 가정한 컬럼 외에
// '평균'(평균단가) 컬럼이 추가로 존재한다(대표단가/최소/최대와 함께 계산된
// 통계값이며 SKU를 구분하는 실제 속성이 아님). COMMON_COLS에서 빠져 있으면
// attrs에 잘못 섞여 들어가 sku_key/attributes를 오염시키므로 여기에 포함시킨다.
const COMMON_COLS = new Set(['대표단가', '통화', '관측횟수', '최소', '최대', '평균', '최근견적일', '최신일자 동률 관측 수', '최근견적파일명']);

function escSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function makeSkuKey(category, attrs) {
  const keys = Object.keys(attrs).sort();
  return [category, ...keys.map((k) => `${k}=${attrs[k]}`)].join('|');
}

const wb = XLSX.readFile(SRC);
const lines = [];

for (const [category, sheetName] of Object.entries(CATEGORY_SHEETS)) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.warn(`시트 없음: ${sheetName}`); continue; }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  for (const row of rows) {
    const attrs = {};
    for (const [k, v] of Object.entries(row)) {
      if (!COMMON_COLS.has(k) && v !== null) attrs[k] = v;
    }
    const skuKey = makeSkuKey(category, attrs);
    const price = row['대표단가'];
    const currency = row['통화'] || 'CNY';
    const date = row['최근견적일'] || '1970-01-01';
    if (price === null || price === undefined) continue;
    lines.push(
      `INSERT INTO cost_observations (category, sku_key, attributes, price, currency, observed_date, source_file, status) VALUES (${escSql(category)}, ${escSql(skuKey)}, ${escSql(JSON.stringify(attrs))}, ${price}, ${escSql(currency)}, ${escSql(date)}, ${escSql('phase1-seed')}, 'approved');`
    );
  }
}

fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');
console.log(`${lines.length}건 → ${OUT} 작성 완료`);
