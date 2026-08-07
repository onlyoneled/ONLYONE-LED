# GEO Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 25-item FAQ accordion section + FAQPage/HowTo/Speakable JSON-LD schemas + updated service descriptions to make only1led.com cited by AI search engines (Gemini, ChatGPT, Claude).

**Architecture:** All changes are in a single `index.html` file — static HTML site on Cloudflare Pages. FAQ content is in static HTML (not JS-generated) so AI crawlers can read it without executing JavaScript. Accordion behavior is wired by inline `<script>` at end of body. Three new JSON-LD blocks are appended before `</body>`, and the existing ItemList block is updated in place.

**Tech Stack:** Vanilla HTML/CSS/JS, Schema.org JSON-LD, Cloudflare Pages (GitHub auto-deploy)

---

## File Map

| File | Lines affected | What changes |
|------|---------------|--------------|
| `index.html` | ~456 (CSS) | Add `.faq-section` CSS block |
| `index.html` | ~928 (HTML) | Insert `<section id="faq">` with 25 static FAQ items |
| `index.html` | ~1826 (JS) | Add FAQ accordion event listeners before `</script>` |
| `index.html` | ~1863–1911 (JSON-LD) | Update ItemList service descriptions |
| `index.html` | ~1911 (JSON-LD) | Append FAQPage, HowTo, Speakable schemas |

---

## Task 1: FAQ Section CSS

**Files:**
- Modify: `index.html` (CSS section, after `.svc-spec` block, before `/* CONTACT CTA BANNER */` comment, around line 456)

- [ ] **Step 1: Find the CSS insertion point**

  Search for the comment `CONTACT CTA BANNER` in `index.html`. The FAQ CSS goes immediately before that block. The exact text to find:

  ```css
  /* ══════════════════════════════════════════════
     CONTACT CTA BANNER
  ══════════════════════════════════════════════ */
  ```

- [ ] **Step 2: Insert FAQ CSS before that comment**

  Insert this block immediately before `/* CONTACT CTA BANNER */`:

  ```css
  /* ══════════════════════════════════════════════
     FAQ SECTION
  ══════════════════════════════════════════════ */
  .faq-section{
    padding:80px var(--pad) 100px;border-top:1px solid var(--line);
  }
  .faq-list{border-bottom:1px solid var(--line);}
  .faq-row{border-top:1px solid var(--line);}
  .faq-trigger{
    display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;
    padding:20px 0;width:100%;background:none;border:none;
    color:var(--ink);text-align:left;cursor:pointer;transition:color .2s;
  }
  .faq-trigger:hover{color:var(--accent);}
  .faq-q{
    font-size:16px;font-weight:700;letter-spacing:-.01em;margin:0;line-height:1.4;
    font-family:var(--font-kr);
  }
  body[data-lang="en"] .faq-q{font-family:var(--font-en);}
  body[data-lang="jp"] .faq-q{font-family:var(--font-jp);}
  .faq-ico{
    width:30px;height:30px;display:grid;place-items:center;border-radius:50%;
    border:1px solid var(--line-strong);flex-shrink:0;transition:all .25s;
  }
  .faq-row[aria-expanded="true"] .faq-ico{
    background:var(--accent);border-color:var(--accent);color:#000;transform:rotate(45deg);
  }
  .faq-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s ease;}
  .faq-row[aria-expanded="true"] .faq-body{grid-template-rows:1fr;}
  .faq-body>div{overflow:hidden;}
  .faq-body-inner{padding:0 0 24px 0;}
  .faq-body-inner p{
    margin:0;font-size:15px;line-height:1.68;color:var(--mute);max-width:720px;
  }
  @media(max-width:600px){
    .faq-section{padding:56px var(--pad) 72px;}
    .faq-q{font-size:14px;}
  }

  ```

- [ ] **Step 3: Verify**

  Open `index.html` in a browser (or use VS Code preview). Confirm no CSS parse errors. The FAQ section will be invisible until Task 2 adds the HTML.

---

