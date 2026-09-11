# ONLYONE-LED 작업 시 필수 규칙

## 시작 전 git pull 필수
- 이 저장소는 여러 PC/세션에서 작업된다. **작업 시작 전 반드시 `git pull`로 최신 상태를 받아온다.**
- 2026-09-09에 한 PC에서 오래된 로컬 상태로 커밋 후 "local 변경사항 유지"로 병합하면서, 다른 세션이 고친 admin.html 수정사항이 통째로 사라진 사고가 있었다. 같은 실수를 반복하지 않는다.
- 병합 충돌이 나면 무조건 "local 유지"로 밀어붙이지 말고, 각 파일의 diff를 직접 확인해서 어느 쪽 변경이 최신/의도된 것인지 판단한다.

## 절대 수정 금지 파일 (사용자 명시적 하드 제약)
- `led-layout-calc.html`
- `led-cost-calculator.html`
- `admin-tools/led-layout-engine.js`

기존 배치 계산기가 잘 작동 중이므로 절대 건드리지 않는다. 새 기능은 별도 파일/페이지로 만든다.

## 배포 구조
- `main` 브랜치 = Cloudflare Pages 프로덕션 배포 대상 (`only1led.com`). `main`에 push하면 자동 배포된다.
- `quote-worker/` (Cloudflare Worker, API)는 git push로 자동 배포되지 않는다 — `npx wrangler deploy`로 수동 배포해야 한다. `CLOUDFLARE_API_TOKEN`은 매번 새로 로드해야 한다 (`setx`는 이미 실행 중인 프로세스에 반영 안 됨).
