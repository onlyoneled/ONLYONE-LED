# SEO 최적화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온리원 LED 홈페이지(only1led.com)를 구글 검색 상위 노출을 위해 기술 SEO 코드 적용, robots.txt·sitemap.xml 생성, 구글 도구 등록 가이드 문서화까지 완료한다.

**Architecture:** index.html `<head>` 보강 (메타태그·canonical·GSC 인증) → JSON-LD 구조화 데이터 삽입 → robots.txt·sitemap.xml 생성 → 외부 도구 가이드 문서 작성 순으로 진행한다. 모든 코드 변경은 index.html 단일 파일과 루트 텍스트 파일 2개로 끝난다.

**Tech Stack:** 순수 HTML, Schema.org JSON-LD, Cloudflare Pages 배포

---

## 파일 맵

| 상태 | 경로 | 역할 |
|------|------|------|
| 수정 | `index.html` (1–18행) | `<head>` 메타태그 보강 |
| 수정 | `index.html` (1780행 직전) | JSON-LD 구조화 데이터 삽입 |
| 생성 | `robots.txt` | 크롤러 허용/차단 규칙 |
| 생성 | `sitemap.xml` | 구글 사이트맵 |
| 생성 | `docs/guides/google-search-console.md` | GSC 등록 단계별 가이드 |
| 생성 | `docs/guides/google-business-profile.md` | 비즈니스 프로필 등록 가이드 |

---

## Task 1: `<head>` 메타태그 보강

**Files:**
- Modify: `index.html:6-10`

- [ ] **Step 1: 현재 상태 확인**

```powershell
Select-String -Path index.html -Pattern "og:|canonical|twitter:|google-site" | Select-Object LineNumber, Line
```

Expected: og: 3줄만 나오고 canonical·twitter·google-site 없음

- [ ] **Step 2: `<title>` 및 기존 메타태그 교체**

`index.html` 6–10행을 아래로 교체한다:

```html
<meta name="description" content="LED 전광판·사이니지 전문 제작업체 온리원 LED. 실내외 대형 LED 전광판, 투명 LED, 플렉서블 LED 설계·제작·설치. 견적 문의 환영." />
<link rel="canonical" href="https://only1led.com/" />
<meta property="og:title" content="온리원 LED — LED 전광판·사이니지 제작 전문업체" />
<meta property="og:description" content="LED 전광판·사이니지 전문 제작업체 온리원 LED. 실내외 대형 LED 전광판, 투명 LED, 플렉서블 LED 설계·제작·설치. 견적 문의 환영." />
<meta property="og:image" content="https://only1led.com/images/slide2.png" />
<meta property="og:url" content="https://only1led.com/" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:site_name" content="온리원 LED" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="온리원 LED — LED 전광판·사이니지 제작 전문업체" />
<meta name="twitter:description" content="LED 전광판·사이니지 전문 제작업체. 실내외 대형 LED 전광판, 투명 LED, 플렉서블 LED 설계·제작·설치." />
<meta name="twitter:image" content="https://only1led.com/images/slide2.png" />
<meta name="google-site-verification" content="REPLACE_WITH_GSC_CODE" />
```

- [ ] **Step 3: `<title>` 태그 교체**

10행 `<title>` 태그를 아래로 교체:

```html
<title>온리원 LED — LED 전광판·사이니지 제작 전문업체</title>
```

- [ ] **Step 4: 변경 확인**

```powershell
Select-String -Path index.html -Pattern "og:|canonical|twitter:|google-site" | Select-Object LineNumber, Line
```

Expected: canonical 1줄, og: 7줄, twitter: 4줄, google-site 1줄

- [ ] **Step 5: 커밋**

```powershell
git add index.html
git commit -m "seo: enhance head meta tags — canonical, OG, Twitter Card, GSC placeholder"
```

---

## Task 2: JSON-LD 구조화 데이터 삽입

**Files:**
- Modify: `index.html` (`</script>` 직전, 1780행 부근)

- [ ] **Step 1: 삽입 위치 확인**

```powershell
Select-String -Path index.html -Pattern "ld\+json|LocalBusiness" | Select-Object LineNumber, Line
```

Expected: 결과 없음 (아직 JSON-LD 없음)

- [ ] **Step 2: `</script>` 바로 앞 줄 확인**

```powershell
(Get-Content index.html)[-5..-1]
```

Expected: `</script>` 과 `</body>` 가 마지막 두 줄

- [ ] **Step 3: `</body>` 직전에 JSON-LD 블록 삽입**

`index.html` 의 `</script>\n</body>` 부분을 아래로 교체한다:

```html
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "온리원 LED",
  "url": "https://only1led.com",
  "logo": "https://only1led.com/images/slide2.png",
  "image": "https://only1led.com/images/slide2.png",
  "description": "실내외 대형 LED 전광판·사이니지 설계·제작·설치 전문업체",
  "telephone": "010-7782-0021",
  "email": "only1@only1led.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "대곶북로 385",
    "addressLocality": "김포시",
    "addressRegion": "경기도",
    "addressCountry": "KR"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00",
      "closes": "18:00"
    }
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "010-7782-0021",
    "contactType": "customer service",
    "availableLanguage": "Korean"
  }
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "온리원 LED 서비스",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Service",
        "name": "실내 LED 전광판",
        "description": "P2~P4 피치 실내용 LED 디스플레이 설계·제작·설치",
        "provider": { "@type": "LocalBusiness", "name": "온리원 LED" }
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "Service",
        "name": "야외 LED 전광판",
        "description": "IP65 방수 등급 실외용 대형 LED 전광판 설계·제작·설치",
        "provider": { "@type": "LocalBusiness", "name": "온리원 LED" }
      }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@type": "Service",
        "name": "투명 LED 사이니지",
        "description": "유리면 부착형 투명 LED 디스플레이 설계·제작·설치",
        "provider": { "@type": "LocalBusiness", "name": "온리원 LED" }
      }
    },
    {
      "@type": "ListItem",
      "position": 4,
      "item": {
        "@type": "Service",
        "name": "플렉서블 LED",
        "description": "곡면·기둥 등 비정형 구조물용 플렉서블 LED 솔루션",
        "provider": { "@type": "LocalBusiness", "name": "온리원 LED" }
      }
    }
  ]
}
</script>
</body>
```

- [ ] **Step 4: 삽입 확인**

```powershell
Select-String -Path index.html -Pattern "ld\+json|LocalBusiness|ItemList" | Select-Object LineNumber, Line
```

Expected: `ld+json` 2줄, `LocalBusiness` 2줄, `ItemList` 1줄

- [ ] **Step 5: 커밋**

```powershell
git add index.html
git commit -m "seo: add LocalBusiness and Service JSON-LD structured data"
```

---

## Task 3: robots.txt 생성

**Files:**
- Create: `robots.txt`

- [ ] **Step 1: 파일 없음 확인**

```powershell
Test-Path robots.txt
```

Expected: `False`

- [ ] **Step 2: robots.txt 생성**

프로젝트 루트에 `robots.txt` 파일 생성:

```
User-agent: *
Allow: /

Disallow: /admin.html
Disallow: /onlyone_admin.html
Disallow: /quotes.html
Disallow: /led-cost-calculator.html
Disallow: /quote-worker/

Sitemap: https://only1led.com/sitemap.xml
```

- [ ] **Step 3: 확인**

```powershell
Get-Content robots.txt
```

Expected: 위 내용 그대로 출력

- [ ] **Step 4: 커밋**

```powershell
git add robots.txt
git commit -m "seo: add robots.txt with admin page disallow and sitemap reference"
```

---

## Task 4: sitemap.xml 생성

**Files:**
- Create: `sitemap.xml`

- [ ] **Step 1: 파일 없음 확인**

```powershell
Test-Path sitemap.xml
```

Expected: `False`

- [ ] **Step 2: sitemap.xml 생성**

프로젝트 루트에 `sitemap.xml` 파일 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://only1led.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://only1led.com/onlyone_quote.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

- [ ] **Step 3: 확인**

```powershell
Get-Content sitemap.xml
```

Expected: 위 XML 내용 그대로 출력

- [ ] **Step 4: 커밋**

```powershell
git add sitemap.xml
git commit -m "seo: add sitemap.xml for Google crawl submission"
```

---

## Task 5: Google Search Console 가이드 문서

**Files:**
- Create: `docs/guides/google-search-console.md`

- [ ] **Step 1: 디렉토리 생성**

```powershell
New-Item -ItemType Directory -Force docs/guides
```

- [ ] **Step 2: 가이드 문서 생성**

`docs/guides/google-search-console.md` 파일 생성:

```markdown
# Google Search Console 등록 가이드

## 준비물
- 구글 계정 (only1@only1led.com 권장)
- only1led.com 배포 완료 상태

## 단계별 등록

### 1단계: 속성 추가
1. https://search.google.com/search-console 접속
2. 로그인 후 "속성 추가" 클릭
3. "URL 접두사" 선택 → `https://only1led.com/` 입력 → 계속

### 2단계: 인증
1. 인증 방법 중 "HTML 태그" 선택
2. 발급된 `content` 값 복사 (예: `abc123xyz...`)
3. `index.html` 의 아래 태그를 찾아 값 교체:
   ```html
   <meta name="google-site-verification" content="REPLACE_WITH_GSC_CODE" />
   ```
   → `REPLACE_WITH_GSC_CODE` 자리에 복사한 값 붙여넣기
4. Cloudflare Pages에 배포
5. GSC로 돌아와 "확인" 클릭