## Task 2: FAQ Section HTML (25 static items)

**Files:**
- Modify: `index.html` (HTML body, between `</section>` end of `#about` ~line 928 and `<!-- CONTACT FORM -->` comment ~line 930)

- [ ] **Step 1: Find the insertion point**

  Find this exact text in `index.html`:

  ```html
  </section>

  <!-- ═══════════════════════════════════════
       CONTACT FORM  (Netlify Forms)
  ═══════════════════════════════════════ -->
  ```

  The `</section>` here is the closing tag of `#about`. The FAQ section goes between these two.

- [ ] **Step 2: Insert the FAQ section HTML**

  Replace the gap (insert before `<!-- CONTACT FORM -->`) with:

  ```html
  <!-- ═══════════════════════════════════════
       FAQ
  ═══════════════════════════════════════ -->
  <section id="faq" class="faq-section">
    <div class="section-head">
      <h2>자주 묻는 질문</h2>
    </div>
    <div class="faq-list" id="faqList">

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">학교 강당 프로젝터를 LED로 교체하면 어떤 점이 좋아지나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>LED는 프로젝터 대비 밝기가 5~10배 높아 조명을 켜도 선명하게 보입니다. 램프 교체나 스크린 관리가 필요 없고, 수명이 10만 시간 이상이라 유지비가 크게 줄어듭니다. 해상도도 높아 멀리서도 글자가 선명히 보입니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">교회 예배당에 LED 전광판을 설치할 때 어떤 제품이 적합한가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>예배당 실내 환경에는 P1.86 부터 P2.5 피치 LED 까지 현장 환경에 맞춰 설계됩니다. 시청 거리가 3~8m일 때는 P1.86, 8m 이상이면 P2로도 충분합니다. 벽 매립형으로 시공하면 강대상 배경으로 자연스럽게 연출할 수 있습니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">프로젝터 스크린 크기 그대로 LED로 교체가 가능한가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>가능합니다. LED는 모듈 단위로 조합하기 때문에 기존 스크린 크기에 맞춰 정확하게 제작할 수 있습니다. 현장 실측 후 맞춤 제작합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">교회나 학교에서 LED 전광판을 사용하면 유지 관리가 어렵지 않나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>LED 전광판은 전용 소프트웨어로 영상·이미지·문자를 PC나 모바일에서 간편하게 제어할 수 있습니다. 별도 기술 인력 없이도 담당자 교육 후 운영이 가능합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">모니터 비디오월을 LED로 교체하면 어떤 장점이 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>모니터 비디오월은 베젤(프레임) 사이 검은 선이 화면을 나누지만, LED는 이음새 없이 하나의 화면처럼 보입니다. 밝기도 3~5배 높고, 대형 화면일수록 단가 차이도 줄어듭니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">기존 모니터 비디오월 설치 자리에 LED로 바로 교체 시공이 되나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>네, 가능합니다. 기존 구조물을 활용하거나 새로 설계해 시공합니다. 현장 실측 후 최적 방법을 제안드립니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">상업 공간 인테리어에서 LED 전광판이 주로 어떻게 활용되나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>브랜드 영상·홍보 콘텐츠 상시 재생, 제품 이미지 전시, 공간 분위기 연출 등에 활용됩니다. 패션 매장, 쇼룸, 은행 로비, 호텔 프런트 등에 많이 적용됩니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">인테리어를 해치지 않고 벽에 LED를 매립할 수 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>가능합니다. LED 모듈은 슬림하게 제작되어 벽 속에 매립하거나 프레임 없이 벽면과 일체형으로 시공할 수 있습니다. 인테리어 설계 단계에서 협의하면 마감이 더욱 깔끔합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">인테리어 시공 업체와 협업해서 LED를 설치할 수 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>네, 인테리어 회사와 협업 시공이 가능합니다. 설계 도면 공유부터 현장 조율까지 함께 진행합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">매립형 LED와 일반 거치형 LED의 차이가 무엇인가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>매립형은 벽 안쪽에 설치해 전면만 노출되어 공간이 깔끔하고, 거치형은 벽에 브라켓으로 돌출 설치됩니다. 인테리어 감각이 중요한 공간에는 매립형을 추천합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">곡면이나 기둥 형태의 LED 제작도 가능한가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>가능합니다. 플렉서블 LED 모듈을 사용하면 기둥, 아치, 원형 등 비정형 구조물에도 적용할 수 있습니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">투명 LED 사이니지는 어떤 곳에 사용하나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>유리창이나 파티션에 내부에 부착해 외부에서는 유리처럼 보이고, 안에서는 영상이 표시됩니다. 쇼룸, 호텔 로비, 상업 건물 외벽 유리면에 주로 사용합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">특수한 형태의 LED 전광판은 주문 제작이 가능한가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>네, 어떤 형태든 맞춤 제작이 가능합니다. 규격 외 사이즈, 비정형 형태, 특수 마감 등 요청 사항을 상담 후 설계합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">매장 외부에 LED 광고판을 설치하면 얼마나 효과가 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>LED 광고판은 유동인구 대상 노출 효과가 배너·현수막 대비 월등히 높습니다. 야간에도 밝게 보이고, 콘텐츠를 수시로 교체할 수 있어 행사·시즌 프로모션에 즉각 대응이 가능합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">실외 LED 전광판은 비나 햇빛에 괜찮은가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>야외용 LED는 IP65 방수 등급으로 제작되어 비, 눈, 직사광선에 강합니다. 고휘도(4,000~6,000nit)라 한낮에도 선명하게 보입니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">헬스장이나 실내 체육관에 LED 전광판을 설치하면 어떻게 활용하나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>운동 타이머, 프로그램 안내, 광고 영상 재생, 경기 결과 표시 등에 활용됩니다. 실내 밝기에 맞는 P1.86~P2 피치를 주로 사용합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">음식점이나 카페에서 LED를 디지털 메뉴보드로 사용할 수 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>가능합니다. 메뉴·가격·이벤트 정보를 실시간으로 업데이트할 수 있고, 식욕을 자극하는 음식 영상을 재생해 매출 향상에 도움이 됩니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">호텔 로비나 리조트에 어떤 LED 제품이 어울리나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>호텔 로비는 고해상도 P1.53~P1.86 피치의 슬림 타입이나 투명 LED가 적합합니다. 브랜드 분위기에 맞는 콘텐츠를 상시 재생해 프리미엄 이미지를 연출합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">쇼핑몰이나 복합문화공간에 대형 LED 설치 사례가 있나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>네, 쇼핑몰 중앙 홀, 에스컬레이터 옆 벽면, 입구 외벽 등에 대형 LED 설치 경험이 있습니다. 시공 사례는 홈페이지 포트폴리오에서 확인하실 수 있습니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">LED 전광판 설치 비용이 얼마나 드나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>크기, 피치, 설치 환경에 따라 크게 달라집니다. 실내 소형(2㎡ 이하)부터 대형 건물 외벽까지 범위가 넓어 정확한 견적은 현장 상담 후 안내드립니다. 전화(010-7782-0021) 또는 홈페이지 문의 폼으로 연락주시면 빠르게 안내해드립니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">견적 상담은 무료인가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>네, 견적 상담은 무료입니다. 현장 실측 방문도 무료로 진행합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">주문부터 설치 완료까지 얼마나 걸리나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>일반적으로 상담·견적(1~3일) → 계약·설계(3~5일) → 제작(3~4주) → 설치(1~3일) 순서로 진행됩니다. 규모와 커스텀 요소에 따라 달라질 수 있습니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">설치 전 현장 방문이 필요한가요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>대부분의 경우 현장 실측 방문이 필요합니다. 정확한 사이즈 측정, 전기 용량 확인, 시공 환경 파악을 통해 최적의 제품을 설계합니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">설치 후 고장이 나면 어떻게 하나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>설치 후 A/S를 직접 담당합니다. 일반적으로 1년 무상 A/S를 제공하며, 이후에도 유지보수 서비스를 받으실 수 있습니다. LED 모듈 단위 교체가 가능해 전체 교체 없이 부분 수리가 됩니다.</p></div></div></div>
      </div>

      <div class="faq-row" aria-expanded="false">
        <button class="faq-trigger" type="button">
          <span class="faq-q">온리원 LED는 어디서 시공하나요?</span>
          <span class="faq-ico"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 0v11M0 5.5h11" stroke="currentColor" stroke-width="1.5"/></svg></span>
        </button>
        <div class="faq-body"><div><div class="faq-body-inner"><p>경기도 김포시에 위치하며 서울 및 전국 시공이 가능합니다. 전화(010-7782-0021) 또는 이메일(only1@only1led.com)로 문의 주시면 상담해드립니다.</p></div></div></div>
      </div>

    </div>
  </section>

  ```

