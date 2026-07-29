# 라운지핏 예약 플랫폼 기술 설계서 (TDD) — 코어

| 항목 | 내용 |
|---|---|
| 대상 | 개발 설계 에이전트 / 프론트엔드 화면 생성 |
| 선행 문서 | 라운지핏 예약 플랫폼 PRD v1.0 |
| 범위 | 스택·인프라, ERD, 상태 머신, 인증, 시간 규칙, 에러 코드, 회원 API |
| 후속 문서 | TDD 확장 (관리자 API, 배치, 마이그레이션, 테스트 시나리오) |

---

## 1. 기술 스택 및 인프라

### 1.1 스택 확정

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) | 회원 웹·관리자 웹·API를 단일 코드베이스로 운영 |
| 언어 | TypeScript | strict 모드 |
| DB | Neon Serverless Postgres | 무료 티어 |
| ORM | Prisma | 마이그레이션 이력 관리 목적 |
| 인증 | 자체 구현 JWT (httpOnly 쿠키) | 외부 Auth 서비스 미사용 |
| 스타일 | Tailwind CSS | |
| 호스팅 | Vercel | |
| 캐시 | 없음 | 1,200명 규모에서 Redis 불필요. 인덱스로 대응 |
| 배치 | Vercel Cron | 별도 워커 미운영 |

### 1.2 라우트 구조

```
app/
  (member)/            회원 모바일 웹
    login/
    schedule/          시간표 (홈)
    reservations/      내 예약
    waitlist/[id]/     대기 확정
    tickets/           이용권
    notifications/     알림함
  (admin)/             관리자 웹
    login/
    dashboard/
    schedules/
    schedules/[id]/
    proxy-booking/
    members/
    members/[id]/
    settings/
    stats/
    migration/
  api/
    auth/
    member/
    admin/
```

`(member)`는 모바일 뷰포트 전용 레이아웃, `(admin)`은 데스크톱 사이드바 레이아웃을 각각 적용한다.

### 1.3 Neon 연결

서버리스 함수는 요청마다 커넥션을 생성하므로 **반드시 pooled 엔드포인트를 사용한다.**

```
DATABASE_URL=postgres://...-pooler.neon.tech/...   # 애플리케이션 런타임
DIRECT_URL=postgres://....neon.tech/...            # Prisma migrate 전용
```

Prisma datasource에 `directUrl`을 분리 지정한다. pooled 연결로 마이그레이션을 시도하면 실패한다.

### 1.4 환경 변수

```
DATABASE_URL
DIRECT_URL
JWT_SECRET
NODE_ENV
SMS_PROVIDER=mock|aligo      # MVP는 mock
SMS_API_KEY
SMS_SENDER
KAKAO_PROVIDER=mock|aligo    # MVP는 mock
ADMIN_SEED_PASSWORD
```

MVP에서 `SMS_PROVIDER=mock`은 인증번호를 서버 로그에 출력하고 실제 발송하지 않는다. README에 명시한다.

---

## 2. 데이터 모델

### 2.1 ERD 개요

```
Branch 1─────* Member
Branch 1─────* Manager
Branch 1─────* ClassSchedule

TicketType 1──* Ticket
TicketType 1──* ClassSchedule

Member 1─────* Ticket
Ticket 1─────* TicketUsage

ClassSchedule 1──* Reservation
ClassSchedule 1──* WaitlistEntry

Reservation    1──1 TicketUsage
WaitlistEntry  1──1 TicketUsage

Member 1─────* NotificationLog
```

### 2.2 테이블 명세

**branch**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| name | text | A/B/C 지점명 |
| created_at | timestamptz | |

**member**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK | 소속 지점 |
| name | text | |
| phone | text UNIQUE | E.164 미사용, `01012345678` 형식 |
| phone_last4 | text | 조회·마스킹용 생성 컬럼 |
| is_suspended | boolean | 기본 false |
| suspended_reason | text NULL | |
| suspended_until | date NULL | 안내 표기용. 자동 해제 없음 |
| created_at | timestamptz | |

