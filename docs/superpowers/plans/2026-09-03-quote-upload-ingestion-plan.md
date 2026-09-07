# 견적서 업로드 지속 반영 (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** xlsx 견적서를 웹에서 업로드하면 자동 분류·추출되어 D1에 쌓이고, 애매하거나 이상치인 건 검토대기로 남으며, 관리자가 승인한 것만 `led-quote-estimator.html`의 원가 계산에 실시간 반영된다.

**Architecture:** Phase 1의 Python 분류 파이프라인(헤더 해석/견적 판별/품목 분류/속성 추출/집계)을 JS로 포팅해 기존 Cloudflare Worker(`quote-worker/`)에 새 모듈로 추가한다. 업로드된 xlsx는 SheetJS로 파싱하고, 추출된 관측치는 D1의 새 테이블에 `status='pending'|'approved'`로 저장된다. 원본 xlsx는 R2(기존 PDF 버킷의 `xlsx/` 접두사)에 저장해 감사 추적을 남긴다. `led-quote-estimator.html`은 정적 `data/led-cost-data.js` 대신 새 `GET /api/cost-data` 엔드포인트를 호출하도록 바뀐다.

**Tech Stack:** Cloudflare Workers(JS) + D1(SQLite) + R2 + SheetJS(`xlsx` npm 패키지, esbuild로 번들). Node.js `assert` 기반 테스트(기존 `admin-tools/led-layout-engine.test.js`와 동일 컨벤션).

**Spec:** `docs/superpowers/specs/2026-09-03-quote-upload-ingestion-design.md`

## Global Constraints

- `led-layout-calc.html`, `led-cost-calculator.html`, `admin-tools/led-layout-engine.js`는 이 작업에서도 절대 수정하지 않는다.
- Python 로직(`led_cost_extract` 프로젝트에 있던 `column_resolver.py`, `classifier.py`, `quote_gate.py`, `aggregator.py`)의 키워드·정규식·임계값·판별 규칙을 그대로 JS로 옮긴다 — 재설계하지 않는다. 값이 다르면 반드시 이유를 남긴다.
- 인증은 기존 `ACCESS_PASSWORD` secret + `X-Auth-Token` 헤더 패턴을 그대로 재사용한다(quotes.html/quote-worker/src/index.js의 `checkAuth` 참고). 새 비밀번호 체계를 만들지 않는다.
- 이상치 판정: 새 관측치 가격이 같은 SKU의 기존 대표단가 대비 **2배 이상/이하**면 이상치 → `status='pending'`. 완전히 새로운 SKU(비교 기준 없음)도 무조건 `pending`.
- Worker 배포(`wrangler deploy`, `wrangler d1 execute`)는 `CLOUDFLARE_API_TOKEN` 환경변수가 필요하다. 이 세션에서 PowerShell로 실행 시 매번 다음 줄로 먼저 로드해야 한다(레지스트리에 `setx`로 저장돼 있지만 현재 프로세스에 자동 반영 안 됨):
  ```powershell
  $env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
  ```
- 기존 D1 데이터베이스(`onlyone-quotes`, database_id는 `quote-worker/wrangler.toml` 참고)와 기존 R2 버킷(`onlyone-quote-pdfs`)을 재사용한다 — 새 데이터베이스/버킷을 만들지 않는다.
- 작업은 `feature/led-quote-estimator` 브랜치에서 이어서 진행한다(이미 커밋 8개 있음, main에서 분기).
- **git push는 사용자 승인 후에만 한다.** Worker 배포(`wrangler deploy`)는 이번 작업의 최종 목표이므로 계획에 포함하되, 실행 직전 사용자에게 확인한다(실제 서비스 중인 인프라에 대한 변경이므로).

---

## File Structure

```
quote-worker/
  schema-cost.sql                 # Task 1: D1 신규 테이블
  package.json                    # Task 2에서 xlsx 의존성 추가
  src/
    cost-column-resolver.js       # Task 2
    cost-column-resolver.test.js
    cost-classifier.js            # Task 3
    cost-classifier.test.js
    cost-quote-gate.js            # Task 4
    cost-quote-gate.test.js
    cost-pipeline.js              # Task 5 (xlsx 덤프 + 파일 단위 추출 오케스트레이션)
    cost-pipeline.test.js
    cost-aggregator.js            # Task 6 (SKU 집계 + 이상치 판정)
    cost-aggregator.test.js
    index.js                      # Task 7에서 라우트 추가 (기존 파일 수정)
  migrate-seed.js                 # Task 8 (Phase 1 데이터 D1 시딩용 1회성 스크립트)
quote-upload.html                 # Task 9
cost-review.html                  # Task 10
led-quote-estimator.html          # Task 11에서 수정 (기존 파일)
```

---

### Task 1: D1 스키마 확장

**Files:**
- Create: `quote-worker/schema-cost.sql`

**Interfaces:**
- Produces: `cost_observations`, `uploaded_quotes` 테이블. 이후 모든 태스크가 이 스키마를 전제로 한다.

- [ ] **Step 1: 스키마 작성**

`quote-worker/schema-cost.sql`:
```sql
CREATE TABLE IF NOT EXISTS cost_observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT    NOT NULL,
  sku_key         TEXT    NOT NULL,
  attributes      TEXT    NOT NULL,
  price           REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'CNY',
  observed_date   TEXT    NOT NULL,
  source_file     TEXT,
  upload_id       INTEGER,
  status          TEXT    NOT NULL DEFAULT 'pending',
  status_reason   TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cost_obs_sku    ON cost_observations(category, sku_key);
CREATE INDEX IF NOT EXISTS idx_cost_obs_status ON cost_observations(status);

CREATE TABLE IF NOT EXISTS uploaded_quotes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  filename          TEXT    NOT NULL,
  r2_key            TEXT    NOT NULL UNIQUE,
  line_items_count  INTEGER NOT NULL DEFAULT 0,
  pending_count     INTEGER NOT NULL DEFAULT 0,
  uploaded_at       TEXT    DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: 로컬 D1(테스트용)에 반영해 문법 검증**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler d1 execute onlyone-quotes --local --file ./schema-cost.sql
```
Expected: 에러 없이 완료. (`--local`이므로 실제 운영 D1에는 영향 없음 — 로컬 sqlite 파일에만 생성됨)