- [ ] **Step 3: Verify section structure**

  Open `index.html` in browser. Scroll to the FAQ section. It should appear between the About section and the Contact form. All 25 questions should be visible as collapsed rows (headers only), each with a `+` icon on the right. Clicking has no effect yet (JS added in Task 3).

---

## Task 3: FAQ Accordion JavaScript

**Files:**
- Modify: `index.html` (JS section, just before the closing `</script>` of the main inline script block, around line 1826)

- [ ] **Step 1: Find the insertion point**

  Find this exact text in `index.html` (it's the very end of the main inline `<script>` block):

  ```javascript
  })();

  </script>
  ```

  The pattern to find is the closing of the iframe auto-resize IIFE, followed by `</script>`.

- [ ] **Step 2: Insert FAQ accordion JS before `</script>`**

  Add the following just before the closing `</script>` tag:

  ```javascript

  /* ── FAQ accordion ────────────────────── */
  document.querySelectorAll('#faqList .faq-row').forEach(row => {
    row.querySelector('.faq-trigger').addEventListener('click', () => {
      const open = row.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('#faqList .faq-row').forEach(r => r.setAttribute('aria-expanded', 'false'));
      row.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
  ```

- [ ] **Step 3: Verify accordion behavior**

  Open `index.html` in a browser. Click any FAQ question. The answer should expand smoothly (CSS grid-template-rows transition). The `+` icon should rotate 45° and turn orange. Clicking again or clicking another question should collapse it.

- [ ] **Step 4: Commit**

  ```bash
  git add index.html
  git commit -m "feat: add FAQ section (25 Q&As, accordion UI) for GEO"
  ```

---

## Task 4: FAQPage JSON-LD

**Files:**
- Modify: `index.html` (just before `</body>`, after the existing ItemList JSON-LD block ending at `</script>`, around line 1911)

- [ ] **Step 1: Find insertion point**

  Find the end of the existing ItemList JSON-LD block:

  ```html
  </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Insert FAQPage JSON-LD before `</body>`**

  Replace `</body>` with the following (then `</body>` comes after):

  ```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "학교 강당 프로젝터를 LED로 교체하면 어떤 점이 좋아지나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "LED는 프로젝터 대비 밝기가 5~10배 높아 조명을 켜도 선명하게 보입니다. 램프 교체나 스크린 관리가 필요 없고, 수명이 10만 시간 이상이라 유지비가 크게 줄어듭니다. 해상도도 높아 멀리서도 글자가 선명히 보입니다."
        }
      },
      {
        "@type": "Question",
        "name": "교회 예배당에 LED 전광판을 설치할 때 어떤 제품이 적합한가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "예배당 실내 환경에는 P1.86 부터 P2.5 피치 LED 까지 현장 환경에 맞춰 설계됩니다. 시청 거리가 3~8m일 때는 P1.86, 8m 이상이면 P2로도 충분합니다. 벽 매립형으로 시공하면 강대상 배경으로 자연스럽게 연출할 수 있습니다."
        }
      },
      {
        "@type": "Question",
        "name": "프로젝터 스크린 크기 그대로 LED로 교체가 가능한가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "가능합니다. LED는 모듈 단위로 조합하기 때문에 기존 스크린 크기에 맞춰 정확하게 제작할 수 있습니다. 현장 실측 후 맞춤 제작합니다."
        }
      },
      {
        "@type": "Question",
        "name": "교회나 학교에서 LED 전광판을 사용하면 유지 관리가 어렵지 않나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "LED 전광판은 전용 소프트웨어로 영상·이미지·문자를 PC나 모바일에서 간편하게 제어할 수 있습니다. 별도 기술 인력 없이도 담당자 교육 후 운영이 가능합니다."
        }
      },
      {
        "@type": "Question",
        "name": "모니터 비디오월을 LED로 교체하면 어떤 장점이 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "모니터 비디오월은 베젤(프레임) 사이 검은 선이 화면을 나누지만, LED는 이음새 없이 하나의 화면처럼 보입니다. 밝기도 3~5배 높고, 대형 화면일수록 단가 차이도 줄어듭니다."
        }
      },
      {
        "@type": "Question",
        "name": "기존 모니터 비디오월 설치 자리에 LED로 바로 교체 시공이 되나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "네, 가능합니다. 기존 구조물을 활용하거나 새로 설계해 시공합니다. 현장 실측 후 최적 방법을 제안드립니다."
        }
      },
      {
        "@type": "Question",
        "name": "상업 공간 인테리어에서 LED 전광판이 주로 어떻게 활용되나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "브랜드 영상·홍보 콘텐츠 상시 재생, 제품 이미지 전시, 공간 분위기 연출 등에 활용됩니다. 패션 매장, 쇼룸, 은행 로비, 호텔 프런트 등에 많이 적용됩니다."
        }
      },
      {
        "@type": "Question",
        "name": "인테리어를 해치지 않고 벽에 LED를 매립할 수 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "가능합니다. LED 모듈은 슬림하게 제작되어 벽 속에 매립하거나 프레임 없이 벽면과 일체형으로 시공할 수 있습니다. 인테리어 설계 단계에서 협의하면 마감이 더욱 깔끔합니다."
        }
      },
      {
        "@type": "Question",
        "name": "인테리어 시공 업체와 협업해서 LED를 설치할 수 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "네, 인테리어 회사와 협업 시공이 가능합니다. 설계 도면 공유부터 현장 조율까지 함께 진행합니다."
        }
      },
      {
        "@type": "Question",
        "name": "매립형 LED와 일반 거치형 LED의 차이가 무엇인가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "매립형은 벽 안쪽에 설치해 전면만 노출되어 공간이 깔끔하고, 거치형은 벽에 브라켓으로 돌출 설치됩니다. 인테리어 감각이 중요한 공간에는 매립형을 추천합니다."
        }
      },
      {
        "@type": "Question",
        "name": "곡면이나 기둥 형태의 LED 제작도 가능한가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "가능합니다. 플렉서블 LED 모듈을 사용하면 기둥, 아치, 원형 등 비정형 구조물에도 적용할 수 있습니다."
        }
      },
      {
        "@type": "Question",
        "name": "투명 LED 사이니지는 어떤 곳에 사용하나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "유리창이나 파티션에 내부에 부착해 외부에서는 유리처럼 보이고, 안에서는 영상이 표시됩니다. 쇼룸, 호텔 로비, 상업 건물 외벽 유리면에 주로 사용합니다."
        }
      },
      {
        "@type": "Question",
        "name": "특수한 형태의 LED 전광판은 주문 제작이 가능한가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "네, 어떤 형태든 맞춤 제작이 가능합니다. 규격 외 사이즈, 비정형 형태, 특수 마감 등 요청 사항을 상담 후 설계합니다."
        }
      },
      {
        "@type": "Question",
        "name": "매장 외부에 LED 광고판을 설치하면 얼마나 효과가 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "LED 광고판은 유동인구 대상 노출 효과가 배너·현수막 대비 월등히 높습니다. 야간에도 밝게 보이고, 콘텐츠를 수시로 교체할 수 있어 행사·시즌 프로모션에 즉각 대응이 가능합니다."
        }
      },
      {
        "@type": "Question",
        "name": "실외 LED 전광판은 비나 햇빛에 괜찮은가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "야외용 LED는 IP65 방수 등급으로 제작되어 비, 눈, 직사광선에 강합니다. 고휘도(4,000~6,000nit)라 한낮에도 선명하게 보입니다."
        }
      },
      {
        "@type": "Question",
        "name": "헬스장이나 실내 체육관에 LED 전광판을 설치하면 어떻게 활용하나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "운동 타이머, 프로그램 안내, 광고 영상 재생, 경기 결과 표시 등에 활용됩니다. 실내 밝기에 맞는 P1.86~P2 피치를 주로 사용합니다."
        }
      },
      {
        "@type": "Question",
        "name": "음식점이나 카페에서 LED를 디지털 메뉴보드로 사용할 수 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "가능합니다. 메뉴·가격·이벤트 정보를 실시간으로 업데이트할 수 있고, 식욕을 자극하는 음식 영상을 재생해 매출 향상에 도움이 됩니다."
        }
      },
      {
        "@type": "Question",
        "name": "호텔 로비나 리조트에 어떤 LED 제품이 어울리나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "호텔 로비는 고해상도 P1.53~P1.86 피치의 슬림 타입이나 투명 LED가 적합합니다. 브랜드 분위기에 맞는 콘텐츠를 상시 재생해 프리미엄 이미지를 연출합니다."
        }
      },
      {
        "@type": "Question",
        "name": "쇼핑몰이나 복합문화공간에 대형 LED 설치 사례가 있나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "네, 쇼핑몰 중앙 홀, 에스컬레이터 옆 벽면, 입구 외벽 등에 대형 LED 설치 경험이 있습니다. 시공 사례는 홈페이지 포트폴리오에서 확인하실 수 있습니다."
        }
      },
      {
        "@type": "Question",
        "name": "LED 전광판 설치 비용이 얼마나 드나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "크기, 피치, 설치 환경에 따라 크게 달라집니다. 실내 소형(2㎡ 이하)부터 대형 건물 외벽까지 범위가 넓어 정확한 견적은 현장 상담 후 안내드립니다. 전화(010-7782-0021) 또는 홈페이지 문의 폼으로 연락주시면 빠르게 안내해드립니다."
        }
      },
      {
        "@type": "Question",
        "name": "견적 상담은 무료인가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "네, 견적 상담은 무료입니다. 현장 실측 방문도 무료로 진행합니다."
        }
      },
      {
        "@type": "Question",
        "name": "주문부터 설치 완료까지 얼마나 걸리나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "일반적으로 상담·견적(1~3일) → 계약·설계(3~5일) → 제작(3~4주) → 설치(1~3일) 순서로 진행됩니다. 규모와 커스텀 요소에 따라 달라질 수 있습니다."
        }
      },
      {
        "@type": "Question",
        "name": "설치 전 현장 방문이 필요한가요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "대부분의 경우 현장 실측 방문이 필요합니다. 정확한 사이즈 측정, 전기 용량 확인, 시공 환경 파악을 통해 최적의 제품을 설계합니다."
        }
      },
      {
        "@type": "Question",
        "name": "설치 후 고장이 나면 어떻게 하나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "설치 후 A/S를 직접 담당합니다. 일반적으로 1년 무상 A/S를 제공하며, 이후에도 유지보수 서비스를 받으실 수 있습니다. LED 모듈 단위 교체가 가능해 전체 교체 없이 부분 수리가 됩니다."
        }
      },
      {
        "@type": "Question",
        "name": "온리원 LED는 어디서 시공하나요?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "경기도 김포시에 위치하며 서울 및 전국 시공이 가능합니다. 전화(010-7782-0021) 또는 이메일(only1@only1led.com)로 문의 주시면 상담해드립니다."
        }
      }
    ]
  }
  </script>

  ```

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "feat: add FAQPage JSON-LD schema (25 Q&As)"
  ```