> `suspended_until`은 알림 문구와 화면 표기에만 사용한다. 날짜가 지나도 시스템이 자동 해제하지 않으며, 매니저가 스위치를 내려야 해제된다. 자동화는 2차 범위이다.

**manager**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK NULL | ADMIN은 NULL |
| login_id | text UNIQUE | |
| password_hash | text | bcrypt |
| role | text | `MANAGER` / `ADMIN` |
| name | text | |

**ticket_type**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| name | text | 1:1 개인레슨 / 1:4 기구 필라테스 / 요가 전용 |
| code | text UNIQUE | `PT_1ON1` / `PILATES_1ON4` / `YOGA` |

**ticket**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| member_id | uuid FK | |
| ticket_type_id | uuid FK | |
| total_count | int | 총 횟수 |
| expires_at | date | 만료일 |
| daily_limit | int NULL | NULL이면 무제한 |
| weekly_limit | int NULL | NULL이면 무제한 |
| is_active | boolean | |

**ticket_usage** — 횟수 원장

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK | |
| member_id | uuid FK | 조회 성능용 비정규화 |
| class_schedule_id | uuid FK | 한도 계산 기준 |
| status | text | `HOLD` / `CONFIRMED` / `CONSUMED` / `RELEASED` |
| released_at | timestamptz NULL | |
| created_at | timestamptz | |

**잔여 횟수는 컬럼으로 관리하지 않는다.**

```sql
잔여 = ticket.total_count
     - (SELECT COUNT(*) FROM ticket_usage
        WHERE ticket_id = ? AND status IN ('HOLD','CONFIRMED','CONSUMED'))
```

**class_schedule**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| branch_id | uuid FK | |
| ticket_type_id | uuid FK | 이 수업을 들을 수 있는 수강권 종류 |
| instructor_name | text | 대체 강사 시 이 값만 변경 |
| starts_at | timestamptz | |
| ends_at | timestamptz | |
| capacity | int | 정원 |
| reserved_count | int | 확정 예약 수. 트랜잭션 내 갱신 |
| opened_at | timestamptz NULL | 롤링 오픈 시각. NULL이면 미오픈 |
| status | text | `SCHEDULED` / `CLOSED`(폐강) / `CANCELED`(스튜디오 취소) |
| canceled_reason | text NULL | |

`reserved_count`는 좌석 확인·확정을 단일 행 잠금으로 처리하기 위한 비정규화 컬럼이다. Reservation 생성·취소와 반드시 같은 트랜잭션에서 갱신한다.

**reservation**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| class_schedule_id | uuid FK | |
| member_id | uuid FK | |
| ticket_usage_id | uuid FK | |
| status | text | 아래 상태 머신 참조 |
| source | text | `MEMBER` / `PROXY` |
| created_by_manager_id | uuid FK NULL | 대리 예약 시 처리자 |
| canceled_at | timestamptz NULL | |
| created_at | timestamptz | |

```sql
CREATE UNIQUE INDEX uq_reservation_active
  ON reservation (class_schedule_id, member_id)
  WHERE status = 'RESERVED';
```

취소 후 재예약이 가능해야 하므로 부분 유니크 인덱스를 사용한다.

**waitlist_entry**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| class_schedule_id | uuid FK | |
| member_id | uuid FK | |
| ticket_usage_id | uuid FK | 등록 시점 HOLD |
| sequence | int | 등록 순번 |
| status | text | `WAITING` / `OFFERED` / `CONFIRMED` / `EXPIRED` / `RELEASED` |
| offered_at | timestamptz NULL | |
| expires_at | timestamptz NULL | 타임아웃 만료 시각 |
| created_at | timestamptz | |

```sql
CREATE UNIQUE INDEX uq_waitlist_active
  ON waitlist_entry (class_schedule_id, member_id)
  WHERE status IN ('WAITING','OFFERED');
```

**policy** — 단일 행 테이블