- [ ] **Step 3: Commit**

```bash
git add quote-worker/schema-cost.sql
git commit -m "feat: add D1 schema for cost observation ingestion"
```

---

### Task 2: 컬럼 해석 포팅 (`cost-column-resolver.js`)

**Files:**
- Create: `quote-worker/src/cost-column-resolver.js`
- Test: `quote-worker/src/cost-column-resolver.test.js`
- Modify: `quote-worker/package.json` (xlsx 의존성 추가)

**Interfaces:**
- Produces: `resolveColumns(sheet) -> {headerRow, nameCol, descCol, qtyCol, unitCol, priceCol, amountCol} | null`. `sheet`는 `{sheet: string, rows: {[rowIdx: number]: {[colIdx: number]: any}}}` (1-based).
- Produces: `isNumeric(v) -> boolean` (export, 다른 모듈이 재사용).

Python 원본(`led_cost_extract/src/column_resolver.py`, 이 계획 작성 시점 기준 최종본)의 키워드·판별 로직을 그대로 옮긴다:
- `QTY_KW = ['qty', 'quantity', '수 량', '수량', '數量', '数量', 'ea']`
- `PRICE_KW = ['price', '단가', '单价']`
- `UNIT_KW = ['unit', '단위']`
- `AMOUNT_KW = ['amount', 'total', '소계', '总价', 'subtotal', 'toatl']`
- `NAME_KW = ['name', 'item', '设备名称', '품목', 'itern', 'device']`
- `DESC_KW = ['description', '规格', 'spec', 'detail', '型号']`
- 헤더 행 판별: 처음 15행 중 `has_qty && has_amount && (has_name || has_desc)`인 첫 행.
- PRICE/UNIT 라벨이 실제 데이터 위치와 뒤바뀌어 있는 경우가 실측 확인됨 → `qty*price ≈ amount` 검증으로 재보정.

- [ ] **Step 1: `package.json`에 `xlsx` 의존성 추가**

`quote-worker/package.json`의 `devDependencies` 옆에 `dependencies` 블록 추가:
```json
  "dependencies": {
    "xlsx": "^0.18.5"
  },
```

```bash
cd quote-worker
npm install
```

- [ ] **Step 2: 실패하는 테스트 작성**

`quote-worker/src/cost-column-resolver.test.js`:
```js
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
```

- [ ] **Step 3: RED 확인**

```bash
cd quote-worker
node src/cost-column-resolver.test.js
```
Expected: `Cannot find module './cost-column-resolver.js'`로 전부 실패.

- [ ] **Step 4: 구현**

`quote-worker/src/cost-column-resolver.js`:
```js
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
```

- [ ] **Step 5: GREEN 확인**

```bash
cd quote-worker
node src/cost-column-resolver.test.js
```
Expected: `5 tests passed`. 실패하면 Python 원본(`led_cost_extract/src/column_resolver.py`)과 나란히 비교해 로직 차이를 찾는다.

- [ ] **Step 6: Commit**

```bash
git add quote-worker/package.json quote-worker/package-lock.json quote-worker/src/cost-column-resolver.js quote-worker/src/cost-column-resolver.test.js
git commit -m "feat: port column resolver (header/swap detection) to JS for cost ingestion"
```

---

### Task 3: 품목 분류 + 속성 추출 포팅 (`cost-classifier.js`)

**Files:**
- Create: `quote-worker/src/cost-classifier.js`
- Test: `quote-worker/src/cost-classifier.test.js`

**Interfaces:**
- Produces: `classifyItem(name, desc) -> string | null` (10개 카테고리 중 하나 또는 null).
- Produces: `extractAttributes(category, name, desc) -> object`.

Python 원본(`led_cost_extract/src/classifier.py` 최종본, name-first-then-desc-fallback 방식 포함)을 그대로 옮긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`quote-worker/src/cost-classifier.test.js`:
```js
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
```

- [ ] **Step 2: RED 확인**

```bash
cd quote-worker
node src/cost-classifier.test.js
```
Expected: 전부 실패 (`Cannot find module`).

- [ ] **Step 3: 구현**