---

## Task 5: HowTo JSON-LD

**Files:**
- Modify: `index.html` (append after FAQPage JSON-LD, before `</body>`)

- [ ] **Step 1: Insert HowTo JSON-LD**

  Append after the FAQPage `</script>` block (before `</body>`):

  ```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "LED 전광판 도입 절차 — 온리원 LED",
    "description": "상담부터 설치·A/S 등록까지 온리원 LED의 6단계 LED 전광판 도입 프로세스입니다.",
    "totalTime": "P1M",
    "step": [
      {
        "@type": "HowToStep",
        "position": "1",
        "name": "상담 및 견적 요청",
        "text": "전화(010-7782-0021) 또는 홈페이지 문의 폼으로 설치 환경, 크기, 예산을 알려주세요. 1~3일 내에 담당자가 회신드립니다.",
        "url": "https://www.only1led.com/#contact"
      },
      {
        "@type": "HowToStep",
        "position": "2",
        "name": "현장 실측 방문",
        "text": "담당자가 현장을 방문해 정확한 사이즈 측정, 전기 용량 확인, 시공 환경을 파악합니다. 현장 방문은 무료로 진행합니다.",
        "url": "https://www.only1led.com/#contact"
      },
      {
        "@type": "HowToStep",
        "position": "3",
        "name": "설계 및 제품 선정",
        "text": "실측 결과를 바탕으로 최적 피치·사이즈·구조를 설계하고 최종 사양을 확정합니다. 계약·설계에 3~5일이 소요됩니다.",
        "url": "https://www.only1led.com/#contact"
      },
      {
        "@type": "HowToStep",
        "position": "4",
        "name": "제작",
        "text": "확정된 사양에 따라 LED 모듈과 구조물을 제작합니다. 일반적으로 3~4주가 소요되며 규모와 커스텀 정도에 따라 달라질 수 있습니다.",
        "url": "https://www.only1led.com/#contact"
      },
      {
        "@type": "HowToStep",
        "position": "5",
        "name": "설치 시공",
        "text": "제작 완료 후 현장에서 LED 전광판을 설치합니다. 설치는 1~3일이 소요됩니다.",
        "url": "https://www.only1led.com/#contact"
      },
      {
        "@type": "HowToStep",
        "position": "6",
        "name": "사용 교육 및 A/S 등록",
        "text": "설치 완료 후 담당자가 현장에서 콘텐츠 관리 소프트웨어 사용법을 교육합니다. 1년 무상 A/S가 제공됩니다.",
        "url": "https://www.only1led.com/#contact"
      }
    ]
  }
  </script>

  ```

