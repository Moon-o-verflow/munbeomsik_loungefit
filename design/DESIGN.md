# DESIGN.md — 라운지핏 디자인 시스템

| 항목 | 내용 |
|---|---|
| 적용 범위 | 회원 모바일 웹 + 관리자 데스크톱 웹 |
| 구현 방식 | Tailwind 토큰으로 등록 후 클래스로만 사용 |
| 화면 스펙 | `design/screens-member.md` / `design/screens-admin.md` |

## 사용 규칙

- 이 문서의 토큰을 `tailwind.config.ts`에 등록하고 **클래스로만 사용한다.** 색상 hex를 컴포넌트에 직접 쓰지 않는다.
- 화면 스펙 문서의 `"~를 디자인한다"`는 이미지 생성 지시가 아니라 **해당 화면을 그렇게 구현하라는 뜻이다.**
- 화면 스펙에서 큰따옴표로 감싼 한국어 문구는 **확정값이다.** 임의로 바꾸지 않는다.
- 화면을 만들기 전에 공용 컴포넌트를 먼저 만든다.

---

## 1. 디자인 방향

두 표면은 **같은 브랜드, 다른 밀도**를 갖는다.

| | 회원 모바일 | 관리자 데스크톱 |
|---|---|---|
| 사용자 | 30~50대 여성 회원 | 데스크 매니저, 운영이사 |
| 사용 빈도 | 하루 1~2회 | 하루 수십 회 반복 |
| 원칙 | 여백 넉넉히, 정보 위계 뚜렷하게 | **정보 밀도 우선, 여백 최소화** |
| 기준 폭 | 390px | 1280px |

공통으로 지키는 것:

- 차분한 웰니스 톤. 그라디언트·이모지·무거운 그림자를 쓰지 않는다
- 아이콘은 전부 선형(outline). 채워진 아이콘 금지
- 정보 위계는 타이포 크기와 굵기로만 구분한다
- 액센트와 경고 외의 색을 추가하지 않는다

---

## 2. 컬러 토큰

### 2.1 공통

| 토큰 | HEX | 용도 |
|---|---|---|
| `bg` | `#FAF8F5` | 회원 화면 배경 |
| `bg-admin` | `#F7F5F1` | 관리자 콘텐츠 배경 |
| `surface` | `#FFFFFF` | 카드·테이블·모달 |
| `text` | `#1C1A17` | 주 텍스트 |
| `text-sub` | `#7A736B` | 보조 텍스트 |
| `border` | `#E8E3DC` | 보더·구분선 |
| `accent` | `#4A5D4E` | 주요 버튼, 활성 상태, 성공 |
| `accent-bg` | `#EDF1EC` | 액센트 연배경 |
| `warn` | `#B4552D` | 경고, 노쇼, 위험 액션 |
| `warn-bg` | `#FBF0EA` | 경고 연배경 |
| `warn-border` | `#EDD5C6` | 경고 박스 보더 |
| `neutral-bg` | `#F2EFEA` | 중립 배지 배경 |
| `muted` | `#B8B2A9` | 비활성 텍스트 |
| `muted-bg` | `#EFEBE5` | 비활성 버튼 배경 |
| `subtle` | `#F7F5F1` | 안내 박스 배경 (회원) |

### 2.2 관리자 전용

| 토큰 | HEX | 용도 |
|---|---|---|
| `sidebar` | `#1F241E` | 사이드바 배경 |
| `sidebar-text` | `#C9CFC6` | 사이드바 기본 텍스트 |
| `sidebar-active` | `#2E362C` | 사이드바 활성 항목 배경 |
| `sidebar-muted` | `#8C948A` | 사이드바 보조 텍스트 |
| `table-head` | `#FAF8F5` | 테이블 헤더 행, hover |

### 2.3 차트 색상 (관리자 통계)

| 용도 | HEX |
|---|---|
| 예약 | `#4A5D4E` |
| 출석 | `#7E9080` |
| 노쇼 | `#B4552D` |

---

## 3. 타이포그래피

폰트는 **Pretendard**. 모든 UI 텍스트는 한국어.

### 3.1 회원 모바일

| 용도 | 크기 | 굵기 |
|---|---|---|
| 화면 제목 | 20px | Bold |
| 섹션 제목 | 16px | SemiBold |
| 본문 | 15px | Regular |
| 보조 정보 | 13px | Regular |
| 배지·캡션 | 12px | Medium |
| 카운트다운 | 48px | Bold (고정폭 숫자) |

