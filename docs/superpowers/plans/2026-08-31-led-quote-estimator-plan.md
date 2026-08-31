# LED 견적 예상 계산기 (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 사이즈(가로×세로)와 LED 모듈 종류를 입력하면 실제 견적서에서 뽑은 단가를 근거로 항목별 예상 원가가 나오는 새 페이지 `led-quote-estimator.html`을 만든다.

**Architecture:** (1) Python 변환 스크립트가 Phase 1 산출물 xlsx를 읽어 `data/led-cost-data.js`(정적 데이터)를 생성한다. (2) `admin-tools/led-quote-estimator-calc.js`가 화면 사이즈→BOM 수량(레이아웃 엔진 로직 내장, 원본 `admin-tools/led-layout-engine.js`는 참고만 하고 수정하지 않음)과 BOM 수량×단가=예상 원가를 계산하는 순수 함수들을 제공한다(Node로 유닛테스트 가능, `led-layout-engine.js`와 같은 패턴). (3) `led-quote-estimator.html`이 두 파일을 로드해 입력 폼→결과 화면을 렌더링한다.

**Tech Stack:** 순수 JS(프레임워크 없음, 기존 저장소 컨벤션과 동일) + Node.js(`assert` 기반 테스트, `admin-tools/led-layout-engine.test.js`와 동일한 패턴) + Python(변환 스크립트, `openpyxl`).

**Spec:** `docs/superpowers/specs/2026-08-31-led-quote-estimator-design.md`

## Global Constraints

- **기존 `led-layout-calc.html`, `led-cost-calculator.html`, `admin-tools/led-layout-engine.js`는 절대 수정하지 않는다** (사용자 명시 요구사항). 필요한 로직은 새 파일로 복사해서 쓴다.
- Python은 `C:\Users\aquab\AppData\Local\Python\bin\python.exe` 전체 경로로 실행한다 (PATH의 `python`은 이 환경에서 깨진 Windows Store 스텁). `export PYTHONIOENCODING=utf-8` 필수.
- Node.js 테스트는 프레임워크 없이 `admin-tools/led-layout-engine.test.js`와 동일한 `assert` 기반 커스텀 러너 패턴을 따른다. `node <file>.test.js`로 직접 실행한다 (`npm test` 스크립트 없음, package.json 없음 — 만들지 않는다).
- LED 모듈 SMD 목록은 관측횟수(observation_count) 2건 이상인 것만 포함한다(스펙 §"SMD vs GOB/COB 분리").
- 박스 재질은 이번 버전에서 다이캐스팅 알루미늄만 다룬다. 철함체(steel) 데이터는 변환 단계에서 걸러내고 UI에 노출하지 않는다 (스펙에 재질 선택 UI가 없어 계획 단계에서 내린 범위 축소 결정 — YAGNI).
- 원가 데이터 소스 xlsx 기본 경로: `C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx` (Phase 1 산출물).
- **git push는 하지 않는다.** 로컬 커밋까지만 하고, 이 저장소는 GitHub push 시 Cloudflare Pages가 자동 배포하는 라이브 사이트이므로 push는 사용자 승인 후 별도로 진행한다.

---

## File Structure

```
tools/
  convert_cost_data.py       # Task 1-2: xlsx → data/led-cost-data.js 생성 스크립트
data/
  led-cost-data.js           # Task 2 산출물: 정적 원가 데이터 (window.LED_COST_DATA)
admin-tools/
  led-quote-estimator-calc.js       # Task 3: BOM 수량·원가 계산 순수 함수 (레이아웃 엔진 로직 내장)
  led-quote-estimator-calc.test.js  # Task 3 테스트
led-quote-estimator.html     # Task 4-5: 신규 페이지
```

---

### Task 1: 변환 스크립트 — 시트 리더 + LED모듈 SMD/GOB·COB 분리

**Files:**
- Create: `tools/convert_cost_data.py`
- Test: 수동 실행 검증 (Python 스크립트는 이 저장소에 pytest 컨벤션이 없으므로, `__main__` 가드 아래 `if __name__ == '__main__' and '--selftest' in sys.argv:` 블록에 assert 기반 자체 테스트를 넣는다. Node 쪽 컨벤션과 대칭을 맞춘다.)

**Interfaces:**
- Produces: `read_category_sheet(wb, sheet_name: str) -> list[dict]` — 시트의 헤더 행을 읽어 각 데이터 행을 `{컬럼명: 값}` dict로 변환한 리스트를 반환.
- Produces: `split_led_modules(rows: list[dict]) -> tuple[list[dict], list[dict]]` — `(smd_rows, gob_cob_rows)`. `type` 컬럼이 `'SMD'`면 smd_rows로(단, `관측횟수` < 2면 제외), `'GOB'`/`'COB'`면 gob_cob_rows로.

- [ ] **Step 1: `read_category_sheet` 작성**

```python
import openpyxl


def read_category_sheet(wb, sheet_name: str) -> list[dict]:
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    header = [str(h) if h is not None else '' for h in rows[0]]
    result = []
    for row in rows[1:]:
        if all(v is None for v in row):
            continue
        result.append(dict(zip(header, row)))
    return result
```

- [ ] **Step 2: `split_led_modules` 작성**

```python
def split_led_modules(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    smd_rows, gob_cob_rows = [], []
    for row in rows:
        rtype = (row.get('type') or '').upper()
        count = row.get('관측횟수') or 0
        if rtype == 'SMD':
            if count >= 2:
                smd_rows.append(row)
        elif rtype in ('GOB', 'COB'):
            gob_cob_rows.append(row)
    return smd_rows, gob_cob_rows
```

- [ ] **Step 3: 자체 테스트 블록 작성**

`tools/convert_cost_data.py` 맨 아래에 추가:
```python
def _selftest():
    smd, gob_cob = split_led_modules([
        {'type': 'SMD', '관측횟수': 5, 'pitch': 1.86},
        {'type': 'SMD', '관측횟수': 1, 'pitch': 2.5},   # 관측 부족 -> 제외
        {'type': 'GOB', '관측횟수': 4, 'pitch': 1.86},
        {'type': 'COB', '관측횟수': 3, 'pitch': 1.53},
    ])
    assert len(smd) == 1 and smd[0]['pitch'] == 1.86, smd
    assert len(gob_cob) == 2, gob_cob
    print('convert_cost_data self-test: OK')


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        _selftest()
```

- [ ] **Step 4: 실행 확인**

