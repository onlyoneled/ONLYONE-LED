---
name: seo-optimization
description: 온리원 LED 홈페이지 구글 검색 최적화 — 기술 SEO + 구글 도구 연동 + 키워드 전략 전체 패키지
metadata:
  type: project
---

# 온리원 LED SEO 최적화 설계

## 목표

국내 B2B 고객 (기업·매장 담당자)이 LED 전광판 관련 키워드로 구글 검색 시 `only1led.com`이 상위에 노출되도록 한다.

## 비즈니스 정보

| 항목 | 값 |
|------|----|
| 상호 | 온리원 LED |
| URL | https://only1led.com |
| 전화 | 010-7782-0021 |
| 이메일 | only1@only1led.com |
| 주소 | 경기도 김포시 대곶북로 385 |
| 영업시간 | 평일 09:00 – 18:00 |

---

## 섹션 1: 기술 SEO (코드 작업)

### 1-1. `<head>` 메타태그 보강

**추가할 태그:**

```html
<!-- Canonical -->
<link rel="canonical" href="https://only1led.com/" />

<!-- OG 보완 -->
<meta property="og:url" content="https://only1led.com/" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:site_name" content="온리원 LED" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="온리원 LED — LED 전광판 전문" />
<meta name="twitter:description" content="실내외 대형 LED 전광판·사이니지 설계부터 설치까지. 주문제작 전문업체." />
<meta name="twitter:image" content="https://only1led.com/images/slide2.png" />

<!-- Google Search Console 인증 (값은 GSC 등록 후 채워넣기) -->
<meta name="google-site-verification" content="REPLACE_WITH_GSC_CODE" />
```

**기존 meta description 업그레이드:**
```html
<!-- 현재 -->
<meta name="description" content="온리원 LED — 주문제작 LED 사이니지, 실내외 대형 LED 전광판 설계부터 설치까지." />

<!-- 변경 후 (키워드 강화, 160자 이내) -->
<meta name="description" content="LED 전광판·사이니지 전문 제작업체 온리원 LED. 실내외 대형 LED 전광판, 투명 LED, 플렉서블 LED 설계·제작·설치. 견적 문의 환영." />
```

### 1-2. JSON-LD 구조화 데이터

`</body>` 직전에 `<script type="application/ld+json">` 블록 2개를 삽입한다.

**① LocalBusiness 스키마**

```json
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
```

**② Service 스키마 (서비스 목록)**

```json
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
```

### 1-3. robots.txt

루트에 `robots.txt` 파일 생성:

```
User-agent: *
Allow: /

Sitemap: https://only1led.com/sitemap.xml
```

어드민·내부 페이지는 크롤링 차단:

```
Disallow: /admin.html
Disallow: /onlyone_admin.html
Disallow: /quotes.html
Disallow: /led-cost-calculator.html
```

### 1-4. sitemap.xml

루트에 `sitemap.xml` 파일 생성. 공개 페이지만 포함:

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

---

## 섹션 2: 구글 도구 연동 가이드

### 2-1. Google Search Console 등록