`quote-worker/src/cost-classifier.js`:
```js
const CATEGORY_KEYWORDS = [
  ['led_module', ['led module', '모듈', '模组', 'led显示单元', 'led unit', 'full color', '全彩', '全全彩']],
  ['receiving_card', ['receiving card', '수신카드', '接收卡']],
  ['processor', ['play box', 'playbox', 'processor', '프로세서', '컨트롤러', '播放器', '播控', '控制器', 'video board', 'multimedia player', 'sending card']],
  ['smps', ['smps', 'power supply', '전원', '电源']],
  ['cable_16p', ['16p']],
  ['cable_cat6', ['cat6', '网络线', '网线', 'network cable']],
  ['cable_220v', ['cable', '케이블', '电缆']],
  ['wood_box', ['wooden crate', 'wood box', '우드박스', '木箱', 'packaging', '包装']],
  ['freight', ['freight', 'transportation', '운송', '运费', '운송비']],
  ['box', ['die-casting', '다이캐스팅', '箱体', '철함체', '함체', 'aluminum box']],
];

function matchCategory(text) {
  if (!text) return null;
  const low = String(text).toLowerCase().replace(/\s+/g, ' ');
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => low.includes(kw))) return category;
  }
  return null;
}

function classifyItem(name, desc) {
  return matchCategory(name) || matchCategory(desc);
}

const BRAND_MAP = {
  nova: 'Novastar', '诺瓦': 'Novastar', '노바': 'Novastar', novastar: 'Novastar',
  huidu: 'Huidu', '후이두': 'Huidu',
  colorlight: 'Colorlight',
  linsn: 'Linsn',
};

function detectBrand(text) {
  const low = text.toLowerCase();
  for (const key of Object.keys(BRAND_MAP)) {
    if (low.includes(key)) return BRAND_MAP[key];
  }
  return null;
}

function detectModel(text, brand) {
  const tokens = text.match(/[A-Za-z]{1,6}-?[A-Za-z0-9-]*\d[A-Za-z0-9-]*/g) || [];
  const filtered = brand ? tokens.filter((t) => t.toLowerCase() !== brand.toLowerCase()) : tokens;
  return (filtered[0] || tokens[0] || text.trim());
}

function extractAttributes(category, name, desc) {
  const text = `${name || ''} ${desc || ''}`;

  if (category === 'led_module') {
    const pitchM = /[Pp](\d+\.?\d*)/.exec(text);
    const sizeM = /(\d{2,4}\s*\*\s*\d{2,4}\s*mm)/.exec(text);
    const low = text.toLowerCase();
    let indoorOutdoor = 'indoor';
    if (low.includes('outdoor') || text.includes('户外') || text.includes('실외')) indoorOutdoor = 'outdoor';
    else if (low.includes('indoor') || text.includes('室内') || text.includes('실내')) indoorOutdoor = 'indoor';
    let type = 'SMD';
    if (low.includes('gob')) type = 'GOB';
    else if (low.includes('cob')) type = 'COB';
    return {
      pitch: pitchM ? parseFloat(pitchM[1]) : null,
      indoor_outdoor: indoorOutdoor,
      module_size: sizeM ? sizeM[1].replace(/\s+/g, '') : null,
      type,
    };
  }

  if (category === 'receiving_card' || category === 'processor') {
    const brand = detectBrand(text);
    const model = detectModel(desc || name, brand);
    return { brand: brand || 'Unknown', model };
  }

  if (category === 'smps') {
    const voltageM = /(AC\s?\d{2,3}-\d{2,3}V)/.exec(text.replace(/\s+/g, ' '));
    const capacityM = /(\d+V\d+A)/.exec(text);
    return {
      voltage: voltageM ? voltageM[1].replace(/\s+/g, '') : null,
      capacity: capacityM ? capacityM[1] : null,
    };
  }

  if (category === 'box') {
    const sizeM = /(\d{2,4}\s*\*\s*\d{2,4}\s*mm)/.exec(text);
    const material = (text.includes('철') || text.toLowerCase().includes('steel') || text.includes('铁')) ? 'steel' : 'aluminum';
    return {
      size: sizeM ? sizeM[1].replace(/\s+/g, '') : null,
      material,
    };
  }

  if (category === 'cable_220v' || category === 'cable_cat6' || category === 'cable_16p') {
    const lengths = text.match(/(\d{3,5})\s*mm/g) || [];
    const last = lengths[lengths.length - 1];
    return { length_mm: last ? parseInt(last, 10) : null };
  }

  return {};
}

module.exports = { classifyItem, extractAttributes, CATEGORY_KEYWORDS };
```

- [ ] **Step 4: GREEN 확인**

```bash
cd quote-worker
node src/cost-classifier.test.js
```
Expected: `15 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add quote-worker/src/cost-classifier.js quote-worker/src/cost-classifier.test.js
git commit -m "feat: port item classifier + attribute extraction to JS for cost ingestion"
```

---

### Task 4: 견적성 시트 판별 포팅 (`cost-quote-gate.js`)

**Files:**
- Create: `quote-worker/src/cost-quote-gate.js`
- Test: `quote-worker/src/cost-quote-gate.test.js`

**Interfaces:**
- Consumes: Task 2의 `resolveColumns`, `isNumeric`.
- Produces: `isQuoteSheet(sheet) -> {ok: boolean, reason: string}`.

- [ ] **Step 1: 실패하는 테스트 작성**

`quote-worker/src/cost-quote-gate.test.js`:
```js
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
```

- [ ] **Step 2: RED 확인**

```bash
cd quote-worker
node src/cost-quote-gate.test.js
```

- [ ] **Step 3: 구현**

`quote-worker/src/cost-quote-gate.js`:
```js
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
```

- [ ] **Step 4: GREEN 확인**

```bash
cd quote-worker
node src/cost-quote-gate.test.js
```
Expected: `3 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add quote-worker/src/cost-quote-gate.js quote-worker/src/cost-quote-gate.test.js
git commit -m "feat: port quote-sheet gate to JS for cost ingestion"
```

---

### Task 5: xlsx 파싱 + 파일 단위 추출 오케스트레이션 (`cost-pipeline.js`)

**Files:**
- Create: `quote-worker/src/cost-pipeline.js`
- Test: `quote-worker/src/cost-pipeline.test.js`