```bash
PY="/c/Users/aquab/AppData/Local/Python/bin/python.exe"
export PYTHONIOENCODING=utf-8
"$PY" tools/convert_cost_data.py --selftest
```
Expected: `convert_cost_data self-test: OK`

- [ ] **Step 5: 실제 xlsx의 LED모듈 시트로 육안 검증**

```bash
PY="/c/Users/aquab/AppData/Local/Python/bin/python.exe"
export PYTHONIOENCODING=utf-8
"$PY" -c "
import sys; sys.path.insert(0, 'tools')
from convert_cost_data import read_category_sheet, split_led_modules
import openpyxl
wb = openpyxl.load_workbook(r'C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx')
rows = read_category_sheet(wb, 'LED모듈')
smd, gob_cob = split_led_modules(rows)
print('SMD rows:', len(smd))
print('GOB/COB rows:', len(gob_cob))
print(smd[0] if smd else 'none')
"
```
Expected: SMD/GOB·COB 행이 0보다 크게 나오고, 각 행에 `대표단가`, `관측횟수`, `pitch`, `indoor_outdoor`, `module_size` 키가 보여야 한다 (Phase 1 리포트의 실제 컬럼명 그대로).

- [ ] **Step 6: Commit**

```bash
git add tools/convert_cost_data.py
git commit -m "feat: add cost-data conversion script (sheet reader + LED module split)"
```

---

### Task 2: 변환 스크립트 — 나머지 카테고리 + `led-cost-data.js` 생성

**Files:**
- Modify: `tools/convert_cost_data.py`
- Create: `data/led-cost-data.js` (스크립트 실행 산출물)

**Interfaces:**
- Consumes: Task 1의 `read_category_sheet`, `split_led_modules`.
- Produces: `filter_aluminum_boxes(rows: list[dict]) -> list[dict]` — `material == 'aluminum'`인 행만.
- Produces: `build_bucket_list(rows: list[dict]) -> list[dict]` — `area_bucket_sqm`이 `None`이 아닌 행만 남기고 `area_bucket_sqm` 오름차순 정렬.
- Produces: `to_js_literal(value) -> str` — Python 값을 JS 리터럴 문자열로 (None→`null`, str→`JSON.dumps`처럼 이스케이프, 그 외는 `str()`).
- Produces: `write_led_cost_data_js(output_path: str, data: dict) -> None` — `window.LED_COST_DATA = {...};` 형태로 파일 작성.
- Produces: `main(xlsx_path: str, output_path: str) -> None` — 전체 변환 실행.

- [ ] **Step 1: 나머지 헬퍼 함수 작성**

`tools/convert_cost_data.py`에 추가:
```python
def filter_aluminum_boxes(rows: list[dict]) -> list[dict]:
    return [r for r in rows if (r.get('material') or '').lower() == 'aluminum']


def build_bucket_list(rows: list[dict]) -> list[dict]:
    filtered = [r for r in rows if r.get('area_bucket_sqm') is not None]
    return sorted(filtered, key=lambda r: r['area_bucket_sqm'])


def to_js_literal(value) -> str:
    import json
    if value is None:
        return 'null'
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return str(value)
```

- [ ] **Step 2: `write_led_cost_data_js` 작성**

```python
def _row_to_js_object(row: dict) -> str:
    parts = [f'{json_key(k)}: {to_js_literal(v)}' for k, v in row.items() if v is not None]
    return '{' + ', '.join(parts) + '}'


def json_key(k: str) -> str:
    import json
    return json.dumps(str(k), ensure_ascii=False)


def write_led_cost_data_js(output_path: str, data: dict) -> None:
    lines = ['window.LED_COST_DATA = {']
    for key, rows in data.items():
        lines.append(f'  {json_key(key)}: [')
        for row in rows:
            lines.append(f'    {_row_to_js_object(row)},')
        lines.append('  ],')
    lines.append('};')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
```

- [ ] **Step 3: `main` 작성**

```python
def main(xlsx_path: str, output_path: str) -> None:
    wb = openpyxl.load_workbook(xlsx_path)
    led_rows = read_category_sheet(wb, 'LED모듈')
    smd, gob_cob = split_led_modules(led_rows)

    boxes = filter_aluminum_boxes(read_category_sheet(wb, '박스(다이캐스팅_철함체)'))

    data = {
        'ledModulesSmd': smd,
        'ledModulesGobCob': gob_cob,
        'receivingCards': read_category_sheet(wb, '수신카드'),
        'smps': read_category_sheet(wb, 'SMPS'),
        'processors': read_category_sheet(wb, '프로세서'),
        'boxes': boxes,
        'cable220v': read_category_sheet(wb, '케이블_220V'),
        'cableCat6': read_category_sheet(wb, '케이블_CAT6'),
        'cable16p': read_category_sheet(wb, '케이블_16P플랫'),
        'woodBox': build_bucket_list(read_category_sheet(wb, '우드박스')),
        'freight': build_bucket_list(read_category_sheet(wb, '운송비')),
    }
    write_led_cost_data_js(output_path, data)
    print(f'{output_path} 작성 완료')
    for k, v in data.items():
        print(f'  {k}: {len(v)}건')
```

- [ ] **Step 4: `_selftest`에 새 함수 검증 추가**

`tools/convert_cost_data.py`의 `_selftest()` 함수 안, 기존 assert들 뒤에 추가:
```python
    boxes = filter_aluminum_boxes([
        {'material': 'aluminum', 'size': '640*480mm'},
        {'material': 'steel', 'size': '640*480mm'},
    ])
    assert len(boxes) == 1 and boxes[0]['material'] == 'aluminum', boxes

    buckets = build_bucket_list([
        {'area_bucket_sqm': 10, 'representative_price': 1},
        {'area_bucket_sqm': None, 'representative_price': 2},
        {'area_bucket_sqm': 5, 'representative_price': 3},
    ])
    assert [b['area_bucket_sqm'] for b in buckets] == [5, 10], buckets

    assert to_js_literal(None) == 'null'
    assert to_js_literal('a"b') == '"a\\"b"'
    assert to_js_literal(3.5) == '3.5'

    print('convert_cost_data self-test (part 2): OK')
```

- [ ] **Step 5: `main` 실행부 추가 및 실행 확인**

`tools/convert_cost_data.py` 맨 아래 `if __name__ == '__main__':` 블록을 다음으로 교체:
```python
if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        _selftest()
    else:
        xlsx = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx'
        out = sys.argv[2] if len(sys.argv) > 2 else 'data/led-cost-data.js'
        main(xlsx, out)
```