1. [search.google.com/search-console](https://search.google.com/search-console) 접속
2. "속성 추가" → URL 접두사 방식 → `https://only1led.com/` 입력
3. "HTML 태그" 인증 방법 선택 → 발급된 `content` 값을 `index.html`의 GSC 인증 메타태그에 붙여넣기
4. Cloudflare Pages에 배포 후 "확인" 클릭
5. 좌측 메뉴 "Sitemaps" → `sitemap.xml` URL 제출
6. "URL 검사" → `https://only1led.com/` 크롤링 요청

**확인 지표:** 2~4주 후 "실적" 탭에서 클릭수·노출수·평균 순위 확인 가능

### 2-2. Google Business Profile 등록

1. [business.google.com](https://business.google.com) 접속 (구글 계정 로그인)
2. "비즈니스 추가" → 상호명 "온리원 LED" 입력
3. 카테고리: **"전자 장비 제조업체"** 또는 **"사이니지 업체"** 선택
4. 주소: 경기도 김포시 대곶북로 385 입력
5. 전화번호: 010-7782-0021 / 웹사이트: https://only1led.com 입력
6. 우편 인증 또는 전화 인증 완료
7. 등록 후 추가 최적화:
   - 업체 사진 10장 이상 업로드 (시공 사례 이미지 활용)
   - 영업시간 평일 09:00–18:00 설정
   - 서비스 목록에 "LED 전광판 제작", "LED 사이니지 설치" 등 추가

---

## 섹션 3: 키워드 전략

### 3-1. 타겟 키워드 20선

| 유형 | 키워드 | 검색 의도 |
|------|--------|-----------|
| 제품 유형 | LED 전광판 | 정보 탐색 |
| 제품 유형 | 실내 LED 전광판 | 정보 탐색 |
| 제품 유형 | 야외 LED 전광판 | 정보 탐색 |
| 제품 유형 | LED 사이니지 | 정보 탐색 |
| 제품 유형 | 투명 LED 디스플레이 | 정보 탐색 |
| 제품 유형 | 플렉서블 LED | 정보 탐색 |
| 제품 유형 | P2.5 LED 전광판 | 사양 탐색 |
| 제품 유형 | 대형 LED 전광판 | 정보 탐색 |
| 구매 의도 | LED 전광판 가격 | 전환 높음 |
| 구매 의도 | LED 전광판 제작 | 전환 높음 |
| 구매 의도 | LED 전광판 설치 | 전환 높음 |
| 구매 의도 | LED 전광판 업체 | 전환 높음 |
| 구매 의도 | 실내 LED 사이니지 제작 | 전환 높음 |
| 구매 의도 | LED 광고판 제작업체 | 전환 높음 |
| 구매 의도 | 상업용 LED 디스플레이 | 전환 높음 |
| 구매 의도 | LED 전광판 견적 | 전환 매우 높음 |
| 구매 의도 | LED 사이니지 업체 추천 | 전환 높음 |
| 지역 | 김포 LED 전광판 | 지역 전환 |
| 지역 | 경기도 LED 전광판 업체 | 지역 전환 |
| 지역 | 김포 사이니지 제작 | 지역 전환 |

### 3-2. 키워드 적용 위치

| 키워드 | 적용 위치 |
|--------|-----------|
| LED 전광판 제작업체, LED 사이니지 | `<meta description>` |
| 실내 LED 전광판, 야외 LED 전광판 | JSON-LD Service name·description |
| LED 전광판 가격·견적 | CTA 섹션 텍스트, 문의 폼 주변 |
| 김포 LED 전광판 | JSON-LD address + LocalBusiness description |
| P2.5, P4 등 사양 키워드 | 서비스 스펙 시트 텍스트 |

### 3-3. 콘텐츠 최적화 방향

- **hero 섹션 태그라인:** "LED 전광판 제작·설치 전문" 문구 포함 (현재는 브랜드명만)
- **각 서비스 `h3` 텍스트:** 키워드 포함 형태로 작성 (예: "실내 LED 전광판" → 그대로 유지)
- **이미지 `alt` 텍스트:** 시공사례 카드 이미지에 "LED 전광판 시공사례 — [장소명]" 형태로 추가
- **`<title>` 태그 보완:** "온리원 LED — LED 전광판·사이니지 제작 전문업체" (현재보다 키워드 강화)

---

## 구현 순서

1. `index.html` — `<head>` 메타태그 보강 + title 수정
2. `index.html` — JSON-LD 구조화 데이터 2개 삽입
3. `robots.txt` 생성
4. `sitemap.xml` 생성
5. 배포 후 GSC 인증 메타태그 코드 채워넣기 (별도 단계)
6. 문서: GSC 등록 가이드
7. 문서: Google Business Profile 등록 가이드

## 범위 외

- 백링크 구축 (외부 사이트 링크 유치) — 장기 과제
- 블로그/콘텐츠 마케팅 — 추후 논의
- 유료 광고 (Google Ads) — 범위 외