**Interfaces:**
- Consumes: Task 2-4의 `resolveColumns`, `isNumeric`, `isQuoteSheet`, `classifyItem`, `extractAttributes`.
- Produces: `dumpWorkbook(arrayBuffer) -> [{sheet: string, rows: {[r:number]: {[c:number]: any}}}]` — SheetJS로 xlsx를 읽어 1-based 셀 좌표 구조로 변환.
- Produces: `extractFile(arrayBuffer, filename, uploadDate) -> {included: boolean, excludeReason: string|null, lineItems: Array<{category, name, desc, qty, unit, price, amount, currency, attributes, sheet, date}>, unclassifiedRows: Array<...>}`. `uploadDate`는 `'YYYY-MM-DD'` 문자열(업로드 시각 기준 — Phase 1의 폴더 fallback과 달리 업로드 시엔 "오늘 날짜"가 유일하게 합리적인 기본값이므로, 파일명에 YYMMDD 접두사가 있으면 그것을 쓰고 없으면 `uploadDate`를 쓴다).

- [ ] **Step 1: `dumpWorkbook`용 실패하는 테스트 작성**

`quote-worker/src/cost-pipeline.test.js`:
```js
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
```

- [ ] **Step 2: RED 확인**

```bash
cd quote-worker
node src/cost-pipeline.test.js
```

- [ ] **Step 3: 구현**

`quote-worker/src/cost-pipeline.js`:
```js
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
```

- [ ] **Step 4: GREEN 확인**

```bash
cd quote-worker
node src/cost-pipeline.test.js
```
Expected: `5 tests passed`. 실패 시 SheetJS의 셀 좌표계(0-based)와 Python `openpyxl`(1-based)의 차이를 다시 확인 — 이 구현은 `r+1`/`c+1`로 이미 1-based로 변환해서 저장한다.

- [ ] **Step 5: Commit**

```bash
git add quote-worker/src/cost-pipeline.js quote-worker/src/cost-pipeline.test.js
git commit -m "feat: port xlsx dump + file-level extraction pipeline to JS"
```

---

### Task 6: SKU 집계 + 이상치 판정 (`cost-aggregator.js`)

**Files:**
- Create: `quote-worker/src/cost-aggregator.js`
- Test: `quote-worker/src/cost-aggregator.test.js`

**Interfaces:**
- Produces: `makeSkuKey(category, attributes) -> string`.
- Produces: `aggregateByCategory(lineItems) -> {[category: string]: Array<{skuKey, attributes, representativePrice, currency, minPrice, maxPrice, avgPrice, observationCount, latestDate}>}` — Phase 1의 `aggregator.py`와 동일 규칙(대표단가=최신 관측일).
- Produces: `judgeConfidence(newPrice, existingRepresentativePrice) -> {status: 'approved'|'pending', reason: string|null}` — 기존 대표단가 대비 2배 이상/이하면 `pending`. `existingRepresentativePrice`가 `null`(완전 신규 SKU)이면 무조건 `pending`.

- [ ] **Step 1: 실패하는 테스트 작성**

`quote-worker/src/cost-aggregator.test.js`:
```js
const assert = require('assert');
const { makeSkuKey, aggregateByCategory, judgeConfidence } = require('./cost-aggregator.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

test('makeSkuKey: 같은 속성이면 같은 키', () => {
  const a = makeSkuKey('led_module', { pitch: 1.86, indoor_outdoor: 'indoor', type: 'GOB' });
  const b = makeSkuKey('led_module', { pitch: 1.86, indoor_outdoor: 'indoor', type: 'GOB' });
  const c = makeSkuKey('led_module', { pitch: 2.5, indoor_outdoor: 'indoor', type: 'GOB' });
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('aggregateByCategory: 대표단가는 최신 관측일 기준', () => {
  const items = [
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 150, currency: 'CNY', date: '2025-04-01' },
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 182, currency: 'CNY', date: '2026-08-01' },
    { category: 'led_module', attributes: { pitch: 1.86 }, price: 138, currency: 'CNY', date: '2025-07-01' },
  ];
  const grouped = aggregateByCategory(items);
  const rows = grouped.led_module;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].representativePrice, 182);
  assert.strictEqual(rows[0].minPrice, 138);
  assert.strictEqual(rows[0].maxPrice, 182);
  assert.strictEqual(rows[0].observationCount, 3);
});

test('judgeConfidence: 기존 대표단가 대비 2배 이내면 approved', () => {
  const r = judgeConfidence(150, 100);
  assert.strictEqual(r.status, 'approved');
});
test('judgeConfidence: 기존 대비 2배 이상이면 pending', () => {
  const r = judgeConfidence(250, 100);
  assert.strictEqual(r.status, 'pending');
  assert.ok(r.reason);
});
test('judgeConfidence: 기존 대비 절반 이하도 pending', () => {
  const r = judgeConfidence(40, 100);
  assert.strictEqual(r.status, 'pending');
});
test('judgeConfidence: 비교 기준(기존 대표단가) 자체가 없으면 무조건 pending', () => {
  const r = judgeConfidence(100, null);
  assert.strictEqual(r.status, 'pending');
  assert.ok(r.reason.includes('신규'));
});
```

- [ ] **Step 2: RED 확인**

```bash
cd quote-worker
node src/cost-aggregator.test.js
```

- [ ] **Step 3: 구현**