```bash
PY="/c/Users/aquab/AppData/Local/Python/bin/python.exe"
export PYTHONIOENCODING=utf-8
"$PY" tools/convert_cost_data.py --selftest
mkdir -p data
"$PY" tools/convert_cost_data.py
```
Expected: self-test OK, 그 다음 실행에서 `data/led-cost-data.js 작성 완료` + 카테고리별 건수 출력(0건인 카테고리가 있으면 그 자체는 정상일 수 있음 — 다만 `ledModulesSmd`, `boxes`, `woodBox`, `freight`는 0이면 안 됨. 0이면 Task 1에서 확인한 실제 컬럼명이 이 스크립트의 `.get()` 키와 정확히 일치하는지 다시 확인한다).

- [ ] **Step 6: 생성된 파일 육안 검증**

`data/led-cost-data.js` 앞부분을 읽어 `window.LED_COST_DATA = {` 로 시작하고, `ledModulesSmd` 배열 원소가 `{"pitch": 1.86, "대표단가": 152, ...}` 형태의 유효한 JS 객체 리터럴인지 확인한다. 값에 한글 컬럼명이 키로 그대로 들어가는 것은 의도된 동작이다(Task 3에서 매핑).

- [ ] **Step 7: Commit**

```bash
git add tools/convert_cost_data.py data/led-cost-data.js
git commit -m "feat: generate led-cost-data.js from Phase 1 extraction"
```

---

### Task 3: BOM 수량·원가 계산 엔진 (`led-quote-estimator-calc.js`)

**Files:**
- Create: `admin-tools/led-quote-estimator-calc.js`
- Test: `admin-tools/led-quote-estimator-calc.test.js`

**Interfaces:**
- Consumes: `data/led-cost-data.js`의 `window.LED_COST_DATA` 구조 (카테고리별 배열, 각 행은 Task 2에서 만든 그대로의 한글 키를 포함 — 예: `대표단가`, `관측횟수`, `pitch`, `indoor_outdoor`, `module_size`, `area_bucket_sqm`, `size`, `brand`, `model`).
- Consumes: `admin-tools/led-layout-engine.js`의 `computeLED(input) -> result` 반환 형태를 **그대로 복제**한다 (원본 파일은 require하지 않고, 로직을 이 파일 안에 복사한다 — Global Constraints의 "수정 금지"는 원본 파일에 대한 것이며, 로직 복제는 허용된다는 스펙의 설계 의도). 복제 시 `result.cabinets`(각 `{w,h,n,role,kg,kgTotal}`), `result.totalCabinets`, `result.totalModules`, `result.area`(㎡)를 사용한다.
- Produces: `findNearestBucket(sortedBuckets: Array<{area_bucket_sqm:number, 대표단가:number, 관측횟수:number}>, targetAreaSqm: number) -> {row: object|null, exact: boolean, outOfRange: boolean}`.
- Produces: `findBoxPrice(boxes: Array<{size:string, 대표단가:number, 관측횟수:number}>, w: number, h: number) -> {row: object|null, exact: boolean}` — `size`가 `` `${w}*${h}mm` ``와 정확히 일치하는 행을 찾고, 없으면 `size` 문자열을 `w*h` 정수 쌍으로 파싱해 면적 차이가 가장 작은 행을 선택.
- Produces: `computeQuote(input: {W:number, H:number, moduleGroup:'smd'|'gobcob', pitch:number, receivingCardIndex:number, smpsIndex:number, processorIndex:number}, costData: object) -> {layout: object, items: Array<{label:string, qty:number, unitPrice:number, subtotal:number, currency:string, observationCount:number, warning:string|null}>, totalCny: number, warnings: string[]}`.

- [ ] **Step 1: 레이아웃 엔진 로직 복제 + 실패하는 테스트 작성**