- [ ] **Step 2: Commit**

  ```bash
  git add index.html
  git commit -m "feat: add HowTo JSON-LD schema (6-step process)"
  ```

---

## Task 6: Speakable JSON-LD

**Files:**
- Modify: `index.html` (append after HowTo JSON-LD, before `</body>`)

- [ ] **Step 1: Insert Speakable JSON-LD**

  Append after the HowTo `</script>` block (before `</body>`):

  ```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "온리원 LED — LED 전광판·사이니지 제작 전문업체",
    "url": "https://www.only1led.com/",
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [".hero-sub", ".cf-sidebar"]
    }
  }
  </script>

  ```

  **Note on selector choice:** `.hero-sub` is the static paragraph containing the hero subtitle (always visible in HTML). `.cf-sidebar` contains the contact details block including phone, email, and location. These two blocks give AI voice assistants a clean business summary + contact info.

- [ ] **Step 2: Commit**

  ```bash
  git add index.html
  git commit -m "feat: add Speakable JSON-LD schema"
  ```

---

## Task 7: Update ItemList JSON-LD Service Descriptions

**Files:**
- Modify: `index.html` (existing ItemList JSON-LD block, lines ~1863–1911)

- [ ] **Step 1: Update 실내 LED 전광판 description**

  Find:
  ```json
          "description": "P2~P4 피치 실내용 LED 디스플레이 설계·제작·설치",
  ```

  Replace with:
  ```json
          "description": "학교·교회·기업 회의실·상업매장 등 실내 공간에서 프로젝터나 모니터 비디오월을 대체할 때 많이 사용합니다. P1.53부터 P2.5 피치까지 제작 가능하며, 가장 많이 사용하는 피치는 P1.86·P2입니다. 벽 매립형 시공으로 인테리어를 해치지 않습니다.",
  ```

