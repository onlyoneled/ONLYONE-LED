# Google Search Console 등록 가이드

구글이 only1led.com을 인식하고, 검색 순위·클릭수를 모니터링할 수 있게 연동하는 절차.

## 준비물
- 구글 계정 (only1@only1led.com 권장)
- only1led.com 배포 완료 상태

---

## 단계별 등록

### 1단계: 속성 추가
1. https://search.google.com/search-console 접속
2. 로그인 후 "속성 추가" 클릭
3. **"URL 접두사"** 선택 → `https://only1led.com/` 입력 → 계속

### 2단계: 인증 코드 발급 및 적용
1. 인증 방법 목록에서 **"HTML 태그"** 선택
2. 아래와 같은 태그가 표시됨:
   ```html
   <meta name="google-site-verification" content="abc123xyz..." />
   ```
3. `content="..."` 안의 값만 복사 (예: `abc123xyz...`)
4. `index.html` 19행을 찾아 값 교체:
   ```html
   <!-- 현재 -->
   <meta name="google-site-verification" content="REPLACE_WITH_GSC_CODE" />

   <!-- 교체 후 -->
   <meta name="google-site-verification" content="abc123xyz..." />
   ```
5. 저장 → Cloudflare Pages 배포
6. 배포 완료 후 GSC로 돌아와 **"확인"** 클릭

### 3단계: 사이트맵 제출
1. 좌측 메뉴 **"Sitemaps"** 클릭
2. "새 사이트맵 추가" 입력란에 `sitemap.xml` 입력
3. **"제출"** 클릭
4. 상태가 **"성공"** 으로 바뀌면 완료

### 4단계: 크롤링 요청
1. 좌측 **"URL 검사"** 클릭
2. `https://only1led.com/` 입력 → Enter
3. **"색인 생성 요청"** 클릭

---

## 결과 확인 (2–4주 후)

좌측 메뉴 **"실적"** 탭에서 확인:

| 지표 | 의미 |
|------|------|
| 노출수 | 구글 검색에 사이트가 표시된 횟수 |
| 클릭수 | 검색 결과에서 실제 방문한 횟수 |
| 평균 게재순위 | 검색 결과 내 평균 순위 (낮을수록 상위) |
| CTR | 노출 대비 클릭 비율 |

---

## 주의사항
- GSC 인증 메타태그가 배포되지 않으면 확인 실패 → **배포 먼저**
- 사이트맵 제출 후 즉시 색인되지 않음 (최대 2주 소요)
- 색인 완료 여부는 구글 검색에서 `site:only1led.com` 으로 확인 가능