`admin-tools/led-quote-estimator-calc.test.js`:
```js
const assert = require('assert');
const {
  computeLED, findNearestBucket, findBoxPrice, computeQuote,
} = require('./led-quote-estimator-calc.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

// ── computeLED (복제본이 원본과 동일하게 동작하는지) ─────────────────────
test('computeLED 2000x1500 @ P2.5 -> 640x480 x 9', () => {
  const r = computeLED({ modelId: 'p2.5', W: 2000, H: 1500 });
  assert.strictEqual(r.totalCabinets, 9);
  const base = r.cabinets.find((c) => c.w === 640 && c.h === 480);
  assert.ok(base);
  assert.strictEqual(base.n, 9);
});

// ── findNearestBucket ────────────────────────────────────────────────────
test('findNearestBucket: 정확히 일치하는 버킷 우선', () => {
  const buckets = [
    { area_bucket_sqm: 5, 대표단가: 260, 관측횟수: 10 },
    { area_bucket_sqm: 10, 대표단가: 450, 관측횟수: 5 },
  ];
  const r = findNearestBucket(buckets, 10);
  assert.strictEqual(r.row.area_bucket_sqm, 10);
  assert.strictEqual(r.exact, true);
  assert.strictEqual(r.outOfRange, false);
});

test('findNearestBucket: 범위 밖이면 outOfRange=true, 가장 가까운 값 반환', () => {
  const buckets = [
    { area_bucket_sqm: 5, 대표단가: 260, 관측횟수: 10 },
    { area_bucket_sqm: 90, 대표단가: 7000, 관측횟수: 1 },
  ];
  const r = findNearestBucket(buckets, 200);
  assert.strictEqual(r.row.area_bucket_sqm, 90);
  assert.strictEqual(r.outOfRange, true);
});

test('findNearestBucket: 빈 배열이면 row=null', () => {
  const r = findNearestBucket([], 10);
  assert.strictEqual(r.row, null);
});

// ── findBoxPrice ─────────────────────────────────────────────────────────
test('findBoxPrice: 정확히 일치하는 사이즈', () => {
  const boxes = [
    { size: '640*480mm', 대표단가: 203, 관측횟수: 8 },
    { size: '640*640mm', 대표단가: 300, 관측횟수: 5 },
  ];
  const r = findBoxPrice(boxes, 640, 480);
  assert.strictEqual(r.exact, true);
  assert.strictEqual(r.row.대표단가, 203);
});

test('findBoxPrice: 정확히 없으면 면적이 가장 가까운 사이즈로 대체', () => {
  const boxes = [
    { size: '640*480mm', 대표단가: 203, 관측횟수: 8 },
    { size: '320*160mm', 대표단가: 50, 관측횟수: 3 },
  ];
  const r = findBoxPrice(boxes, 640, 320); // 면적 204800, 640*480=307200(차 102400), 320*160=51200(차 153600)
  assert.strictEqual(r.exact, false);
  assert.strictEqual(r.row.size, '640*480mm');
});

// ── computeQuote (통합) ──────────────────────────────────────────────────
const SAMPLE_COST_DATA = {
  ledModulesSmd: [
    { pitch: 1.86, indoor_outdoor: 'indoor', module_size: '320*160mm', 대표단가: 152, 통화: 'CNY', 관측횟수: 22 },
  ],
  receivingCards: [
    { brand: 'Novastar', model: 'MRV412', 대표단가: 98, 통화: 'CNY', 관측횟수: 15 },
  ],
  smps: [
    { voltage: 'AC220-240V', capacity: '5V40A', 대표단가: 45, 통화: 'CNY', 관측횟수: 10 },
  ],
  processors: [
    { brand: 'Novastar', model: 'TB60', 대표단가: 2880, 통화: 'CNY', 관측횟수: 3 },
  ],
  boxes: [
    { size: '640*480mm', material: 'aluminum', 대표단가: 203, 통화: 'CNY', 관측횟수: 8 },
  ],
  cable220v: [{ length_mm: 750, 대표단가: 22, 통화: 'CNY', 관측횟수: 12 }],
  cableCat6: [{ length_mm: 1000, 대표단가: 20, 통화: 'CNY', 관측횟수: 12 }],
  cable16p: [{ 대표단가: 15, 통화: 'CNY', 관측횟수: 12 }],
  woodBox: [{ area_bucket_sqm: 5, 대표단가: 260, 통화: 'CNY', 관측횟수: 20 }],
  freight: [{ area_bucket_sqm: 5, 대표단가: 300, 통화: 'CNY', 관측횟수: 18 }],
};

test('computeQuote: 2000x1500 SMD P1.86 전체 항목 산출', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86,
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);

  assert.strictEqual(result.layout.totalCabinets, 9);
  const moduleItem = result.items.find((i) => i.label.includes('LED 모듈'));
  assert.ok(moduleItem);
  assert.strictEqual(moduleItem.unitPrice, 152);
  assert.strictEqual(moduleItem.qty, result.layout.totalModules);

  const boxItem = result.items.find((i) => i.label.includes('박스'));
  assert.strictEqual(boxItem.qty, 9);
  assert.strictEqual(boxItem.unitPrice, 203);

  const rcvItem = result.items.find((i) => i.label.includes('수신카드'));
  assert.strictEqual(rcvItem.qty, 9); // totalCabinets

  const woodItem = result.items.find((i) => i.label.includes('우드박스'));
  assert.strictEqual(woodItem.unitPrice, 260);

  assert.ok(result.totalCny > 0);
});

test('computeQuote: 관측횟수 2 이하인 항목은 경고를 단다', () => {
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86,
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, SAMPLE_COST_DATA);
  const procItem = result.items.find((i) => i.label.includes('프로세서'));
  assert.ok(procItem.warning, '관측횟수 3인 항목은 경고 없음이 맞음'); // processors 관측횟수=3 -> 경고 없음이 기대값이므로 이 assert는 실패해야 정상
});
```

- [ ] **Step 2: 위 마지막 테스트 케이스 수정 (의도적 실수 정정)**

Step 1의 마지막 테스트(`관측횟수 2 이하...`)는 초안 작성 중 실수로 관측횟수 3(경고 없음 기준)인 항목을 검증하고 있다. 실행하기 전에 아래로 교체한다 — SMPS 항목의 데이터를 관측횟수 2로 바꿔 경고가 실제로 뜨는 케이스를 검증한다:
```js
test('computeQuote: 관측횟수 2 이하인 항목은 경고를 단다', () => {
  const lowConfidenceData = JSON.parse(JSON.stringify(SAMPLE_COST_DATA));
  lowConfidenceData.smps[0].관측횟수 = 2;
  const result = computeQuote({
    W: 2000, H: 1500, moduleGroup: 'smd', pitch: 1.86,
    receivingCardIndex: 0, smpsIndex: 0, processorIndex: 0,
  }, lowConfidenceData);
  const smpsItem = result.items.find((i) => i.label.includes('SMPS'));
  assert.ok(smpsItem.warning, 'SMPS 관측횟수 2는 경고가 있어야 함');
  const procItem = result.items.find((i) => i.label.includes('프로세서'));
  assert.strictEqual(procItem.warning, null, '프로세서 관측횟수 3은 경고 없음');
});
```

- [ ] **Step 3: RED 확인**

```bash
cd "C:\Users\aquab\AppData\Local\Temp\claude\C--Users-aquab\6a455f52-b935-43d3-b052-e6c7b61cd7f6\scratchpad\ONLYONE-LED"
node admin-tools/led-quote-estimator-calc.test.js
```
Expected: `Cannot find module './led-quote-estimator-calc.js'` 에러로 전부 실패.

- [ ] **Step 4: `admin-tools/led-quote-estimator-calc.js` 구현**

`admin-tools/led-layout-engine.js`의 `computeLED`/`decompWidth`/`decompHeight`/`cabRole`/`cabWeight`/`nextBreaker` 로직을 그대로 복제하고(원본 상수 `MODULES`, `MODULE_MM_W`, `MODULE_MM_H`, `CABINET_WEIGHT`, `BREAKER_SIZES`, `SINGLE_V`, `THREE_V`, `PF` 포함), 그 아래에 이 태스크의 새 함수를 추가한다:

