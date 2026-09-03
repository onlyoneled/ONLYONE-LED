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


def split_led_modules(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    smd_rows, gob_cob_rows = [], []
    for row in rows:
        if row.get('pitch') is None:
            continue
        rtype = (row.get('type') or '').upper()
        count = row.get('관측횟수') or 0
        if rtype == 'SMD':
            if count >= 2:
                smd_rows.append(row)
        elif rtype in ('GOB', 'COB'):
            gob_cob_rows.append(row)
    return smd_rows, gob_cob_rows


def filter_aluminum_boxes(rows: list[dict]) -> list[dict]:
    return [r for r in rows if (r.get('material') or '').lower() == 'aluminum']


def build_bucket_list(rows: list[dict]) -> list[dict]:
    filtered = [r for r in rows if r.get('area_bucket_sqm') is not None]
    return sorted(filtered, key=lambda r: r['area_bucket_sqm'])


def sort_by_observation_count(rows: list[dict]) -> list[dict]:
    """관측횟수 내림차순(most-observed first) 정렬.

    fillSelect()가 이 순서 그대로 드롭다운 옵션(value=index)을 만들고,
    _pickTop()이 그 index로 동일 배열을 그대로 인덱싱하므로, 정렬은
    반드시 여기(데이터 소스)에서 한 번만 해야 한다 — 화면쪽(JS)에서
    다시 정렬하면 두 인덱스 공간이 어긋나 드롭다운 선택과 실제 가격이
    서로 다른 행을 가리키게 된다(2026-08-31 리뷰에서 발견된 버그).
    """
    return sorted(rows, key=lambda r: r.get('관측횟수') or 0, reverse=True)


# 다운스트림(JS)에서 실제로 읽는 필드만 최종 출력에 남긴다. 원본 Phase 1
# 리포트 컬럼에는 고객사/프로젝트명이 노출되는 파일 경로(최근견적파일명)
# 등 민감 정보가 섞여 있는데, 이 페이지는 공개 정적 사이트로 배포되므로
# 화이트리스트에 없는 필드는 전부 제거한다.
FIELD_WHITELIST = {
    'ledModulesSmd': {'pitch', 'indoor_outdoor', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'ledModulesGobCob': {'pitch', 'indoor_outdoor', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'receivingCards': {'brand', 'model', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'smps': {'voltage', 'capacity', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'processors': {'brand', 'model', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'boxes': {'size', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'cable220v': {'대표단가', '통화', '관측횟수', '최소', '최대'},
    'cableCat6': {'대표단가', '통화', '관측횟수', '최소', '최대'},
    'cable16p': {'대표단가', '통화', '관측횟수', '최소', '최대'},
    'woodBox': {'area_bucket_sqm', '대표단가', '통화', '관측횟수', '최소', '최대'},
    'freight': {'area_bucket_sqm', '대표단가', '통화', '관측횟수', '최소', '최대'},
}


def whitelist_fields(rows: list[dict], allowed_keys: set) -> list[dict]:
    return [{k: v for k, v in row.items() if k in allowed_keys} for row in rows]


def to_js_literal(value) -> str:
    import json
    if value is None:
        return 'null'
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return str(value)


def json_key(k: str) -> str:
    import json
    return json.dumps(str(k), ensure_ascii=False)


def _row_to_js_object(row: dict) -> str:
    parts = [f'{json_key(k)}: {to_js_literal(v)}' for k, v in row.items() if v is not None]
    return '{' + ', '.join(parts) + '}'


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


def main(xlsx_path: str, output_path: str) -> None:
    wb = openpyxl.load_workbook(xlsx_path)
    led_rows = read_category_sheet(wb, 'LED모듈')
    smd, gob_cob = split_led_modules(led_rows)

    boxes = filter_aluminum_boxes(read_category_sheet(wb, '박스(다이캐스팅_철함체)'))

    data = {
        'ledModulesSmd': smd,
        'ledModulesGobCob': gob_cob,
        'receivingCards': sort_by_observation_count(read_category_sheet(wb, '수신카드')),
        'smps': sort_by_observation_count(read_category_sheet(wb, 'SMPS')),
        'processors': sort_by_observation_count(read_category_sheet(wb, '프로세서')),
        'boxes': boxes,
        'cable220v': read_category_sheet(wb, '케이블_220V'),
        'cableCat6': read_category_sheet(wb, '케이블_CAT6'),
        'cable16p': read_category_sheet(wb, '케이블_16P플랫'),
        'woodBox': build_bucket_list(read_category_sheet(wb, '우드박스')),
        'freight': build_bucket_list(read_category_sheet(wb, '운송비')),
    }
    data = {k: whitelist_fields(v, FIELD_WHITELIST[k]) for k, v in data.items()}
    write_led_cost_data_js(output_path, data)
    print(f'{output_path} 작성 완료')
    for k, v in data.items():
        print(f'  {k}: {len(v)}건')


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

    smd_missing_pitch, gob_cob_missing_pitch = split_led_modules([
        {'type': 'SMD', '관측횟수': 17, '대표단가': 245},   # pitch 없음, 관측횟수 높아도 제외
        {'type': 'SMD', '관측횟수': 5, 'pitch': 1.86},
        {'type': 'GOB', '관측횟수': 4},                      # pitch 없음 -> 제외
        {'type': 'COB', '관측횟수': 3, 'pitch': 1.53},
    ])
    assert len(smd_missing_pitch) == 1 and smd_missing_pitch[0]['pitch'] == 1.86, smd_missing_pitch
    assert len(gob_cob_missing_pitch) == 1 and gob_cob_missing_pitch[0]['pitch'] == 1.53, gob_cob_missing_pitch
    print('convert_cost_data self-test (missing pitch regression): OK')

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

    ordered = sort_by_observation_count([
        {'model': 'a', '관측횟수': 5},
        {'model': 'b', '관측횟수': 17},
        {'model': 'c', '관측횟수': None},
        {'model': 'd', '관측횟수': 9},
    ])
    assert [r['model'] for r in ordered] == ['b', 'd', 'a', 'c'], ordered

    whitelisted = whitelist_fields(
        [{'brand': 'Novastar', 'model': 'TB60', '대표단가': 2880, '최근견적파일명': r'C:\secret\customer.xlsx',
          '최근견적일': '2026-01-01', '평균': 100}],
        {'brand', 'model', '대표단가'},
    )
    assert whitelisted == [{'brand': 'Novastar', 'model': 'TB60', '대표단가': 2880}], whitelisted
    assert '최근견적파일명' not in whitelisted[0]

    print('convert_cost_data self-test (field whitelist / observation sort): OK')


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        _selftest()
    else:
        xlsx = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx'
        out = sys.argv[2] if len(sys.argv) > 2 else 'data/led-cost-data.js'
        main(xlsx, out)