`quote-worker/src/cost-aggregator.js`:
```js
function makeSkuKey(category, attributes) {
  const keys = Object.keys(attributes).sort();
  const parts = [category, ...keys.map((k) => `${k}=${attributes[k]}`)];
  return parts.join('|');
}

function aggregateByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const key = makeSkuKey(item.category, item.attributes);
    groups[key] = groups[key] || [];
    groups[key].push(item);
  }

  const byCategory = {};
  for (const key of Object.keys(groups)) {
    const items = groups[key];
    const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const latest = sorted[sorted.length - 1];
    const prices = items.map((i) => i.price);
    const row = {
      skuKey: key,
      attributes: latest.attributes,
      representativePrice: latest.price,
      currency: latest.currency,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: prices.reduce((s, p) => s + p, 0) / prices.length,
      observationCount: items.length,
      latestDate: latest.date,
    };
    byCategory[items[0].category] = byCategory[items[0].category] || [];
    byCategory[items[0].category].push(row);
  }
  return byCategory;
}

const OUTLIER_RATIO = 2;

function judgeConfidence(newPrice, existingRepresentativePrice) {
  if (existingRepresentativePrice === null || existingRepresentativePrice === undefined) {
    return { status: 'pending', reason: '신규 SKU — 비교 기준 없음, 검토 필요' };
  }
  const ratio = newPrice / existingRepresentativePrice;
  if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) {
    return {
      status: 'pending',
      reason: `기존 대표단가(¥${existingRepresentativePrice}) 대비 ${ratio.toFixed(1)}배 — 이상치 의심`,
    };
  }
  return { status: 'approved', reason: null };
}

module.exports = { makeSkuKey, aggregateByCategory, judgeConfidence, OUTLIER_RATIO };
```

- [ ] **Step 4: GREEN 확인**

```bash
cd quote-worker
node src/cost-aggregator.test.js
```
Expected: `7 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add quote-worker/src/cost-aggregator.js quote-worker/src/cost-aggregator.test.js
git commit -m "feat: port SKU aggregator + add outlier confidence judging"
```

---

### Task 7: Worker 라우트 추가 (`index.js` 수정)

**Files:**
- Modify: `quote-worker/src/index.js`

**Interfaces:**
- Consumes: Task 5의 `extractFile`, Task 6의 `makeSkuKey`, `aggregateByCategory`, `judgeConfidence`.
- Produces: 신규 라우트:
  - `POST /api/cost-upload` (multipart: `file`) — xlsx 업로드 → 파싱 → D1 저장 → R2 저장.
  - `GET /api/cost-review` — `status='pending'`인 관측치 목록.
  - `PATCH /api/cost-review/:id` (body `{action: 'approve'|'reject'}`).
  - `GET /api/cost-data` — `status='approved'`인 관측치만 집계해 카테고리별 배열로 응답 (인증 불필요 — `led-quote-estimator.html`이 비밀번호 없이 읽어야 하므로 `checkAuth` 예외 처리).

- [ ] **Step 1: 현재 `index.js` 읽기**

`quote-worker/src/index.js`를 먼저 전체 읽어 기존 라우팅 구조(`fetch` 핸들러의 if-체인), `checkAuth`, `json()` 헬퍼, CORS 헤더 상수를 파악한다. 새 라우트는 이 파일의 기존 패턴을 그대로 따른다.

- [ ] **Step 2: import 추가**

파일 최상단에 추가:
```js
import { extractFile } from './cost-pipeline.js';
import { makeSkuKey, aggregateByCategory, judgeConfidence } from './cost-aggregator.js';
```

- [ ] **Step 3: 라우팅 분기 추가**

`export default { async fetch(request, env) { ... } }` 안의 기존 if-체인에 추가(단, `/api/cost-data`는 인증 없이 허용해야 하므로 `checkAuth` 호출보다 먼저 분기):
```js
    if (path === '/api/cost-data' && request.method === 'GET') return handleCostData(env);
```
그 아래, 기존 `if (!checkAuth(request, url, env)) return json({ error: 'Unauthorized' }, 401);` 이후에:
```js
    if (path === '/api/cost-upload' && request.method === 'POST')  return handleCostUpload(request, env);
    if (path === '/api/cost-review' && request.method === 'GET')   return handleCostReviewList(env);
    if (path.startsWith('/api/cost-review/') && request.method === 'PATCH') return handleCostReviewPatch(path.split('/')[3], request, env);
```

- [ ] **Step 4: 핸들러 함수 구현**

파일 하단(기존 핸들러 함수들 옆)에 추가:
```js
// ── xlsx 업로드 → 파싱 → D1/R2 저장 ─────────────────────
async function handleCostUpload(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'multipart 파싱 실패' }, 400); }

  const file = form.get('file');
  if (!file) return json({ error: 'file 필요' }, 400);

  const filename = file.name;
  const arrayBuffer = await file.arrayBuffer();
  const uploadDate = new Date().toISOString().slice(0, 10);

  let extracted;
  try {
    extracted = extractFile(arrayBuffer, filename, uploadDate);
  } catch (e) {
    return json({ error: `파싱 실패: ${e.message}` }, 400);
  }

  if (!extracted.included) {
    return json({ ok: false, reason: extracted.excludeReason });
  }

  const r2Key = `xlsx/${Date.now()}_${filename}`;
  await env.PDF_BUCKET.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });

  const uploadRow = await env.DB.prepare(
    `INSERT INTO uploaded_quotes (filename, r2_key, line_items_count) VALUES (?, ?, ?) RETURNING id`
  ).bind(filename, r2Key, extracted.lineItems.length).first();
  const uploadId = uploadRow.id;

  let pendingCount = 0;
  for (const item of extracted.lineItems) {
    const skuKey = makeSkuKey(item.category, item.attributes);
    const existing = await env.DB.prepare(
      `SELECT price FROM cost_observations WHERE category = ? AND sku_key = ? AND status = 'approved' ORDER BY observed_date DESC LIMIT 1`
    ).bind(item.category, skuKey).first();
    const existingPrice = existing ? existing.price : null;

    let judged;
    if (!item.category) {
      judged = { status: 'pending', reason: '자동 분류 실패' };
    } else {
      judged = judgeConfidence(item.price, existingPrice);
    }
    if (judged.status === 'pending') pendingCount++;

    await env.DB.prepare(
      `INSERT INTO cost_observations
         (category, sku_key, attributes, price, currency, observed_date, source_file, upload_id, status, status_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.category || 'unclassified', skuKey, JSON.stringify(item.attributes),
      item.price, item.currency, item.date, filename, uploadId,
      judged.status, judged.reason,
    ).run();
  }

  await env.DB.prepare(`UPDATE uploaded_quotes SET pending_count = ? WHERE id = ?`)
    .bind(pendingCount, uploadId).run();

  return json({
    ok: true, uploadId, filename,
    lineItemsCount: extracted.lineItems.length,
    pendingCount,
    unclassifiedCount: extracted.unclassifiedRows.length,
  });
}