```js
// admin-tools/led-quote-estimator-calc.js
//
// led-layout-calc.html / admin-tools/led-layout-engine.js의 배치 계산 로직을
// 그대로 복제한 것이다 (원본 수정 금지 원칙 — 새 파일에만 반영).
// 아래 MODULES ~ computeLED까지는 led-layout-engine.js와 동일하다.

const MODULES = [
  { id: 'p2.5',   pitch: 2.5,   resW: 128, resH: 64,  w: 35   },
  { id: 'p2.0',   pitch: 2.0,   resW: 160, resH: 80,  w: 33.3 },
  { id: 'p1.86',  pitch: 1.86,  resW: 172, resH: 86,  w: 33.3 },
  { id: 'p1.538', pitch: 1.538, resW: 208, resH: 104, w: 35   },
  { id: 'p1.25',  pitch: 1.25,  resW: 256, resH: 128, w: 38   },
];
const MODULE_MM_W = 320, MODULE_MM_H = 160;
const PX_PER_LINE = 650000;

const CABINET_WEIGHT = {
  '640x640': 8.9, '640x480': 7.0, '640x320': 4.8, '640x160': 2.3,
  '320x640': 4.2, '320x480': 4.1, '320x320': 2.2, '320x160': 1.8,
};
function cabWeight(w, h) { return CABINET_WEIGHT[w + 'x' + h] || 0; }

const BREAKER_SIZES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800];
function nextBreaker(a) { for (const b of BREAKER_SIZES) if (b >= a) return b; return Math.ceil(a / 100) * 100; }
const SINGLE_V = 220, THREE_V = 380, PF = 0.8;

function decompWidth(W) {
  const usable = Math.floor(W / 320) * 320;
  const discard = W - usable;
  const units = usable / 320;
  const cols = [];
  const n640 = Math.floor(units / 2);
  for (let i = 0; i < n640; i++) cols.push(640);
  if (units % 2 === 1) cols.push(320);
  return { cols, usable, discard };
}

function decompHeight(H) {
  const usable = Math.floor(H / 160) * 160;
  const discard = H - usable;
  const rows = [];
  const q = Math.floor(usable / 480);
  const r = usable - q * 480;
  if (r === 0) {
    for (let i = 0; i < q; i++) rows.push(480);
  } else if (r === 320) {
    for (let i = 0; i < q; i++) rows.push(480);
    rows.push(320);
  } else if (r === 160) {
    if (q >= 1) { for (let i = 0; i < q - 1; i++) rows.push(480); rows.push(640); }
    else rows.push(160);
  } else {
    throw new Error('decompHeight: unexpected remainder ' + r);
  }
  return { rows, usable, discard };
}

function cabRole(w, h) {
  if (w === 640 && h === 480) return 'base';
  if (w === 640 && h === 640) return 'combine';
  return 'fill';
}

function computeLED(input) {
  const m = MODULES.find((x) => x.id === input.modelId) || MODULES[0];
  const inW = Math.max(0, Math.round(input.W || 0));
  const inH = Math.max(0, Math.round(input.H || 0));
  const dw = decompWidth(inW);
  const dh = decompHeight(inH);
  const cols = dw.cols, rows = dh.rows;
  const tally = {};
  for (const w of cols) for (const h of rows) {
    const key = w + 'x' + h;
    if (!tally[key]) tally[key] = { w, h, n: 0, role: cabRole(w, h) };
    tally[key].n++;
  }
  const cabinets = Object.values(tally).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  cabinets.forEach((c) => { c.kg = cabWeight(c.w, c.h); c.kgTotal = c.kg * c.n; });
  const totalCabinets = cols.length * rows.length;
  const totalWeight = cabinets.reduce((s, c) => s + c.kgTotal, 0);
  const modCountW = dw.usable / 320;
  const modCountH = dh.usable / 160;
  const totalModules = modCountW * modCountH;
  const totalResW = modCountW * m.resW;
  const totalResH = modCountH * m.resH;
  const totalPx = totalResW * totalResH;
  const usableW = dw.usable, usableH = dh.usable;
  const area = (usableW / 1000) * (usableH / 1000);
  const power = totalModules * m.w;
  const ampSingle = power / SINGLE_V;
  const ampThree = power / (Math.sqrt(3) * THREE_V * PF);
  const brkSingle = nextBreaker(ampSingle);
  const brkThree = nextBreaker(ampThree);
  const dataLines = totalPx > 0 ? Math.ceil(totalPx / PX_PER_LINE) : 0;
  return {
    model: m, inW, inH,
    cols, rows, cabinets, totalCabinets,
    usableW, usableH, discardW: dw.discard, discardH: dh.discard,
    modCountW, modCountH, totalModules,
    totalResW, totalResH, totalPx,
    area, power, ampSingle, ampThree, brkSingle, brkThree,
    dataLines, totalWeight,
    tooSmall: usableW === 0 || usableH === 0,
  };
}

// ── 여기서부터 이 태스크(Task 3)의 신규 함수 ────────────────────────────

function findNearestBucket(sortedBuckets, targetAreaSqm) {
  if (!sortedBuckets.length) return { row: null, exact: false, outOfRange: false };
  let best = sortedBuckets[0];
  let bestDiff = Math.abs(best.area_bucket_sqm - targetAreaSqm);
  for (const b of sortedBuckets) {
    const diff = Math.abs(b.area_bucket_sqm - targetAreaSqm);
    if (diff < bestDiff) { best = b; bestDiff = diff; }
  }
  const min = sortedBuckets[0].area_bucket_sqm;
  const max = sortedBuckets[sortedBuckets.length - 1].area_bucket_sqm;
  const exact = bestDiff === 0;
  const outOfRange = targetAreaSqm < min || targetAreaSqm > max;
  return { row: best, exact, outOfRange };
}

function _parseBoxSize(size) {
  const m = /(\d+)\s*\*\s*(\d+)/.exec(size || '');
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

function findBoxPrice(boxes, w, h) {
  const exactLabel = `${w}*${h}mm`;
  const exactMatch = boxes.find((b) => b.size === exactLabel);
  if (exactMatch) return { row: exactMatch, exact: true };

  const targetArea = w * h;
  let best = null;
  let bestDiff = Infinity;
  for (const b of boxes) {
    const dims = _parseBoxSize(b.size);
    if (!dims) continue;
    const diff = Math.abs(dims.w * dims.h - targetArea);
    if (diff < bestDiff) { best = b; bestDiff = diff; }
  }
  return { row: best, exact: false };
}

function _pickTop(rows, index) {
  if (!rows || !rows.length) return null;
  const sorted = [...rows].sort((a, b) => (b.관측횟수 || 0) - (a.관측횟수 || 0));
  const i = (typeof index === 'number' && index >= 0 && index < sorted.length) ? index : 0;
  return sorted[i];
}

function _pickDefault(rows) {
  return _pickTop(rows, 0);
}

const LOW_CONFIDENCE_THRESHOLD = 2;

function _confWarning(row, label) {
  if (!row) return `${label} 데이터 없음`;
  if ((row.관측횟수 || 0) <= LOW_CONFIDENCE_THRESHOLD) {
    return `${label} 관측 ${row.관측횟수 || 0}건 — 표본이 적어 참고용`;
  }
  return null;
}

function computeQuote(input, costData) {
  const layout = computeLED({ modelId: `p${input.pitch}`, W: input.W, H: input.H });
  const warnings = [];
  const items = [];

  const moduleRows = input.moduleGroup === 'gobcob' ? costData.ledModulesGobCob : costData.ledModulesSmd;
  const moduleRow = (moduleRows || []).find((r) => r.pitch === input.pitch) || null;
  {
    const price = moduleRow ? moduleRow.대표단가 : 0;
    const w = _confWarning(moduleRow, 'LED 모듈');
    if (w) warnings.push(w);
    items.push({
      label: `LED 모듈 (P${input.pitch})`, qty: layout.totalModules, unitPrice: price,
      subtotal: layout.totalModules * price, currency: moduleRow ? moduleRow.통화 : 'CNY',
      observationCount: moduleRow ? moduleRow.관측횟수 : 0, warning: w,
    });
  }

  let boxSubtotal = 0;
  let boxQty = 0;
  const boxWarnings = [];
  for (const cab of layout.cabinets) {
    const { row: boxRow, exact } = findBoxPrice(costData.boxes || [], cab.w, cab.h);
    const price = boxRow ? boxRow.대표단가 : 0;
    boxSubtotal += price * cab.n;
    boxQty += cab.n;
    if (!exact) boxWarnings.push(`${cab.w}×${cab.h}mm 박스 단가 없음 — 근접 사이즈로 대체`);
    const w2 = _confWarning(boxRow, `박스(${cab.w}×${cab.h})`);
    if (w2) boxWarnings.push(w2);
  }
  boxWarnings.forEach((w) => warnings.push(w));
  items.push({
    label: '다이캐스팅 박스 (전체)', qty: boxQty, unitPrice: boxQty ? boxSubtotal / boxQty : 0,
    subtotal: boxSubtotal, currency: 'CNY', observationCount: null,
    warning: boxWarnings.length ? boxWarnings.join('; ') : null,
  });

  const rcvRow = _pickTop(costData.receivingCards, input.receivingCardIndex);
  {
    const price = rcvRow ? rcvRow.대표단가 : 0;
    const w = _confWarning(rcvRow, '수신카드');
    if (w) warnings.push(w);
    items.push({
      label: `수신카드 (${rcvRow ? rcvRow.brand + ' ' + rcvRow.model : '-'})`,
      qty: layout.totalCabinets, unitPrice: price, subtotal: layout.totalCabinets * price,
      currency: rcvRow ? rcvRow.통화 : 'CNY', observationCount: rcvRow ? rcvRow.관측횟수 : 0, warning: w,
    });
  }

  const smpsRow = _pickTop(costData.smps, input.smpsIndex);
  {
    const price = smpsRow ? smpsRow.대표단가 : 0;
    const w = _confWarning(smpsRow, 'SMPS');
    if (w) warnings.push(w);
    items.push({
      label: 'SMPS', qty: layout.totalCabinets, unitPrice: price,
      subtotal: layout.totalCabinets * price, currency: smpsRow ? smpsRow.통화 : 'CNY',
      observationCount: smpsRow ? smpsRow.관측횟수 : 0, warning: w,
    });
  }

  const cableSpecs = [
    ['cable220v', '220V 케이블'],
    ['cableCat6', 'CAT6 케이블'],
    ['cable16p', '16P 플랫케이블'],
  ];
  for (const [key, label] of cableSpecs) {
    const row = _pickDefault(costData[key]);
    const price = row ? row.대표단가 : 0;
    const w = _confWarning(row, label);
    if (w) warnings.push(w);
    items.push({
      label, qty: layout.totalCabinets, unitPrice: price, subtotal: layout.totalCabinets * price,
      currency: row ? row.통화 : 'CNY', observationCount: row ? row.관측횟수 : 0, warning: w,
    });
  }

  const procRow = _pickTop(costData.processors, input.processorIndex);
  {
    const price = procRow ? procRow.대표단가 : 0;
    const w = _confWarning(procRow, '프로세서');
    if (w) warnings.push(w);
    items.push({
      label: `프로세서 (${procRow ? procRow.brand + ' ' + procRow.model : '-'})`,
      qty: 1, unitPrice: price, subtotal: price,
      currency: procRow ? procRow.통화 : 'CNY', observationCount: procRow ? procRow.관측횟수 : 0, warning: w,
    });
  }

  for (const [key, label] of [['woodBox', '우드박스'], ['freight', '운송비']]) {
    const { row, exact, outOfRange } = findNearestBucket(costData[key] || [], layout.area);
    const price = row ? row.대표단가 : 0;
    let w = _confWarning(row, label);
    if (outOfRange) {
      const rangeMsg = `${label} 면적(${layout.area.toFixed(1)}㎡)이 관측 범위 밖 — 가장 가까운 값으로 대체`;
      w = w ? `${w}; ${rangeMsg}` : rangeMsg;
    }
    if (w) warnings.push(w);
    items.push({
      label, qty: 1, unitPrice: price, subtotal: price,
      currency: row ? row.통화 : 'CNY', observationCount: row ? row.관측횟수 : 0, warning: w,
    });
  }

  const totalCny = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  return { layout, items, totalCny, warnings };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MODULES, MODULE_MM_W, MODULE_MM_H, PX_PER_LINE,
    CABINET_WEIGHT, BREAKER_SIZES, SINGLE_V, THREE_V, PF,
    cabWeight, nextBreaker, decompWidth, decompHeight, cabRole, computeLED,
    findNearestBucket, findBoxPrice, computeQuote,
  };
}
```