- [ ] **Step 2: Update 야외 LED 전광판 description**

  Find:
  ```json
          "description": "IP65 방수 등급 실외용 대형 LED 전광판 설계·제작·설치",
  ```

  Replace with:
  ```json
          "description": "상업매장 외벽, 건물 파사드, 스포츠 시설 등 야외 환경에 적합합니다. IP65 방수 등급으로 비·눈·직사광선에 강하며, 고휘도(4,000~6,000nit)로 한낮에도 선명합니다.",
  ```

- [ ] **Step 3: Update 투명 LED 사이니지 description**

  Find:
  ```json
          "description": "유리면 부착형 투명 LED 디스플레이 설계·제작·설치",
  ```

  Replace with:
  ```json
          "description": "유리창이나 파티션에 부착해 외부에서는 투명하게 보이고 안쪽에서는 영상이 재생됩니다. 쇼룸, 호텔 로비, 상업 건물 유리 외벽에 적합합니다.",
  ```

- [ ] **Step 4: Update 플렉서블 LED description**

  Find:
  ```json
          "description": "곡면·기둥 등 비정형 구조물용 플렉서블 LED 솔루션"
  ```

  Replace with:
  ```json
          "description": "기둥, 아치, 원형 등 평면이 아닌 비정형 구조물에 적용 가능합니다. 인테리어 포인트 요소로 활용하거나 특수 공간 연출에 사용합니다."
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "feat: update ItemList JSON-LD service descriptions for GEO"
  ```