// ── 검토대기 목록 ────────────────────────────────────────
async function handleCostReviewList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, category, sku_key, attributes, price, currency, observed_date, source_file, status_reason
     FROM cost_observations WHERE status = 'pending' ORDER BY created_at DESC`
  ).all();
  return json(results.map((r) => ({ ...r, attributes: JSON.parse(r.attributes) })));
}

// ── 승인/반려 ────────────────────────────────────────────
async function handleCostReviewPatch(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!['approve', 'reject'].includes(body.action)) return json({ error: 'action은 approve|reject' }, 400);

  const status = body.action === 'approve' ? 'approved' : 'rejected';
  await env.DB.prepare(`UPDATE cost_observations SET status = ? WHERE id = ?`).bind(status, id).run();
  return json({ ok: true, id: Number(id), status });
}

// ── 승인된 관측치 집계 → 계산기용 API (인증 불필요) ──────
async function handleCostData(env) {
  const { results } = await env.DB.prepare(
    `SELECT category, attributes, price, currency, observed_date AS date
     FROM cost_observations WHERE status = 'approved'`
  ).all();
  const lineItems = results.map((r) => ({ ...r, attributes: JSON.parse(r.attributes) }));
  const grouped = aggregateByCategory(lineItems);
  return json(grouped);
}
```

- [ ] **Step 5: 로컬 D1로 통합 동작 확인**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler dev --local
```
다른 터미널에서(또는 같은 wrangler dev 세션이 뜬 상태에서 curl로):
```bash
curl -s -X POST http://localhost:8787/api/cost-upload -F "file=@C:/Users/aquab/xwechat_files/wxid_wwblqsdogthi12_8609/msg/file/2026-08/P1.86-2240x2560-GOB.xlsx"
```
Expected: `{"ok":true,"uploadId":1,...}` 형태의 JSON. `GET /api/cost-review`, `GET /api/cost-data`도 curl로 확인.

`wrangler dev` 프로세스는 확인 후 종료한다.

- [ ] **Step 6: Commit**

```bash
git add quote-worker/src/index.js
git commit -m "feat: add cost-upload/cost-review/cost-data routes to quote worker"
```

---

### Task 8: Phase 1 데이터 D1 시딩 스크립트

**Files:**
- Create: `quote-worker/migrate-seed.js`

**Interfaces:**
- Consumes: Phase 1 산출물 `C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx`의 카테고리별 대표단가.
- Produces: `cost_observations`에 `status='approved'`로 시드 데이터를 넣는 SQL(`INSERT`)을 생성해 `wrangler d1 execute`로 실행 가능한 파일로 출력.

이 태스크는 Python이 아니라 Node로 작성한다(Worker 프로젝트 전체를 JS로 통일 — xlsx 읽기는 이미 Task 5에서 만든 `xlsx` 패키지를 재사용).

- [ ] **Step 1: 스크립트 작성**

`quote-worker/migrate-seed.js`:
```js
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

const COMMON_COLS = new Set(['대표단가', '통화', '관측횟수', '최소', '최대', '최근견적일', '최신일자 동률 관측 수', '최근견적파일명']);

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
```

- [ ] **Step 2: 실행해 SQL 파일 생성 확인**

```bash
cd quote-worker
node migrate-seed.js
```
Expected: `NN건 → ./seed-cost-observations.sql 작성 완료` (NN은 0보다 커야 함). 생성된 파일을 열어 `INSERT INTO cost_observations` 문이 유효한 SQL 형태인지 육안 확인.

- [ ] **Step 3: 로컬 D1에 시드 반영해 검증 (실제 운영 D1 아님)**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler d1 execute onlyone-quotes --local --file ./seed-cost-observations.sql
npx wrangler d1 execute onlyone-quotes --local --command "SELECT COUNT(*) AS n FROM cost_observations"
```
Expected: 카운트가 시드 건수와 일치.

- [ ] **Step 4: Commit**

`seed-cost-observations.sql`은 생성물이므로 커밋에 포함해도 되고(재현 가능한 시드로 남겨둠), `.gitignore` 처리해도 된다 — 커밋하는 쪽으로 한다(실제 배포 시 그대로 재사용하기 위해).
```bash
git add quote-worker/migrate-seed.js quote-worker/seed-cost-observations.sql
git commit -m "feat: add Phase 1 data seed script for D1 cost_observations"
```

---

### Task 9: 업로드 페이지 (`quote-upload.html`)

**Files:**
- Create: `quote-upload.html`

**Interfaces:**
- Consumes: Task 7의 `POST /api/cost-upload`.

`quotes.html`의 인증(비밀번호 입력 → localStorage 저장 → `X-Auth-Token` 헤더) 및 업로드 UI(드래그앤드롭, 진행 상태 표시) 패턴을 그대로 재사용한다 — `quotes.html`을 먼저 읽고 그 구조를 그대로 가져와 xlsx 업로드용으로 단순화한다(다중 파일 대신 1개, PDF 파싱 대신 서버 업로드만).

- [ ] **Step 1: `quotes.html`의 인증/업로드 섹션 구조 파악**

`quotes.html`을 읽어 다음을 확인: `API_BASE` 상수, `PW_KEY` localStorage 키, `checkAuth`/로그인 폼 마크업, 드래그앤드롭 영역 마크업과 CSS 클래스.