- [ ] **Step 5: GREEN 확인**

```bash
cd "C:\Users\aquab\AppData\Local\Temp\claude\C--Users-aquab\6a455f52-b935-43d3-b052-e6c7b61cd7f6\scratchpad\ONLYONE-LED"
node admin-tools/led-quote-estimator-calc.test.js
```
Expected: 모든 테스트에 `✓` 표시, 마지막 줄에 `N tests passed`.

- [ ] **Step 6: Commit**

```bash
git add admin-tools/led-quote-estimator-calc.js admin-tools/led-quote-estimator-calc.test.js
git commit -m "feat: add BOM quantity/cost calculation engine for quote estimator"
```

---

### Task 4: `led-quote-estimator.html` — 페이지 뼈대 + 입력 폼

**Files:**
- Create: `led-quote-estimator.html`

**Interfaces:**
- Consumes: `data/led-cost-data.js`(전역 `window.LED_COST_DATA`), `admin-tools/led-quote-estimator-calc.js`(브라우저에서는 `<script>` 태그로 로드 — `module.exports` 가드 덕분에 브라우저에서도 전역 함수로 그대로 쓸 수 있다: `computeQuote`, `computeLED` 등이 전역 스코프에 선언됨).
- Produces: 아래 정확한 `id`를 가진 DOM 엘리먼트들 — Task 5가 이 id로 값을 읽고 결과를 쓴다.
  - 입력: `#inp-w`, `#inp-h`(숫자), `#tab-smd`, `#tab-gobcob`(버튼), `#sel-pitch`(select), `#sel-rcv`, `#sel-smps`, `#sel-proc`(select)
  - 출력 영역: `#res-summary`(카드 영역), `#tbody-items`(테이블 tbody), `#warnings-box`(경고 목록)