### 3단계: 사이트맵 제출
1. 좌측 메뉴 "Sitemaps" 클릭
2. "새 사이트맵 추가" → `sitemap.xml` 입력 → 제출
3. 상태가 "성공" 으로 바뀌면 완료

### 4단계: 크롤링 요청
1. 좌측 "URL 검사" 클릭
2. `https://only1led.com/` 입력 → Enter
3. "색인 생성 요청" 클릭

## 결과 확인
- 등록 후 2–4주 뒤 "실적" 탭에서 아래 지표 확인:
  - **노출수:** 구글 검색에 사이트가 표시된 횟수
  - **클릭수:** 실제 방문자 수
  - **평균 게재순위:** 검색 결과 내 평균 순위

## 주의사항
- GSC 인증 메타태그가 없으면 확인 실패 → 배포 먼저
- 사이트맵 제출 후 즉시 색인되지 않음 (최대 2주 소요)
```

- [ ] **Step 3: 커밋**

```powershell
git add docs/guides/google-search-console.md
git commit -m "docs: add Google Search Console registration guide"
```

---

## Task 6: Google Business Profile 가이드 문서

**Files:**
- Create: `docs/guides/google-business-profile.md`

- [ ] **Step 1: 가이드 문서 생성**

`docs/guides/google-business-profile.md` 파일 생성:

```markdown
# Google Business Profile 등록 가이드

구글 지도·로컬 검색에 "온리원 LED" 비즈니스를 노출시키는 설정.

## 등록 정보

| 항목 | 값 |
|------|----|
| 상호명 | 온리원 LED |
| 카테고리 | 전자 장비 제조업체 (또는 사이니지 업체) |
| 주소 | 경기도 김포시 대곶북로 385 |
| 전화 | 010-7782-0021 |
| 웹사이트 | https://only1led.com |
| 영업시간 | 평일 09:00 – 18:00 |

## 단계별 등록

### 1단계: 비즈니스 추가
1. https://business.google.com 접속
2. 구글 계정 로그인
3. "비즈니스 추가" 또는 "지금 관리" 클릭
4. 상호명 **"온리원 LED"** 입력

### 2단계: 카테고리·주소 설정
1. 카테고리: **"전자 장비 제조업체"** 입력 후 선택
   - 없으면 "사이니지 업체" 또는 "광고 서비스" 선택
2. 주소: 경기도 김포시 대곶북로 385 입력
3. 전화번호: 010-7782-0021
4. 웹사이트: https://only1led.com

### 3단계: 인증
- 우편 인증: 구글이 엽서 발송 (1–2주 소요), 수령 후 코드 입력
- 전화 인증: 즉시 가능한 경우 전화로 코드 수신

### 4단계: 프로필 최적화 (인증 후)
1. **사진 업로드:** 시공 사례 이미지 10장 이상 추가
2. **서비스 추가:**
   - 실내 LED 전광판 제작
   - 야외 LED 전광판 설치
   - 투명 LED 사이니지
   - 플렉서블 LED 솔루션
   - LED 전광판 견적 상담
3. **설명 작성:**
   ```
   LED 전광판·사이니지 전문 제작업체 온리원 LED입니다.
   실내외 대형 LED 전광판, 투명 LED, 플렉서블 LED를
   설계부터 설치까지 원스톱으로 제공합니다.
   견적 문의는 전화 또는 웹사이트를 통해 가능합니다.
   ```

## 결과
- 구글 지도에 "온리원 LED" 마커 표시
- "김포 LED 전광판", "경기도 LED 전광판 업체" 검색 시 우측 패널 노출
- 리뷰 수집 가능 → 신뢰도 향상
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/guides/google-business-profile.md
git commit -m "docs: add Google Business Profile registration guide"
```

---

## 최종 검증

- [ ] **메타태그 확인**

```powershell
Select-String -Path index.html -Pattern "canonical|og:|twitter:|google-site|ld\+json" | Measure-Object | Select-Object Count
```

Expected: Count ≥ 15

- [ ] **파일 존재 확인**

```powershell
Test-Path robots.txt; Test-Path sitemap.xml; Test-Path "docs/guides/google-search-console.md"; Test-Path "docs/guides/google-business-profile.md"
```

Expected: 모두 `True`

- [ ] **커밋 히스토리 확인**

```powershell
git log --oneline -6
```

Expected: 이 플랜의 커밋 5개 + 이전 커밋들

---

## 배포 후 할 일 (코드 외)

1. Cloudflare Pages에 push → 배포 완료 대기
2. GSC 인증 코드 발급 받아 `index.html` 의 `REPLACE_WITH_GSC_CODE` 교체 후 재배포
3. GSC에서 사이트맵 제출
4. Google Business Profile 등록 (우편 인증 신청)
