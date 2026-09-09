# 견적서 업로드 지속 반영 (Phase 3) 설계

## 배경

Phase 1(Python 배치)로 269개 과거 견적서에서 원가 데이터를 뽑아 `led-cost-data.js`(정적)를 만들었고,
Phase 2로 `led-quote-estimator.html`(화면 사이즈 → 예상 견적)을 만들었다. 이번엔 **새 견적서를 웹에서
업로드하면 계속 데이터가 쌓이도록** 만든다.

## 목표

관리자 페이지에서 xlsx 견적서를 업로드 → 자동 분류/추출 → 애매하거나 이상치인 건 **검토대기**로
쌓임 → 관리자가 승인 → 승인된 것만 `led-quote-estimator.html`의 원가 계산에 반영된다.

## 왜 새 인프라가 필요한가

Phase 1의 분류 로직(헤더 해석/견적 판별/품목 분류/속성 추출)은 Python으로 되어있고, 이 사이트는
Cloudflare(Worker+D1+R2)로 배포되는 정적 사이트라 Python이 돌아가지 않는다. 이 로직을
**JavaScript로 포팅**해 Worker 안에서 돌린다. 키워드·정규식·임계값은 Phase 1 코드를 그대로
옮기고(재설계하지 않음), "애매하면 검토대기로 보낸다"는 원칙도 그대로 유지한다.

## 아키텍처

```
[관리자 페이지: quote-upload.html (신규)]
  → xlsx 파일 업로드 (POST /api/cost-upload)
[Cloudflare Worker: quote-worker/src/cost-ingest.js (신규 모듈)]
  1. xlsx 파싱 (SheetJS 라이브러리) — Phase 1의 xlsx_dump 대응
  2. 헤더 해석 + 라벨/데이터 불일치 보정 — Phase 1의 column_resolver 대응
  3. 견적성 시트 판별 — Phase 1의 quote_gate 대응
  4. 품목 분류 + 속성 추출(정규식) — Phase 1의 classifier 대응
  5. 줄 단위로 관측치 생성, 각 관측치에 confidence 판정:
     - 분류 실패, 또는 기존 대표단가 대비 가격이 큰 폭으로 벗어나면 → status='pending'
     - 그 외 → status='approved' 자동 반영 (Phase 1처럼 명확한 케이스는 자동)
  6. D1(cost_observations 테이블)에 저장, 원본 xlsx는 R2에 저장(감사 추적용 — Phase 1
     최종 리뷰에서 지적된 "원본 추적 불가" 공백을 여기서 메운다)
[D1: cost_observations, uploaded_quotes 테이블 (신규)]
[관리자 페이지: cost-review.html (신규) — 검토대기 목록, 승인/반려]
[Worker: GET /api/cost-data — 승인된 관측치만 집계(대표단가=최신)해 JSON으로 응답]
[led-quote-estimator.html 수정 — 정적 data/led-cost-data.js 대신 이 API를 fetch]
```

## "이상치" 판정 기준

새 관측치의 가격이, 같은 SKU(카테고리+속성)의 **기존 대표단가 대비 2배 이상 차이**나면 이상치로
간주해 검토대기로 보낸다(Phase 2에서 이미 쓴 "최대/최소 비율 2배" 기준과 동일 원칙 재사용).
해당 SKU에 대한 관측치가 아직 하나도 없으면(완전히 새로운 품목) 무조건 검토대기로 보낸다 — 비교
기준이 없어 이상치 판정 자체가 불가능하기 때문.

## 데이터 흐름 변경: 정적 파일 → 라이브 API

`led-quote-estimator.html`은 더 이상 `data/led-cost-data.js`를 정적으로 불러오지 않고, 페이지 로드 시
`GET /api/cost-data`를 호출해 실시간 집계 데이터를 받는다. 대표단가 계산(=최신 관측일 기준)과
SKU 키 구성 로직은 Phase 1 Python `aggregator.py`를 그대로 Worker의 JS로 포팅한다.

기존 `data/led-cost-data.js`와 `tools/convert_cost_data.py`(Phase 1→2용 일괄 변환 스크립트)는
삭제하지 않고 남겨둔다 — Phase 1 원본 269건 데이터를 D1의 초기 시드값으로 한 번 가져오는 데
재사용한다(과거 데이터를 다시 파싱할 필요 없이, 이미 계산된 대표단가를 D1에 넣는 1회성
마이그레이션 스크립트를 별도로 작성).

## 인증

기존 `quotes.html`과 동일하게 `X-Auth-Token` 헤더 기반 비밀번호 게이트(`ACCESS_PASSWORD` secret)를
그대로 재사용한다 — 새 비밀번호 체계를 만들지 않는다.

## 범위 밖

- COB 업체 데이터 자동 반영 (Phase 2와 동일하게 참고용 취급 유지, 이번에도 자동화하지 않음)
- 이상치 판정의 통계적 고도화(표준편차 등) — 2배 임계값 규칙으로 시작
- 여러 파일 동시 업로드(배치 업로드) — 1회 1파일부터 시작
- PDF 업로드(기존 `quotes.html`이 이미 담당) — 이번엔 xlsx만