- [ ] **Step 1: HTML 뼈대 + `led-cost-calculator.html`과 동일한 CSS 변수/기본 스타일 재사용**

`led-quote-estimator.html`을 새로 만들고, `led-cost-calculator.html`의 `<style>` 블록(`:root` 변수부터 `.rate-btn:hover{...}`까지, 약 70줄)을 그대로 복사해 붙여넣는다 — 새 파일에 붙여넣는 것이므로 원본 파일은 건드리지 않는다. `<title>`은 `LED 견적 예상 계산기`로 바꾼다.

`<body>`는 다음 구조로 작성한다:
```html
<body>
<div class="sticky-top">
<div class="hdr">
  <div style="font-size:26px;">📐</div>
  <div>
    <h1>LED 견적 예상 계산기</h1>
    <p>실제 견적서 269건 분석 기반 — 화면 사이즈 입력 시 자동 산출</p>
  </div>
</div>
</div>

<div class="wrap">

<div class="notice">
  ⚠️ 이 계산기는 <b>과거 견적서에서 관측된 단가</b>를 근거로 한 예상치입니다.
  실제 발주가는 업체 협상·시장 변동에 따라 달라질 수 있습니다.
</div>

<div class="card">
  <h2>📏 화면 사이즈</h2>
  <div class="grid2">
    <div class="frow"><label>가로 (mm)</label><input type="number" id="inp-w" value="2000" min="320" step="10"></div>
    <div class="frow"><label>세로 (mm)</label><input type="number" id="inp-h" value="1500" min="160" step="10"></div>
  </div>
</div>

<div class="card">
  <h2>🔲 LED 모듈</h2>
  <div class="tabs">
    <button class="tab-btn active" id="tab-smd">SMD</button>
    <button class="tab-btn" id="tab-gobcob">GOB/COB (타업체 참고 데이터)</button>
  </div>
  <div class="frow">
    <label>피치</label>
    <select id="sel-pitch"></select>
  </div>
</div>

<div class="card">
  <h2>🎛️ 부품 선택</h2>
  <div class="grid3">
    <div class="frow"><label>수신카드</label><select id="sel-rcv"></select></div>
    <div class="frow"><label>SMPS</label><select id="sel-smps"></select></div>
    <div class="frow"><label>프로세서</label><select id="sel-proc"></select></div>
  </div>
</div>

<div class="card">
  <h2>📊 예상 원가</h2>
  <div class="res-grid" id="res-summary"></div>
  <div class="tbl-wrap">
    <table>
      <thead><tr><th>항목</th><th>수량</th><th class="tr">단가(CNY)</th><th class="tr">소계(CNY)</th><th>비고</th></tr></thead>
      <tbody id="tbody-items"></tbody>
    </table>
  </div>
  <div id="warnings-box"></div>
</div>

</div><!-- /wrap -->

<script src="data/led-cost-data.js"></script>
<script src="admin-tools/led-quote-estimator-calc.js"></script>
<script>
// Task 5에서 채움
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add led-quote-estimator.html
git commit -m "feat: add quote estimator page skeleton and input form"
```

---

### Task 5: 결과 렌더링 + SMD/GOB·COB 탭 전환 로직

**Files:**
- Modify: `led-quote-estimator.html` (Task 4의 빈 `<script>` 블록 채움)

**Interfaces:**
- Consumes: Task 3의 `computeQuote(input, costData)`, `window.LED_COST_DATA`.
- Consumes: Task 4의 DOM id들.

- [ ] **Step 1: 렌더링 스크립트 작성**

Task 4의 빈 `<script>` 블록을 다음으로 채운다:
```js
let currentGroup = 'smd';

function pitchOptionsFor(group) {
  const rows = group === 'gobcob' ? LED_COST_DATA.ledModulesGobCob : LED_COST_DATA.ledModulesSmd;
  const byPitch = {};
  rows.forEach((r) => { byPitch[r.pitch] = byPitch[r.pitch] || r; });
  return Object.values(byPitch).sort((a, b) => a.pitch - b.pitch);
}

function fillSelect(selectEl, rows, labelFn) {
  selectEl.innerHTML = '';
  rows.forEach((r, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = labelFn(r);
    selectEl.appendChild(o);
  });
}

function rebuildPitchSelect() {
  const rows = pitchOptionsFor(currentGroup);
  fillSelect(document.getElementById('sel-pitch'), rows, (r) => `P${r.pitch} — ¥${r.대표단가} (관측 ${r.관측횟수}건)`);
}

function switchTab(group) {
  currentGroup = group;
  document.getElementById('tab-smd').classList.toggle('active', group === 'smd');
  document.getElementById('tab-gobcob').classList.toggle('active', group === 'gobcob');
  rebuildPitchSelect();
  calc();
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return Math.round(n).toLocaleString('ko-KR');
}

function card(cls, lbl, val) {
  return `<div class="res-card ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div></div>`;
}