| 컬럼 | 타입 | 초기값 |
|---|---|---|
| id | int PK | 1 고정 |
| cancel_deadline_minutes | int | 180 |
| rolling_open_days | int | 14 |
| rolling_open_hour | int | 0 |
| waitlist_timeout_minutes | int | 30 |
| waitlist_urgent_timeout_minutes | int | 10 |
| waitlist_urgent_threshold_minutes | int | 180 |
| quiet_hours_start | int | 23 |
| quiet_hours_end | int | 7 |
| class_close_deadline_minutes | int | 120 |
| class_min_headcount | int | 3 |
| noshow_threshold_count | int | 3 |
| noshow_suspend_days | int | 7 |
| noshow_reset_cycle | text | `MONTHLY` |
| proxy_booking_enabled | boolean | true |

키-값 테이블이 아닌 단일 행 테이블을 쓰는 이유는 타입 안정성과 저장 시 교차 검증 때문이다.

**저장 시 검증**

- `cancel_deadline_minutes >= class_close_deadline_minutes`
- `waitlist_urgent_threshold_minutes >= class_close_deadline_minutes`
- `quiet_hours_start != quiet_hours_end`
- `waitlist_urgent_timeout_minutes <= waitlist_timeout_minutes`

**notification_log**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| member_id | uuid FK | |
| template_code | text | WAIT_OPEN 등 6종 |
| payload | jsonb | 치환 변수 |
| rendered_text | text | 실제 노출 문구 |
| channel | text | `IN_APP` / `KAKAO` / `SMS` |
| status | text | `SENT` / `FAILED` |
| read_at | timestamptz NULL | 알림함 미읽음 표시용 |
| created_at | timestamptz | |

**auth_code**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| phone | text | |
| code | text | 6자리 |
| expires_at | timestamptz | 발급 후 3분 |
| attempt_count | int | 5회 초과 시 무효 |
| consumed_at | timestamptz NULL | |

### 2.3 노쇼 카운트

별도 테이블을 두지 않고 `reservation`에서 파생한다.

```sql
노쇼_누적 = COUNT(*) FROM reservation r
  JOIN class_schedule c ON c.id = r.class_schedule_id
  WHERE r.member_id = ?
    AND r.status = 'NO_SHOW'
    AND c.starts_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')
```

초기화 주기가 `MONTHLY`이므로 당월 기준으로 집계한다.

### 2.4 필수 인덱스

```sql
class_schedule (branch_id, starts_at)
class_schedule (opened_at, starts_at)          -- 롤링 오픈 조회
reservation (member_id, status)
reservation (class_schedule_id, status)
waitlist_entry (class_schedule_id, status, sequence)
waitlist_entry (status, expires_at)            -- 타임아웃 스캐너
ticket_usage (ticket_id, status)
ticket_usage (member_id, class_schedule_id)
```

---

## 3. 상태 머신

### 3.1 Reservation

| From | To | 트리거 | TicketUsage 연동 |
|---|---|---|---|
| — | RESERVED | 예약 생성 | CONFIRMED 생성 |
| RESERVED | CANCELED | 마감 전 취소 | → RELEASED |
| RESERVED | LATE_CANCELED | 마감 후 취소 | → CONSUMED |
| RESERVED | ATTENDED | 매니저 출석 처리 | → CONSUMED |
| RESERVED | NO_SHOW | 매니저 노쇼 처리 | → CONSUMED |
| RESERVED | CLASS_CANCELED | 폐강·스튜디오 취소 | → RELEASED |

`LATE_CANCELED`는 횟수를 차감하되 **노쇼 카운트에 포함하지 않는다.** 카운트 대상은 `NO_SHOW`뿐이다.

### 3.2 WaitlistEntry

| From | To | 트리거 | TicketUsage 연동 |
|---|---|---|---|
| — | WAITING | 대기 등록 | HOLD 생성 (선차감) |
| WAITING | OFFERED | 좌석 배정 | 유지 |
| OFFERED | CONFIRMED | 기한 내 확정 | HOLD → CONFIRMED, Reservation 생성 |
| OFFERED | EXPIRED | 타임아웃 | → RELEASED, 다음 순번 이관 |
| WAITING | RELEASED | 자진 취소 / 수업 시작 / 폐강 | → RELEASED |