### 3.2 관리자 데스크톱

| 용도 | 크기 | 굵기 |
|---|---|---|
| 페이지 제목 | 22px | Bold |
| 카드 제목 | 15px | SemiBold |
| 지표 숫자 | 26~28px | Bold |
| 테이블 헤더 | 12px | SemiBold (`text-sub`) |
| 테이블 셀 | 13px | Regular |
| 숫자 강조 | 13px | SemiBold |
| 캡션 | 12px | Regular |

---

## 4. 공용 컴포넌트

**화면을 만들기 전에 아래를 먼저 구현한다.** 화면마다 버튼을 새로 만들지 않는다.

### Button

| variant | 회원 높이 | 관리자 높이 | 스타일 |
|---|---|---|---|
| `primary` | 52px | 38px | `bg-accent`, 흰 텍스트 |
| `secondary` | 52px | 38px | `bg-surface`, `border`, `text` |
| `danger` | 52px | 38px | `bg-warn`, 흰 텍스트 |
| `disabled` | — | — | `bg-muted-bg`, `text-muted` |
| `text` | — | — | 배경 없음, `text-accent` 또는 `text-warn` |

라운드: 회원 10px, 관리자 8px. 관리자 테이블 행 내부 버튼은 높이 30px / 12px.

### Badge

높이 22~24px, 라운드 5~6px, 11~12px Medium. 배경·텍스트 조합 4종.

| tone | 배경 | 텍스트 | 용도 |
|---|---|---|---|
| `accent` | `accent-bg` | `accent` | 정상, 잔여 있음, 출석 |
| `warn` | `warn-bg` | `warn` | 노쇼, 임계, 만료 임박 |
| `neutral` | `neutral-bg` | `text-sub` | 취소, 종료, 대기 |
| `solid` | `accent` | 흰색 | 예약완료 |
| `solid-warn` | `warn` | 흰색 | 예약 정지 |

### Card

`bg-surface`, 라운드 회원 12px / 관리자 10px, `border` 1px, 그림자 없음.
내부 패딩 회원 16~20px, 관리자 20px.

### BottomSheet (회원 전용)

상단 라운드 20px, 상단 중앙 그랩 핸들 4×36px (`border` 색), 뒤 배경 투명도 40% 검정.
하단 고정 버튼 영역은 상단에 `border` 1px.

### Modal

`bg-surface`, 라운드 12~16px, 뒤 배경 투명도 45% 검정.
폭: 회원 화면의 88%, 관리자 460~520px.

### TabBar (회원 전용)

높이 64px, `bg-surface`, 상단 `border` 1px.
탭 4개: `시간표` / `내 예약` / `이용권` / `알림`.
활성 `accent`, 비활성 `muted`.

### Sidebar (관리자 전용)

고정 폭 240px, `bg-sidebar`.
상단 워드마크 `LOUNGEFIT` 15px 자간 넓게 + `운영 관리자` 11px.
메뉴 항목 높이 42px, 아이콘 18px + 라벨 13px.
메뉴 7개: `대시보드` / `시간표 관리` / `대리 예약` / `회원 관리` / `통계` / `정책 설정` / `데이터 이관`.
하단 고정 계정 블록 + `로그아웃`.

### DataTable (관리자 전용)

헤더 행 `table-head` 배경, 행 높이 48px, 행 구분선 `border` 1px, hover 시 `table-head`.
정렬·페이지네이션은 별도 슬롯으로 받는다.

### EmptyState

중앙 정렬. 선형 아이콘 48px(`border` 색) + 안내 문구 15px(`text-sub`) + 선택적 보조 버튼.

### Input / Select

높이 회원 52px / 관리자 38px, `border` 1px, 라운드 8~10px.
에러 상태는 보더 `warn` + 하단 에러 문구 12~13px `warn`.

---

## 5. 레이아웃

### 5.1 회원 모바일

좌우 기본 패딩 20px. 카드 간격 12px. 하단 탭바 높이만큼 콘텐츠 하단 여백 확보.
하단 고정 버튼이 있는 화면은 탭바를 숨긴다.

### 5.2 관리자 데스크톱