- [ ] **Step 2: `quote-upload.html` 작성**

`led-cost-calculator.html`의 CSS `:root` 변수 블록(색상 등)을 재사용하고, `quotes.html`의 인증 패턴을 그대로 옮겨 다음 흐름을 구현한다:
1. 비밀번호 입력 폼 (localStorage에 `X-Auth-Token`으로 쓸 값 저장, `quotes.html`과 같은 키 `PW_KEY` 재사용 — 같은 사이트 내 두 관리자 페이지가 같은 로그인 상태를 공유하도록).
2. 로그인 후: 파일 선택(`<input type="file" accept=".xlsx">`) + 드래그앤드롭 영역.
3. 업로드 버튼 클릭 → `POST ${API_BASE}/api/cost-upload` (multipart, 필드명 `file`) → 응답의 `lineItemsCount`/`pendingCount`/`unclassifiedCount`를 결과 카드로 표시.
4. 업로드 성공 시 "검토대기 N건 — 검토 페이지로 이동" 링크를 `cost-review.html`로 연결.

`API_BASE`는 `quotes.html`과 동일한 값(`https://onlyone-quote-worker.only1-d71.workers.dev`)을 쓴다.

- [ ] **Step 3: Commit**

```bash
git add quote-upload.html
git commit -m "feat: add xlsx quote upload admin page"
```

---

### Task 10: 검토 페이지 (`cost-review.html`)

**Files:**
- Create: `cost-review.html`

**Interfaces:**
- Consumes: Task 7의 `GET /api/cost-review`, `PATCH /api/cost-review/:id`.

- [ ] **Step 1: 작성**

`quote-upload.html`(Task 9)과 같은 인증 패턴을 재사용한다. 로그인 후:
1. `GET ${API_BASE}/api/cost-review`로 대기 목록을 받아 테이블로 표시: 카테고리, 속성(JSON을 보기 좋게 펼침), 가격, 통화, 관측일, 출처파일, 사유(`status_reason`).
2. 각 행에 "승인"/"반려" 버튼 → `PATCH ${API_BASE}/api/cost-review/${id}` (`{action:'approve'}` 또는 `{action:'reject'}`) → 성공 시 해당 행을 목록에서 제거.
3. 대기 목록이 비어있으면 "검토할 항목이 없습니다" 표시.

- [ ] **Step 2: Commit**

```bash
git add cost-review.html
git commit -m "feat: add cost observation review admin page"
```

---

### Task 11: `led-quote-estimator.html`을 라이브 API로 전환

**Files:**
- Modify: `led-quote-estimator.html`

**Interfaces:**
- Consumes: Task 7의 `GET /api/cost-data`.

- [ ] **Step 1: 데이터 로딩 방식 변경**

기존:
```html
<script src="data/led-cost-data.js"></script>
<script src="admin-tools/led-quote-estimator-calc.js"></script>
```
을 다음으로 교체(계산 엔진 스크립트는 그대로 유지, 데이터만 API로 전환):
```html
<script src="admin-tools/led-quote-estimator-calc.js"></script>
```

`window.addEventListener('DOMContentLoaded', ...)` 블록 시작 부분을 async로 바꾸고, 맨 앞에서 API를 호출해 `LED_COST_DATA`를 채운다:
```js
const API_BASE = 'https://onlyone-quote-worker.only1-d71.workers.dev';
let LED_COST_DATA = { ledModulesSmd: [], ledModulesGobCob: [], receivingCards: [], smps: [], processors: [], boxes: [], cable220v: [], cableCat6: [], cable16p: [], woodBox: [], freight: [] };

async function loadCostData() {
  try {
    const res = await fetch(`${API_BASE}/api/cost-data`);
    const data = await res.json();
    // API는 { category: [row, ...] } 형태로 온다. 계산기 엔진이 기대하는
    // ledModulesSmd/receivingCards 같은 camelCase 키로 매핑한다.
    const map = {
      led_module: null, // led_module은 SMD/GOB-COB로 나눠야 하므로 별도 처리
      receiving_card: 'receivingCards', smps: 'smps', processor: 'processors',
      box: 'boxes', cable_220v: 'cable220v', cable_cat6: 'cableCat6', cable_16p: 'cable16p',
      wood_box: 'woodBox', freight: 'freight',
    };
    for (const [apiKey, dataKey] of Object.entries(map)) {
      if (dataKey && data[apiKey]) {
        LED_COST_DATA[dataKey] = data[apiKey].map((r) => ({
          ...r.attributes, 대표단가: r.representativePrice, 통화: r.currency,
          관측횟수: r.observationCount, 최소: r.minPrice, 최대: r.maxPrice,
        }));
      }
    }
    const ledRows = (data.led_module || []).map((r) => ({
      ...r.attributes, 대표단가: r.representativePrice, 통화: r.currency,
      관측횟수: r.observationCount, 최소: r.minPrice, 최대: r.maxPrice,
    }));
    LED_COST_DATA.ledModulesSmd = ledRows.filter((r) => r.type === 'SMD');
    LED_COST_DATA.ledModulesGobCob = ledRows.filter((r) => r.type === 'GOB' || r.type === 'COB');
  } catch (e) {
    document.getElementById('warnings-box').innerHTML =
      '<div class="notice">⚠ 원가 데이터를 불러오지 못했습니다 (' + e.message + ')</div>';
  }
}
```
기존 `window.addEventListener('DOMContentLoaded', () => { ... })`의 콜백을 `async () => { await loadCostData(); ... 기존 초기화 코드 ... }`로 바꾼다.

- [ ] **Step 2: `data/led-cost-data.js`, `tools/convert_cost_data.py` 처리**

