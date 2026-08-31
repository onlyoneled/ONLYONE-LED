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


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        _selftest()
    else:
        xlsx = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\aquab\Downloads\온리원LED_원가데이터_추출.xlsx'
        out = sys.argv[2] if len(sys.argv) > 2 else 'data/led-cost-data.js'
        main(xlsx, out)