### 3.3 TicketUsage

```
HOLD ──→ CONFIRMED ──→ CONSUMED
  │           │
  └──→ RELEASED ←┘
```

**RELEASED는 종착 상태이다.** 재사용하지 않고 새 레코드를 생성한다. 이 원칙이 중복 복구와 유실을 막는다.

### 3.4 좌석 반환 시 배정 절차

수업 좌석이 하나 반환되면 다음 순서로 처리한다.

1. `reserved_count` 감소 (같은 트랜잭션)
2. 현재 시각이 심야 구간이면 배정 보류하고 종료
3. `WAITING` 중 `sequence` 최소값 1건 조회
4. 없으면 종료
5. 해당 건을 `OFFERED`로 전이하고 `expires_at` 산정
6. WAIT_OPEN 알림 발송

**동시에 2건 이상에게 OFFERED를 부여하지 않는다.** 순차 타이머가 원칙이다.

---

## 4. 인증 및 인가

### 4.1 회원 인증

```
POST /api/auth/member/request-code   { phone }
POST /api/auth/member/verify-code    { phone, code }  → JWT 쿠키 설정
```

- 미등록 번호는 `ERR_MEMBER_NOT_FOUND` 반환. 가입 기능은 없다.
- 코드 유효 3분, 시도 5회 초과 시 무효화.
- MVP는 발송 대신 서버 로그 출력.

### 4.2 토큰

httpOnly · Secure · SameSite=Lax 쿠키. 유효기간 7일. 리프레시 토큰은 MVP 범위 밖.

```json
{
  "sub": "member-uuid",
  "role": "MEMBER",
  "branchId": "branch-uuid",
  "exp": 0
}
```

관리자는 `role: "MANAGER" | "ADMIN"`을 갖는다.

### 4.3 인가 규칙

| 대상 | 규칙 |
|---|---|
| MEMBER | 본인 리소스만. 모든 조회에 `member_id = token.sub` 강제 |
| MANAGER | `branch_id = token.branchId` 강제 |
| MANAGER 예외 | 자기 지점 수업을 예약·대기 중인 타 지점 회원은 조회 가능. 단 마스킹 적용 |
| ADMIN | 전 지점. 정책 설정·통계 화면 전용 |

**구현 위치**: 지점 조건을 각 라우트에서 개별 작성하지 않는다. `withBranchScope(token)` 형태의 공통 레포지토리 레이어를 단일 진입점으로 두고, 교차 수강 예외도 그 안에서 처리한다. Neon에는 RLS 상당 기능이 없으므로 애플리케이션 레이어 누락이 곧 정보 유출이 된다.

### 4.4 마스킹 규칙

타 지점 회원 응답은 다음 필드만 포함한다.

```json
{ "name": "김OO", "phoneLast4": "1234", "remainingCount": 5 }
```

`phone`, `branchName`, 예약 이력 전체는 응답에서 제외한다. 이름은 가운데 글자를 마스킹한다.

---

## 5. 시간 처리 규칙

**모든 시간 로직은 이 절을 기준으로 한다.**

| 항목 | 규칙 |
|---|---|
| 저장 | `timestamptz` (내부 UTC) |
| 연산·표시 | `Asia/Seoul` 고정. 사용자 로컬 타임존 미사용 |
| 일 경계 | KST 00:00 |
| 주 경계 | **월요일 00:00 ~ 일요일 24:00 (KST)** |
| 취소 마감 판정 | `now < starts_at - cancel_deadline_minutes` |
| 대기 타임아웃 선택 | `starts_at - now <= urgent_threshold` → 10분, 아니면 30분 |
| 심야 구간 판정 | `23:00 <= KST시각 OR KST시각 < 07:00` |
| 롤링 오픈 대상 | `starts_at`의 KST 날짜 == 오늘 + 14일 |

### 5.1 표시 포맷

