# ONLYONE LED Planner — 설계 문서 (2026-10-19)

## 목적
LED 전광판 설계 웹 도구. 캐비닛 조합 → 해상도/면적/무게/전력 → 도면 → 3D → 결선 → 콘텐츠 캔버스·슬라이스 → Resolume Arena 출력 프리셋 → PDF/PNG 보고서.
참고 도구(pixel.startsolution.com.ar)의 기능·작업 흐름을 기준으로 하되, 코드·문구·디자인은 새로 작성한다. 브랜드: ONLYONE LED.

## 배치
- 경로: `planner/` → `https://only1led.com/planner/`
- 순수 HTML/CSS/ES Modules, 빌드 없음. Three.js / jsPDF는 CDN.
- 기존 파일(`led-layout-calc.html`, `led-cost-calculator.html`, `admin-tools/led-layout-engine.js`)은 건드리지 않는다.

## 파일
| 파일 | 역할 |
|---|---|
| `planner/index.html` | 화면 골격 |
| `planner/planner.css` | 스타일(라이트/다크 토큰) |
| `planner/js/i18n.js` | 한국어/영어 사전 (일본어 추가 가능 구조) |
| `planner/js/catalog.js` | 기본 패널 프리셋 15종 + 패널 스키마 |
| `planner/js/engine.js` | 순수 계산: 그리드, 혼합 배치, 결과, 곡률, 번호, 결선, 비율 추천, 슬라이스 |
| `planner/js/resolume.js` | Resolume Arena Advanced Output XML 생성/병합 |
| `planner/js/state.js` | 프로젝트 상태, 저장(localStorage), 가져오기/내보내기 |
| `planner/js/plan2d.js` | 도면/결선도/씬 에디터 SVG |
| `planner/js/scene3d.js` | Three.js 3D 뷰 |
| `planner/js/report.js` | PDF/PNG 보고서 |
| `planner/js/app.js` | UI 연결 |
| `planner/test/engine.test.mjs` | 엔진 테스트 (`node planner/test/engine.test.mjs`) |

## 기능
**공통**: 심플/프로 모드, 라이트/다크, KO/EN, 프로젝트명·고객·리비전, 새로 만들기·저장본 열기·복제, JSON 가져오기/내보내기, PDF/PNG 내보내기, 자동 저장.

**심플**: ① 패널 ② 형상(평면/오목/볼록/부분 아치/360° 원통) ③ 크기(열×행 / 미터, 16:9 근접 추천, 소형+대형 혼합 배치: 재고·목표·소형 띠 위치·호환 확인) ④ 결과(가로/세로/캐비닛/면적/해상도/총 픽셀/비율/무게·전력) ⑤ 도면(캐비닛·결선 보기, 치수, 번호 매기기, 추가·삭제·회전·교체, ±열/행) ⑥ 3D.

**프로**: 1 디자인(여러 화면, 2D 씬 에디터: 정면/평면/전개, 그리드 스냅, 정렬·분배, 위치·높이·깊이·기울기·방향) 2 결선(자동/수동, 포트 용량, 픽셀 플롯) 3 캔버스·Arena(캔버스 크기, 출력, 화면별/캐비닛별 슬라이스, 그룹 회전, CSV/JSON, Resolume XML 직접/기존 프리셋 기반) 4 카탈로그(사용자 패널 CRUD, 가져오기/내보내기).

**업그레이드(참고 도구 대비)**: 번호 방향(가로/세로)과 패턴(지그재그/일방향) 분리, 균등 포트 분배, 곡면 반지름·현 길이·깊이 표시, 3D 사람 크기 기준, 포트별 색상, 자동 저장.

## 제품 데이터
1차는 범용 프리셋. 완성 후 온리원LED 제품(`data/services.json` 스펙 기반)으로 교체한다.