function calc() {
  const pitchSel = document.getElementById('sel-pitch');
  const pitchRows = pitchOptionsFor(currentGroup);
  const pitch = pitchRows.length ? pitchRows[pitchSel.value || 0].pitch : null;
  if (pitch === null) {
    document.getElementById('tbody-items').innerHTML = '<tr><td colspan="5">이 그룹에 등록된 모듈 데이터가 없습니다.</td></tr>';
    return;
  }

  const input = {
    W: parseFloat(document.getElementById('inp-w').value) || 0,
    H: parseFloat(document.getElementById('inp-h').value) || 0,
    moduleGroup: currentGroup,
    pitch,
    receivingCardIndex: parseInt(document.getElementById('sel-rcv').value || 0, 10),
    smpsIndex: parseInt(document.getElementById('sel-smps').value || 0, 10),
    processorIndex: parseInt(document.getElementById('sel-proc').value || 0, 10),
  };

  const result = computeQuote(input, LED_COST_DATA);

  document.getElementById('res-summary').innerHTML =
    card('blue', '총 캐비닛 수', result.layout.totalCabinets + '개') +
    card('green', '총 모듈 수', result.layout.totalModules + '개') +
    card('orange', '화면 면적', result.layout.area.toFixed(2) + '㎡') +
    card('purple', '예상 원가 합계', '¥' + fmt(result.totalCny));

  document.getElementById('tbody-items').innerHTML = result.items.map((it) => `
    <tr>
      <td>${it.label}</td>
      <td>${it.qty}</td>
      <td class="tr">¥${fmt(it.unitPrice)}</td>
      <td class="tr">¥${fmt(it.subtotal)}</td>
      <td>${it.warning ? '<span style="color:var(--orange);font-size:11px;">⚠ ' + it.warning + '</span>' : ''}</td>
    </tr>
  `).join('');

  const warningsBox = document.getElementById('warnings-box');
  warningsBox.innerHTML = result.warnings.length
    ? '<div class="notice">' + result.warnings.map((w) => '⚠ ' + w).join('<br>') + '</div>'
    : '';
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-smd').addEventListener('click', () => switchTab('smd'));
  document.getElementById('tab-gobcob').addEventListener('click', () => switchTab('gobcob'));
  document.getElementById('sel-pitch').addEventListener('change', calc);
  document.getElementById('inp-w').addEventListener('input', calc);
  document.getElementById('inp-h').addEventListener('input', calc);

  fillSelect(document.getElementById('sel-rcv'), LED_COST_DATA.receivingCards,
    (r) => `${r.brand} ${r.model} — ¥${r.대표단가} (관측 ${r.관측횟수}건)`);
  fillSelect(document.getElementById('sel-smps'), LED_COST_DATA.smps,
    (r) => `${r.voltage || ''} ${r.capacity || ''} — ¥${r.대표단가} (관측 ${r.관측횟수}건)`);
  fillSelect(document.getElementById('sel-proc'), LED_COST_DATA.processors,
    (r) => `${r.brand} ${r.model} — ¥${r.대표단가} (관측 ${r.관측횟수}건)`);
  document.getElementById('sel-rcv').addEventListener('change', calc);
  document.getElementById('sel-smps').addEventListener('change', calc);
  document.getElementById('sel-proc').addEventListener('change', calc);

  rebuildPitchSelect();
  calc();
});
```

- [ ] **Step 2: Commit**

```bash
git add led-quote-estimator.html
git commit -m "feat: wire result rendering and SMD/GOB-COB tab switching"
```

---

### Task 6: 브라우저 검증

**Files:** 없음 (검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1-5의 전체 산출물.

- [ ] **Step 1: 로컬 정적 서버로 열기**

이 저장소는 정적 사이트라 별도 빌드 없이 파일을 직접 열거나 간단한 정적 서버로 띄우면 된다:
```bash
cd "C:\Users\aquab\AppData\Local\Temp\claude\C--Users-aquab\6a455f52-b935-43d3-b052-e6c7b61cd7f6\scratchpad\ONLYONE-LED"
"$PY" -m http.server 8910
```
(`PY`는 Global Constraints의 파이썬 전체 경로)

- [ ] **Step 2: 브라우저로 확인**

`http://localhost:8910/led-quote-estimator.html`을 열어:
1. 가로 2000 / 세로 1500, SMD 탭, 임의 피치로 결과가 즉시 표시되는지 (총 캐비닛/모듈 수/면적/합계 카드 + 항목별 테이블)
2. GOB/COB 탭을 누르면 피치 목록이 바뀌고 "타업체 참고 데이터"라는 라벨이 보이는지
3. 콘솔에 에러(특히 `LED_COST_DATA is not defined`, `computeQuote is not defined` 같은 로드 순서 에러)가 없는지
4. 수신카드/SMPS/프로세서 드롭다운을 바꾸면 합계가 갱신되는지
5. Phase 1 리포트의 `LED모듈` 시트에서 확인했던 P1.86 실내 GOB 대표단가(182 CNY)가 GOB/COB 탭에서 그대로 보이는지(피치 P1.86 선택 시 모듈 단가로 확인)

- [ ] **Step 3: 기존 두 계산기가 그대로인지 최종 확인**

```bash
git diff --stat main -- led-layout-calc.html led-cost-calculator.html admin-tools/led-layout-engine.js
```
Expected: 출력 없음(diff 없음) — 이 태스크까지 오는 동안 세 파일에 어떤 변경도 없었어야 한다.

- [ ] **Step 4: 정적 서버 종료**

```bash
# http.server를 백그라운드로 띄웠다면 해당 프로세스 종료
```

---

## Self-Review 결과

1. **스펙 커버리지**: 데이터 흐름(xlsx→스크립트→JS 데이터→페이지) Task 1-2, SMD/GOB·COB 분리 Task 1·5, BOM 배율 표 전체(모듈/박스/수신카드/SMPS/케이블 3종/프로세서/우드박스/운송비) Task 3, 데이터 신뢰도 경고(관측횟수·범위밖·사이즈불일치) Task 3, 기존 파일 미수정 Task 6 Step 3에서 검증. 갭 없음.
2. **플레이스홀더 스캔**: "TODO"/"나중에" 없음. Task 3 Step 1의 마지막 테스트는 초안 실수를 Step 2에서 명시적으로 정정하도록 해뒀다(placeholder가 아니라 실제 실수 교정 지시).
3. **타입/이름 일관성**: `computeQuote`의 반환 키(`layout, items, totalCny, warnings`)가 Task 5의 렌더링 코드에서 그대로 쓰임. `items[].{label,qty,unitPrice,subtotal,currency,observationCount,warning}` 필드명이 Task 3 테스트와 Task 5 렌더링에서 동일. `LED_COST_DATA`의 카테고리 키(`ledModulesSmd, ledModulesGobCob, receivingCards, smps, processors, boxes, cable220v, cableCat6, cable16p, woodBox, freight`)가 Task 2(생성)·Task 3(소비)·Task 5(소비)에서 동일하게 사용됨. 불일치 없음.
