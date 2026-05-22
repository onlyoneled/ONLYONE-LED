# 견적서 시스템 셋업 가이드

GCP, Service Account 키 없이 동작합니다.
PDF를 어드민 페이지에서 직접 업로드하면 Claude가 분석해서 DB에 저장합니다.

---

## STEP 1 — Wrangler CLI 설치 및 로그인

```powershell
npm install -g wrangler
wrangler login
```

브라우저가 열리면 Cloudflare 계정으로 로그인.

---

## STEP 2 — D1 데이터베이스 생성

```powershell
cd quote-worker
npm install
npx wrangler d1 create onlyone-quotes
```

출력 결과에서 `database_id` 값 복사 →
`wrangler.toml` 파일의 `REPLACE_AFTER_CREATION` 자리에 붙여넣기.

---

## STEP 3 — 스키마 적용

```powershell
npx wrangler d1 execute onlyone-quotes --file ./schema.sql
```

---

## STEP 4 — Secrets 등록

```powershell
# 견적서 열람 비밀번호 (본인이 정하는 것)
npx wrangler secret put ACCESS_PASSWORD

# Claude API 키 (https://console.anthropic.com 에서 발급)
npx wrangler secret put CLAUDE_API_KEY
```

각 명령 실행 후 값을 입력하고 Enter.

---

## STEP 5 — Worker 배포

```powershell
npx wrangler deploy
```

배포 완료 후 Worker URL 확인:
`https://onlyone-quote-worker.YOUR_SUBDOMAIN.workers.dev`

---

## STEP 6 — 어드민 페이지 연결

`quotes.html` 상단의 `API_BASE`를 실제 Worker URL로 변경:

```js
const API_BASE = 'https://onlyone-quote-worker.YOUR_SUBDOMAIN.workers.dev';
```

저장 후 GitHub push → Cloudflare Pages 자동 배포.

---

## 사용 방법

1. `admin.only1led.com/quotes.html` 접속
2. ACCESS_PASSWORD 입력
3. 우측 상단 **"+ PDF 업로드"** 버튼 클릭
4. 업체명 입력 + PDF 파일 선택 (여러 개 가능)
5. **업로드 시작** → Claude 분석 후 목록에 표시

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 401 Unauthorized | ACCESS_PASSWORD 불일치 | `wrangler secret put ACCESS_PASSWORD` 재설정 |
| Claude 분석 실패 | Claude API 키 오류 | `wrangler secret put CLAUDE_API_KEY` 재설정 |
| 텍스트 추출 안 됨 | 스캔본 PDF (이미지 PDF) | 텍스트 레이어 있는 PDF로 변환 필요 |
| 파일 너무 큼 | Worker 요청 크기 제한 | PDF 100MB 이하 사용 (일반 견적서는 무관) |
