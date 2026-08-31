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
        rtype = (row.get('type') or '').upper()
        count = row.get('관측횟수') or 0
        if rtype == 'SMD':
            if count >= 2:
                smd_rows.append(row)
        elif rtype in ('GOB', 'COB'):
            gob_cob_rows.append(row)
    return smd_rows, gob_cob_rows


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