---

## Task 8: Push and Verify

- [ ] **Step 1: Push to GitHub**

  ```bash
  git push origin main
  ```

  Cloudflare Pages will auto-deploy within ~1 minute.

- [ ] **Step 2: Validate FAQ schema with Google Rich Results Test**

  Go to [https://search.google.com/test/rich-results](https://search.google.com/test/rich-results) and enter `https://www.only1led.com/`. Confirm "FAQ" rich result type is detected with no errors.

- [ ] **Step 3: Validate all JSON-LD with Schema.org validator**

  Go to [https://validator.schema.org/](https://validator.schema.org/) and enter `https://www.only1led.com/`. Confirm FAQPage, HowTo, WebPage (Speakable), LocalBusiness, and ItemList all validate without critical errors.

- [ ] **Step 4: Request re-indexing in Google Search Console**

  Open Google Search Console → URL Inspection → enter `https://www.only1led.com/` → click "Request Indexing". This prompts Google to re-crawl and pick up the new FAQ rich result.

---

## Self-Review

**Spec coverage check:**
- ✅ FAQ section HTML (25 Q&As, 9 categories) — Task 2
- ✅ FAQ accordion CSS + JS — Tasks 1 & 3
- ✅ FAQPage JSON-LD — Task 4
- ✅ HowTo JSON-LD (6 steps, corrected timings: 3~4주 제작, 1~3일 설치) — Task 5
- ✅ Speakable JSON-LD — Task 6
- ✅ Service text updates (ItemList JSON-LD, 4 services) — Task 7
- ✅ Product accuracy: 실내 P1.53~P2.5, 주요 P1.86·P2, 야외 P3+, 제작 3~4주, 설치 1~3일

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `#faqList .faq-row` used consistently in both HTML and JS. CSS class `.faq-row[aria-expanded="true"]` matches the `setAttribute('aria-expanded', 'true')` in JS.