| 용도 | 포맷 | 예시 |
|---|---|---|
| 수업 카드 시각 | `HH:mm` | `19:00` |
| 날짜 스트립 | `M/D(요일)` | `7/29(수)` |
| 상세 일시 | `M월 D일(요일) HH:mm` | `7월 29일(수) 19:00` |
| 카운트다운 | `mm:ss` | `29:47` |
| 만료일 | `YYYY.MM.DD` | `2026.09.30` |

---

## 6. 에러 코드

### 6.1 예약 검증 순서와 코드

**아래 순서대로 검증하고 첫 실패에서 중단한다.** 순서가 곧 사용자에게 보이는 메시지 우선순위이다.

| 순서 | 코드 | HTTP | 회원 노출 문구 |
|---|---|---|---|
| 1 | `ERR_MEMBER_SUSPENDED` | 403 | 예약이 정지된 상태입니다. 자세한 내용은 데스크로 문의해 주세요. |
| 2 | `ERR_CLASS_NOT_OPEN` | 409 | 아직 예약이 열리지 않은 수업입니다. |
| 3 | `ERR_CLASS_CLOSED` | 409 | 진행되지 않는 수업입니다. |
| 4 | `ERR_CLASS_STARTED` | 409 | 이미 시작된 수업은 예약할 수 없습니다. |
| 5 | `ERR_TICKET_TYPE_MISMATCH` | 409 | 보유하신 수강권으로는 예약할 수 없는 수업입니다. |
| 6 | `ERR_TICKET_EXPIRED` | 409 | 이용권 만료일 이후의 수업은 예약할 수 없습니다. |
| 7 | `ERR_NO_REMAINING_COUNT` | 409 | 남은 횟수가 없습니다. |
| 8 | `ERR_DAILY_LIMIT_EXCEEDED` | 409 | 하루 예약 가능 횟수를 모두 사용하셨습니다. |
| 9 | `ERR_WEEKLY_LIMIT_EXCEEDED` | 409 | 이번 주 예약 가능 횟수를 모두 사용하셨습니다. |
| 10 | `ERR_DUPLICATE_RESERVATION` | 409 | 이미 예약하신 수업입니다. |
| 11 | `ERR_CLASS_FULL` | 409 | 정원이 마감되었습니다. 대기 등록을 이용해 주세요. |

### 6.2 기타 코드

| 코드 | HTTP | 문구 |
|---|---|---|
| `ERR_MEMBER_NOT_FOUND` | 404 | 등록된 회원 정보를 찾을 수 없습니다. 데스크로 문의해 주세요. |
| `ERR_INVALID_CODE` | 400 | 인증번호가 올바르지 않습니다. |
| `ERR_CODE_EXPIRED` | 400 | 인증번호가 만료되었습니다. 다시 요청해 주세요. |
| `ERR_WAITLIST_DUPLICATE` | 409 | 이미 대기 중인 수업입니다. |
| `ERR_WAITLIST_NOT_APPLICABLE` | 409 | 아직 자리가 남아 있어 대기 등록이 필요하지 않습니다. |
| `ERR_OFFER_EXPIRED` | 410 | 확정 시간이 지나 순번이 다음 대기자에게 넘어갔습니다. |
| `ERR_RESERVATION_NOT_FOUND` | 404 | 예약 정보를 찾을 수 없습니다. |
| `ERR_UNAUTHORIZED` | 401 | 다시 로그인해 주세요. |

### 6.3 응답 규격

```json
{
  "error": {
    "code": "ERR_WEEKLY_LIMIT_EXCEEDED",
    "message": "이번 주 예약 가능 횟수를 모두 사용하셨습니다.",
    "meta": { "weeklyLimit": 3, "weeklyUsed": 3 }
  }
}
```

`meta`는 화면에서 수치를 함께 노출할 때 사용한다. 프론트엔드는 `message`를 그대로 출력하고, 별도 문구를 지어내지 않는다.

---

## 7. 수업 카드 상태