스펙에 따라 삭제하지 않는다(Task 8의 시딩에 참고용으로 남겨둠). 다만 더 이상 `led-quote-estimator.html`이 로드하지 않으므로, 저장소에 이 사실을 알 수 있게 `data/led-cost-data.js` 맨 위에 한 줄 주석을 추가한다:
```js
// NOTE: led-quote-estimator.html은 더 이상 이 파일을 쓰지 않는다
// (Phase 3부터 GET /api/cost-data 라이브 API로 전환됨). 이 파일은
// quote-worker/migrate-seed.js가 참고하는 Phase 1 원본 데이터로만 남아있다.
```

- [ ] **Step 3: 로컬에서 확인**

```bash
"$PY" -m http.server 8913
```
브라우저로 `led-quote-estimator.html`을 열어 콘솔에 CORS 에러가 없는지 확인한다(로컬 파일→운영 Worker로의 요청이므로 `quote-worker/src/index.js`의 CORS 헤더가 `Access-Control-Allow-Origin: '*'`인지 재확인 — 이미 그렇다면 통과). 화면 사이즈 입력 시 실제 운영 D1에 있는(아직 Task 12에서 실제 배포 전이라 비어있을 수 있음) 데이터로 정상 동작하는지, 데이터가 비어있으면 "이 그룹에 등록된 모듈 데이터가 없습니다" 같은 안내가 뜨는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add led-quote-estimator.html data/led-cost-data.js
git commit -m "feat: switch led-quote-estimator.html to live cost-data API"
```

---

### Task 12: 배포 (사용자 확인 후 진행)

**이 태스크는 실행 직전 반드시 사용자에게 배포 진행을 확인한다** — 실제 서비스 중인 Cloudflare 인프라와 라이브 사이트에 대한 변경이기 때문이다.

- [ ] **Step 1: D1 스키마를 운영 DB에 반영**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler d1 execute onlyone-quotes --remote --file ./schema-cost.sql
```

- [ ] **Step 2: Phase 1 데이터를 운영 DB에 시딩**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler d1 execute onlyone-quotes --remote --file ./seed-cost-observations.sql
```

- [ ] **Step 3: Worker 배포**

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
cd quote-worker
npx wrangler deploy
```
Expected: 배포 URL이 기존 `https://onlyone-quote-worker.only1-d71.workers.dev`와 동일한지 확인(같은 Worker 이름이면 같은 URL로 갱신 배포됨).

- [ ] **Step 4: 운영 API 동작 확인**

```bash
curl -s https://onlyone-quote-worker.only1-d71.workers.dev/api/cost-data | head -c 500
```
Expected: JSON 응답, Task 8에서 시딩한 카테고리 데이터가 보임.

- [ ] **Step 5: git push (별도 확인 후)**

정적 페이지(`led-quote-estimator.html`, `quote-upload.html`, `cost-review.html`, `data/led-cost-data.js`)는 GitHub push 시 Cloudflare Pages가 자동 배포한다. 이 단계도 **push 직전 사용자에게 다시 확인**한다.
```bash
git push -u origin feature/led-quote-estimator
```
(사용자가 `main`에 바로 합치길 원하면 이때 안내받아 진행)

---

### Task 13: 종단 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 라이브 사이트에서 실제 업로드 테스트**

배포된 `quote-upload.html`을 열어 실제 견적서 파일 1개(예: 아직 Phase 1 데이터에 없는 최근 파일)를 업로드 → 응답 확인.

- [ ] **Step 2: 검토 페이지 확인**

`cost-review.html`에서 방금 업로드로 생긴 `pending` 항목이 보이는지, 승인/반려가 실제로 D1을 갱신하는지 확인.

- [ ] **Step 3: 승인 후 계산기 반영 확인**

승인한 항목이 `led-quote-estimator.html`의 해당 카테고리에 반영되는지(페이지 새로고침 후) 확인.

- [ ] **Step 4: 기존 3개 파일 미수정 최종 확인**

```bash
git diff --stat main -- led-layout-calc.html led-cost-calculator.html admin-tools/led-layout-engine.js
```
Expected: 빈 출력.

---

## Self-Review 결과

1. **스펙 커버리지**: xlsx 파싱(Task 5)·헤더해석(Task 2)·품목분류(Task 3)·견적판별(Task 4)·집계+이상치판정(Task 6)·업로드/검토/조회 API(Task 7)·Phase 1 시딩(Task 8)·업로드 UI(Task 9)·검토 UI(Task 10)·계산기 API 전환(Task 11)·배포(Task 12)·종단검증(Task 13) 모두 스펙과 1:1 대응. 인증 재사용, 이상치 2배 기준, 신규 SKU 무조건 대기 규칙 모두 Task 6/7에 반영됨.
2. **플레이스홀더 스캔**: "TODO" 없음. Task 9/10은 `quotes.html` 패턴을 "그대로 옮겨쓰라"는 지시라 구조 설명이지만, 참조할 기존 파일이 실제로 존재하고 명확히 지정되어 있어 placeholder가 아님.
3. **타입/이름 일관성**: `resolveColumns`/`isQuoteSheet`/`classifyItem`/`extractAttributes`/`extractFile`/`makeSkuKey`/`aggregateByCategory`/`judgeConfidence`의 시그니처가 Task 2→4→5→6→7에서 정의된 그대로 소비됨. `cost_observations` 테이블 컬럼명(Task 1)이 Task 7의 SQL과 정확히 일치. Task 11의 API 응답 매핑에서 쓰는 `representativePrice/currency/observationCount/minPrice/maxPrice`가 Task 6의 `aggregateByCategory` 반환 필드명과 일치. 불일치 없음.