사이드바 240px + 콘텐츠. 콘텐츠 좌우 패딩 32px, 상단 28px.
2단 레이아웃 사용 시 간격 20px.

---

## 6. 표기 규칙

**모든 포맷 함수는 `src/lib/time.ts`에만 둔다.** 컴포넌트에서 직접 포맷하지 않는다.

| 용도 | 포맷 | 예시 |
|---|---|---|
| 시각 | `HH:mm` (24시간제) | `19:00` |
| 시간 범위 | `HH:mm - HH:mm` | `19:00 - 19:50` |
| 날짜 스트립 | `M/D(요일)` | `7/29(수)` |
| 상세 일시 | `M월 D일(요일) HH:mm` | `7월 29일(수) 19:00` |
| 관리자 목록 일시 | `M/D(요일) HH:mm` | `7/29(수) 19:00` |
| 만료일 | `YYYY.MM.DD` | `2026.09.30` |
| 입력 필드 날짜 | `YYYY-MM-DD` | `2026-08-01` |
| 카운트다운 | `mm:ss` | `29:47` |
| 인원 | `n / n명` | `5 / 8명` |
| 잔여 좌석 배지 | `잔여 n/n` | `잔여 5/8` |
| 비율 | 소수 1자리 + `%` | `78.2%` |

---

## 7. 상태 표현 규칙

### 7.1 수업 카드 (회원 시간표)

`cardState`는 **서버가 내려준다.** 프론트엔드가 조건을 재계산하지 않는다.

| cardState | 배지 문구 | tone | 비고 |
|---|---|---|---|
| `AVAILABLE` | `잔여 5/8` | accent | 잔여 2 이하면 warn |
| `FULL` | `대기 2명` | neutral | |
| `RESERVED` | `예약완료` | solid | 카드 좌측 3px 액센트 바 |
| `WAITING` | `대기 2번` | 흰 배경 + accent 보더 | |
| `BLOCKED` | `예약불가` | neutral | 카드 투명도 55%, 사유 노출 |
| `CLOSED` | `폐강` / `종료` | neutral | 비활성 |

### 7.2 예약 결과 배지

| status | 라벨 | tone |
|---|---|---|
| `ATTENDED` | 출석 | accent |
| `NO_SHOW` | 노쇼 | warn |
| `CANCELED` | 취소 | neutral |
| `LATE_CANCELED` | 지각취소 | neutral |
| `CLASS_CANCELED` | 수업취소 | neutral |

### 7.3 에러 표시

서버가 준 `message`를 **그대로 출력한다.** 프론트엔드가 문구를 만들지 않는다.
에러 박스는 `warn-bg` 배경 + `warn-border` 보더 + 선형 경고 아이콘 + `warn` 텍스트.

### 7.4 마스킹 표시

타 지점 회원은 서버가 이미 마스킹한 값을 내려준다. 화면에서 가리지 않는다.
표기는 `이OO` / `••••-8821` 형태이며, 마스킹된 셀은 `muted` 색으로 흐리게 처리한다.

---

## 8. Tailwind 설정

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        bg: '#FAF8F5',
        'bg-admin': '#F7F5F1',
        surface: '#FFFFFF',
        text: { DEFAULT: '#1C1A17', sub: '#7A736B' },
        border: '#E8E3DC',
        accent: { DEFAULT: '#4A5D4E', bg: '#EDF1EC' },
        warn: { DEFAULT: '#B4552D', bg: '#FBF0EA', border: '#EDD5C6' },
        neutral: { bg: '#F2EFEA' },
        muted: { DEFAULT: '#B8B2A9', bg: '#EFEBE5' },
        subtle: '#F7F5F1',
        sidebar: {
          DEFAULT: '#1F241E',
          text: '#C9CFC6',
          active: '#2E362C',
          muted: '#8C948A',
        },
        'table-head': '#FAF8F5',
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```

Pretendard는 CDN으로 로드한다.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css" />
```

---

## 9. 하지 말아야 할 것

- 색상 hex를 컴포넌트에 직접 쓰기 (반드시 토큰 클래스 사용)
- 화면 스펙에 없는 색 추가
- 채워진(filled) 아이콘 사용
- 관리자 화면에 여백을 넓혀 밀도를 낮추기
- 서버가 내려준 문구를 프론트엔드에서 가공하기
- 날짜·시각을 컴포넌트에서 직접 포맷하기