시간표 화면의 카드 상태는 다음 6종이며, **서버가 `cardState`로 내려준다.** 프론트엔드가 조건을 재계산하지 않는다.

| cardState | 판정 조건 | 배지 문구 | 탭 동작 |
|---|---|---|---|
| `AVAILABLE` | 예약 가능, 잔여 ≥ 1 | `잔여 3/8` | 상세 시트 → 예약 |
| `FULL` | 잔여 0, 대기 가능 | `대기 2명` | 상세 시트 → 대기 등록 |
| `RESERVED` | 본인 예약 있음 | `예약완료` | 상세 시트 → 취소 |
| `WAITING` | 본인 대기 중 | `대기 2번` | 상세 시트 → 대기 취소 |
| `BLOCKED` | 수강권 불일치·만료·한도 초과 | `예약불가` | 사유 안내만 표시 |
| `CLOSED` | 폐강·취소·시작 경과 | `폐강` / `종료` | 비활성 |

`BLOCKED`는 사유별로 다른 안내가 필요하므로 `blockedReason` 필드에 6.1의 에러 코드를 함께 내려준다.

---

## 8. 회원 API 명세

모든 응답은 `Asia/Seoul` 기준 ISO 8601 문자열을 사용한다.

### 8.1 시간표

```
GET /api/member/schedules?date=2026-07-29&branchId=all
```

```json
{
  "date": "2026-07-29",
  "branches": [
    { "id": "uuid", "name": "강남점" }
  ],
  "openedRange": { "from": "2026-07-29", "to": "2026-08-12" },
  "schedules": [
    {
      "id": "uuid",
      "branchName": "강남점",
      "ticketTypeName": "1:4 기구 필라테스",
      "instructorName": "김지원",
      "startsAt": "2026-07-29T19:00:00+09:00",
      "endsAt": "2026-07-29T19:50:00+09:00",
      "capacity": 8,
      "reservedCount": 5,
      "waitingCount": 2,
      "cardState": "AVAILABLE",
      "blockedReason": null
    }
  ]
}
```

`openedRange`는 날짜 스트립에서 선택 불가 구간을 회색 처리하는 데 사용한다.

### 8.2 수업 상세

```
GET /api/member/schedules/:id
```

```json
{
  "id": "uuid",
  "branchName": "강남점",
  "ticketTypeName": "1:4 기구 필라테스",
  "instructorName": "김지원",
  "startsAt": "2026-07-29T19:00:00+09:00",
  "capacity": 8,
  "reservedCount": 5,
  "waitingCount": 2,
  "cardState": "AVAILABLE",
  "blockedReason": null,
  "deductCount": 1,
  "cancelDeadlineAt": "2026-07-29T16:00:00+09:00",
  "myTicket": {
    "remainingCount": 7,
    "expiresAt": "2026-09-30",
    "weeklyLimit": 3,
    "weeklyUsed": 2
  }
}
```

`deductCount`와 `cancelDeadlineAt`은 예약 시트에 반드시 노출한다.

### 8.3 예약

```
POST /api/member/reservations   { scheduleId }
```

성공 201.

```json
{
  "reservationId": "uuid",
  "scheduleId": "uuid",
  "remainingCount": 6,
  "cancelDeadlineAt": "2026-07-29T16:00:00+09:00"
}
```

실패는 6.1 코드. 트랜잭션 내에서 `class_schedule` 행에 `SELECT ... FOR UPDATE`를 건 뒤 좌석을 확인한다.

### 8.4 예약 취소

```
DELETE /api/member/reservations/:id
```

```json
{
  "status": "CANCELED",
  "refunded": true,
  "remainingCount": 7
}
```

마감 후 취소는 `status: "LATE_CANCELED"`, `refunded: false`로 응답한다. 클라이언트는 요청 전 `cancelDeadlineAt`으로 확인 모달 문구를 분기하되, 최종 판정은 서버 응답을 따른다.

### 8.5 대기 등록

```
POST /api/member/waitlist   { scheduleId }
```

```json
{
  "waitlistId": "uuid",
  "sequence": 3,
  "remainingCount": 6,
  "notice": "대기 등록으로 횟수 1회가 차감되었습니다. 자리를 받지 못하면 자동으로 반환됩니다."
}
```

**선차감 방식이므로 잔여 횟수가 0이면 `ERR_NO_REMAINING_COUNT`로 거부한다.** 한도 초과 시에도 동일하게 거부한다.

### 8.6 대기 취소

```
DELETE /api/member/waitlist/:id
```

```json
{ "status": "RELEASED", "remainingCount": 7 }
```

### 8.7 대기 확정

```
GET  /api/member/waitlist/:id/offer
POST /api/member/waitlist/:id/confirm
```

GET 응답:

```json
{
  "waitlistId": "uuid",
  "status": "OFFERED",
  "expiresAt": "2026-07-29T14:30:00+09:00",
  "remainingSeconds": 1787,
  "schedule": { "...": "8.2와 동일 구조" }
}
```

`remainingSeconds`를 서버가 계산해 내려준다. 클라이언트 시계를 신뢰하지 않는다. 만료 시 `ERR_OFFER_EXPIRED`.

### 8.8 내 예약

```
GET /api/member/reservations?tab=upcoming|waiting|past
```

```json
{
  "upcoming": [
    {
      "reservationId": "uuid",
      "scheduleId": "uuid",
      "branchName": "강남점",
      "ticketTypeName": "요가 전용",
      "startsAt": "2026-07-30T10:00:00+09:00",
      "instructorName": "박서연",
      "cancelDeadlineAt": "2026-07-30T07:00:00+09:00",
      "cancelable": true
    }
  ],
  "waiting": [
    {
      "waitlistId": "uuid",
      "sequence": 2,
      "status": "WAITING",
      "startsAt": "2026-07-31T19:00:00+09:00",
      "holdNotice": "횟수 1회가 선차감된 상태입니다."
    }
  ],
  "past": [
    {
      "reservationId": "uuid",
      "startsAt": "2026-07-25T19:00:00+09:00",
      "status": "ATTENDED",
      "statusLabel": "출석"
    }
  ]
}
```

`statusLabel` 매핑: ATTENDED→출석, NO_SHOW→노쇼, CANCELED→취소, LATE_CANCELED→지각취소, CLASS_CANCELED→수업취소.

### 8.9 이용권

```
GET /api/member/tickets
```

```json
{
  "tickets": [
    {
      "id": "uuid",
      "ticketTypeName": "1:4 기구 필라테스",
      "totalCount": 20,
      "remainingCount": 7,
      "holdCount": 1,
      "expiresAt": "2026-09-30",
      "daysUntilExpiry": 63,
      "dailyLimit": 1,
      "weeklyLimit": 3,
      "weeklyUsed": 2
    }
  ],
  "suspension": {
    "isSuspended": false,
    "reason": null,
    "until": null
  }
}
```

`holdCount`는 대기 선차감분이며 화면에 별도 표기한다.

### 8.10 알림함

```
GET  /api/member/notifications
POST /api/member/notifications/:id/read
```

```json
{
  "unreadCount": 2,
  "items": [
    {
      "id": "uuid",
      "templateCode": "WAIT_OPEN",
      "title": "대기 자리가 배정되었습니다",
      "body": "7월 29일(수) 19:00 1:4 기구 필라테스 자리가 나왔습니다. 14:30까지 확정해 주세요.",
      "linkTo": "/waitlist/uuid",
      "isRead": false,
      "createdAt": "2026-07-29T14:00:00+09:00"
    }
  ]
}
```

---

## 9. 후속 문서 예고

TDD 확장에서 다룬다.

- 관리자 API 명세 (시간표·대리 예약·출석·폐강·정책·통계)
- 배치 명세 (롤링 오픈, 타임아웃 스캐너, 심야 재개, 노쇼 초기화)
- 마이그레이션 엑셀 스키마 및 검증 리포트
- 동시성·정합성 테스트 시나리오
- 알림 발송부 인터페이스 및 어댑터 교체 절차