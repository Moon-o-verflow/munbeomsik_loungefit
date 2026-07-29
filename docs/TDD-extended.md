# 라운지핏 예약 플랫폼 기술 설계서 (TDD) — 확장

| 항목 | 내용 |
|---|---|
| 선행 문서 | PRD v1.0 / TDD 코어 |
| 범위 | 관리자 API, 배치, 알림 발송부, 마이그레이션, 테스트 시나리오 |
| 후속 작업 | B군(관리자) 화면 프롬프트 |

---

## 1. 관리자 API 공통 규약

### 1.1 지점 스코프 강제

모든 관리자 API는 라우트에서 개별로 `branch_id` 조건을 작성하지 않는다. 공통 레이어를 단일 진입점으로 둔다.

```ts
type AdminScope = {
  role: 'MANAGER' | 'ADMIN'
  branchId: string | null   // ADMIN은 null
}

// 지점 소유 리소스 조회 시 항상 경유
scopedWhere(scope): Prisma.ClassScheduleWhereInput
// MANAGER → { branchId: scope.branchId }
// ADMIN   → {}
```

Neon에는 RLS 상당 기능이 없으므로 이 레이어 누락이 곧 정보 유출이다. 리뷰 시 원시 쿼리에서 `branch_id` 조건이 직접 등장하면 반려한다.

### 1.2 회원 정보 응답 규격

관리자 응답에 회원이 포함될 때는 **반드시 두 형태 중 하나를 사용한다.**

```ts
// 자기 지점 회원
type MemberFull = {
  id: string
  name: string            // "김민서"
  phone: string           // "01012345678"
  branchName: string
  remainingCount: number
  noShowCount: number
  isSuspended: boolean
  isCrossBranch: false
}

// 타 지점 회원 (교차 수강)
type MemberMasked = {
  id: string
  name: string            // "김OO"
  phoneLast4: string      // "1234"
  remainingCount: number
  isCrossBranch: true
}
```

마스킹 판정은 응답 직렬화 시점에 `member.branchId !== scope.branchId`로 일괄 처리한다. 화면단에서 가리지 않는다.

### 1.3 권한 매트릭스

| API 그룹 | MANAGER | ADMIN |
|---|---|---|
| 시간표 관리 | 자기 지점 | 전 지점 |
| 수업 상세·출석·폐강 | 자기 지점 | 전 지점 |
| 대리 예약 | 자기 지점 수업 | 전 지점 |
| 회원 목록·상세 | 자기 지점 + 교차 수강자(마스킹) | 전 지점 |
| 예약 정지 | 자기 지점 회원만 | 전 지점 |
| 정책 설정 | **불가 (403)** | 가능 |
| 통계 | 자기 지점 | 전 지점 |
| 데이터 이관 | **불가 (403)** | 가능 |

---

## 2. 관리자 API 명세

### 2.1 대시보드

```
GET /api/admin/dashboard
```

```json
{
  "branchName": "강남점",
  "todayClasses": [
    {
      "id": "uuid",
      "startsAt": "2026-07-29T19:00:00+09:00",
      "ticketTypeName": "1:4 기구 필라테스",
      "instructorName": "김지원",
      "capacity": 8,
      "reservedCount": 5,
      "waitingCount": 2,
      "attendanceStatus": "PENDING"
    }
  ],
  "closeCandidates": [
    {
      "id": "uuid",
      "startsAt": "2026-07-29T21:00:00+09:00",
      "ticketTypeName": "요가 전용",
      "reservedCount": 1,
      "minHeadcount": 3,
      "decisionDeadlineAt": "2026-07-29T19:00:00+09:00"
    }
  ],
  "noShowAlerts": [
    { "memberId": "uuid", "name": "박서연", "noShowCount": 3, "threshold": 3, "isSuspended": false }
  ],
  "pendingAttendanceCount": 2
}
```

- `attendanceStatus`: `PENDING`(수업 종료했으나 미처리) / `DONE` / `NOT_YET`(미종료)
- `closeCandidates`는 `reservedCount < minHeadcount` 이면서 `now >= starts_at - close_deadline` 인 수업
- `noShowAlerts`는 당월 누적이 임계 이상인 미정지 회원

### 2.2 시간표 관리

```
GET  /api/admin/schedules?year=2026&month=8
POST /api/admin/schedules
PATCH  /api/admin/schedules/:id
DELETE /api/admin/schedules/:id
```

**월 조회 응답**

```json
{
  "days": [
    {
      "date": "2026-08-01",
      "classCount": 6,
      "totalCapacity": 42,
      "totalReserved": 31,
      "isOpened": true
    }
  ]
}
```

**등록 요청 (반복 지원)**

```json
{
  "branchId": "uuid",
  "ticketTypeId": "uuid",
  "instructorName": "김지원",
  "startTime": "19:00",
  "durationMinutes": 50,
  "capacity": 8,
  "repeat": {
    "type": "WEEKLY",
    "daysOfWeek": ["MON", "WED", "FRI"],
    "from": "2026-08-01",
    "to": "2026-08-31"
  }
}
```

- `repeat.type`이 `NONE`이면 `from` 일자에만 1건 생성한다.
- 생성 시 `opened_at`은 NULL이다. 롤링 오픈 배치가 채운다.
- 응답에 생성 건수와 충돌 건수를 함께 반환한다.

```json
{ "createdCount": 13, "skipped": [{ "date": "2026-08-15", "reason": "동일 시간 수업 존재" }] }
```

**삭제 제약** — 확정 예약이 1건이라도 있으면 삭제를 거부하고 `ERR_SCHEDULE_HAS_RESERVATION`을 반환한다. 폐강 또는 수업 취소 기능을 사용하도록 유도한다.

### 2.3 수업 상세

```
GET /api/admin/schedules/:id
```

```json
{
  "id": "uuid",
  "branchName": "강남점",
  "ticketTypeName": "1:4 기구 필라테스",
  "instructorName": "김지원",
  "startsAt": "2026-07-29T19:00:00+09:00",
  "endsAt": "2026-07-29T19:50:00+09:00",
  "capacity": 8,
  "reservedCount": 5,
  "status": "SCHEDULED",
  "isPast": false,
  "closeDecisionDeadlineAt": "2026-07-29T17:00:00+09:00",
  "reservations": [
    {
      "reservationId": "uuid",
      "member": { "id": "uuid", "name": "김민서", "phone": "01012345678", "remainingCount": 6, "noShowCount": 0, "isSuspended": false, "isCrossBranch": false },
      "status": "RESERVED",
      "source": "MEMBER",
      "createdAt": "2026-07-20T10:12:00+09:00"
    },
    {
      "reservationId": "uuid",
      "member": { "id": "uuid", "name": "이OO", "phoneLast4": "8821", "remainingCount": 3, "isCrossBranch": true },
      "status": "RESERVED",
      "source": "PROXY",
      "createdAt": "2026-07-21T15:40:00+09:00"
    }
  ],
  "waitlist": [
    {
      "waitlistId": "uuid",
      "sequence": 1,
      "status": "WAITING",
      "member": { "id": "uuid", "name": "정하윤", "phone": "01033334444", "remainingCount": 4, "isCrossBranch": false }
    }
  ]
}
```

### 2.4 출석 · 노쇼 처리

```
POST /api/admin/reservations/:id/attend
POST /api/admin/reservations/:id/no-show
POST /api/admin/reservations/:id/revert
```

- `attend` → `ATTENDED`, TicketUsage `CONFIRMED → CONSUMED`
- `no-show` → `NO_SHOW`, TicketUsage `CONFIRMED → CONSUMED`, 당월 노쇼 카운트 증가
- `revert` → `RESERVED`로 되돌린다. 오조작 정정용이며 수업 종료 후 24시간 이내만 허용한다
- 수업 시작 전에는 `ERR_CLASS_NOT_STARTED` 반환

**일괄 처리**

```
POST /api/admin/schedules/:id/attendance
{ "attended": ["res-uuid-1", "res-uuid-2"], "noShow": ["res-uuid-3"] }
```

명단 체크 후 한 번에 확정하는 동선이 실제 데스크 업무에 가깝다. 트랜잭션 단위로 처리한다.

### 2.5 폐강

```
POST /api/admin/schedules/:id/close
{ "reason": "인원 미달" }
```

**처리 순서 (단일 트랜잭션)**

1. `class_schedule.status = 'CLOSED'`
2. `RESERVED` 예약 전건 → `CLASS_CANCELED`, TicketUsage → `RELEASED`
3. `WAITING` / `OFFERED` 대기 전건 → `RELEASED`, TicketUsage → `RELEASED`
4. 예약자·대기자 전원에게 `CLASS_CLOSED` 알림 큐잉
5. `reserved_count = 0`

```json
{
  "closedAt": "2026-07-29T17:05:00+09:00",
  "affected": { "reservations": 2, "waitlist": 0, "restoredCount": 2 }
}
```

응답의 `affected`는 실행 전 확인 모달에도 동일 구조로 미리 조회할 수 있어야 한다.

```
GET /api/admin/schedules/:id/close-preview
```

### 2.6 수업 취소 (스튜디오 사정)

```
POST /api/admin/schedules/:id/cancel
{ "reason": "강사 결근" }
```

폐강과 처리 로직은 동일하되 `status = 'CANCELED'`, 알림 템플릿은 `CLASS_CANCELED`를 사용한다. **당일·임박 수업에도 실행 가능해야 한다.** 폐강과 달리 시간 제약을 두지 않는다.

### 2.7 대체 강사 지정

```
PATCH /api/admin/schedules/:id/instructor
{ "instructorName": "이수민", "notify": true }
```

예약·대기 상태는 일절 변경하지 않는다. `notify: true`면 예약자에게 `INSTRUCTOR_CHANGED` 알림을 발송한다.

### 2.8 대리 예약

```
GET /api/admin/members/search?q=김민서
GET /api/admin/members/search?q=1234
```

이름 또는 휴대폰 뒷 4자리로 검색한다. 자기 지점 회원 + 자기 지점 수업 예약 이력이 있는 타 지점 회원까지 노출한다.

```
GET /api/admin/proxy-booking/available?memberId=uuid&date=2026-07-30
```

```json
{
  "member": {
    "id": "uuid", "name": "김민서", "phone": "01012345678",
    "branchName": "강남점", "isSuspended": false,
    "tickets": [
      { "ticketTypeName": "1:4 기구 필라테스", "remainingCount": 6, "holdCount": 1,
        "expiresAt": "2026-09-30", "dailyLimit": 1, "dailyUsed": 0, "weeklyLimit": 3, "weeklyUsed": 2 }
    ]
  },
  "schedules": [
    {
      "id": "uuid", "startsAt": "2026-07-30T19:00:00+09:00",
      "ticketTypeName": "1:4 기구 필라테스", "instructorName": "김지원",
      "capacity": 8, "reservedCount": 5,
      "bookable": true, "blockedReason": null
    },
    {
      "id": "uuid", "startsAt": "2026-07-30T20:00:00+09:00",
      "ticketTypeName": "요가 전용", "instructorName": "박서연",
      "capacity": 12, "reservedCount": 4,
      "bookable": false, "blockedReason": "ERR_TICKET_TYPE_MISMATCH"
    }
  ]
}
```

**검증 로직은 회원 직접 예약과 완전히 동일하다.** 매니저 권한으로 한도나 만료일을 우회할 수 없다. 이 원칙이 무너지면 잔여 횟수 정합성이 깨진다.

```
POST /api/admin/proxy-booking
{ "memberId": "uuid", "scheduleId": "uuid" }
```

생성되는 예약은 `source: 'PROXY'`, `created_by_manager_id`가 기록된다.

### 2.9 회원 관리

```
GET /api/admin/members?page=1&keyword=&filter=all|suspended|noshow
GET /api/admin/members/:id
```

**회원 상세 응답**

```json
{
  "member": { "id": "uuid", "name": "김민서", "phone": "01012345678", "branchName": "강남점" },
  "tickets": [ { "...": "잔여·한도·만료" } ],
  "suspension": { "isSuspended": false, "reason": null, "until": null },
  "noShow": { "currentCycleCount": 2, "threshold": 3, "cycleStartedAt": "2026-07-01", "totalCount": 7 },
  "reservationHistory": [ { "startsAt": "...", "ticketTypeName": "...", "branchName": "...", "status": "ATTENDED" } ]
}
```

`reservationHistory`의 `branchName`은 수강 지점이며, 회원 소속 지점과 다르면 교차 수강 건이다.

### 2.10 예약 정지

```
POST   /api/admin/members/:id/suspend
{ "reason": "노쇼 3회 누적", "until": "2026-08-05", "notify": true }

DELETE /api/admin/members/:id/suspend
```

- 기존 예약은 유지한다. 취소하지 않는다.
- 정지 상태에서도 회원 본인의 예약 취소는 허용한다.
- `until`은 표기·알림용이며 자동 해제되지 않는다. 해제는 매니저가 직접 수행한다.
- 응답에 `activeReservationCount`를 포함해 화면에서 "기존 예약 2건은 유지됩니다"를 안내한다.

### 2.11 이용권 수기 조정 (홀딩 대체)

```
PATCH /api/admin/members/:id/tickets/:ticketId
{ "expiresAt": "2026-10-31", "totalCount": 22, "memo": "출장으로 2주 홀딩" }
```

`total_count`를 직접 수정하되 `ticket_usage` 원장은 건드리지 않는다. 잔여는 파생값이므로 자동 반영된다. 모든 수정은 감사 로그에 남긴다.

### 2.12 정책 설정 (ADMIN 전용)

```
GET   /api/admin/policy
PATCH /api/admin/policy
```

TDD 코어 2.2의 `policy` 테이블 15개 필드를 그대로 노출한다. 저장 시 교차 검증 위반은 필드별 에러로 반환한다.

```json
{
  "error": {
    "code": "ERR_POLICY_VALIDATION",
    "fields": {
      "cancel_deadline_minutes": "취소 마감은 폐강 기준 시각(120분)보다 짧을 수 없습니다."
    }
  }
}
```

### 2.13 통계

```
GET /api/admin/stats?from=2026-07-01&to=2026-07-31
```

```json
{
  "summary": { "reservations": 842, "attended": 771, "noShow": 39, "canceled": 32, "noShowRate": 4.6 },
  "byBranch": [
    { "branchName": "강남점", "reservations": 341, "attended": 318, "noShow": 15, "fillRate": 78.2 }
  ],
  "crossBranchMatrix": [
    { "memberBranch": "강남점", "classBranch": "성수점", "count": 23 }
  ],
  "byClass": [
    { "ticketTypeName": "1:4 기구 필라테스", "sessions": 62, "avgFillRate": 81.4 }
  ]
}
```

```
GET /api/admin/stats/export?from=&to=      → CSV 다운로드
```

정산 규칙은 없다. 교차 수강은 통계 조회로만 관리한다는 것이 고객 확정 사항이다.

---

## 3. 배치 명세 (개정)

> **개정 사유**: Vercel Hobby 플랜은 크론이 하루 1회로 제한되며, 더 잦은 표현식은 배포가 실패한다.
> 하루 1회조차 지정 시각의 정시가 아니라 해당 시간대 내 임의 시점에 실행된다.
> 따라서 **정합성을 배치에 의존하지 않는 lazy 구조**로 전환한다. 배치는 보조 수단이다.

### 3.1 원칙

모든 상태 판정은 요청 시점에 독립적으로 계산한다. 스케줄러가 멈춰도 데이터는 깨지지 않고
배정만 지연되어야 한다.

| 항목 | 판정 방식 | 배치 필요 여부 |
|---|---|---|
| 롤링 오픈 | 조회 조건 `starts_at::date <= 오늘 + rolling_open_days` | **불필요** |
| 대기 만료 | 확정 API가 `expires_at < now()` 직접 검사 후 거부 | 불필요 |
| 선차감 반환 | 잔여 계산식이 시작된 수업의 HOLD를 자동 제외 | 불필요 |
| 다음 순번 이관 | 요청 시점 트리거 + 스윕 | **보조 필요** |

**롤링 오픈은 배치를 폐기한다.** `class_schedule.opened_at` 컬럼도 제거하고 조회 조건으로 대체한다.
관리자 화면의 오픈 상태 표시도 동일 조건으로 계산한다.

**잔여 계산식 (TDD 코어 2.2 갱신)**

```sql
잔여 = ticket.total_count - (
  SELECT COUNT(*) FROM ticket_usage u
  LEFT JOIN class_schedule c ON c.id = u.class_schedule_id
  WHERE u.ticket_id = $1
    AND (
      u.status IN ('CONFIRMED', 'CONSUMED')
      OR (u.status = 'HOLD' AND (c.starts_at IS NULL OR c.starts_at > now()))
    )
)
```

HOLD 조건의 `starts_at > now()`가 이 구조 전체를 성립시킨다. 시작된 수업의 대기 건은
물리적 정리 전이라도 잔여에서 제외된다.

### 3.2 스윕 엔드포인트

물리적 정리와 다음 순번 이관을 단일 엔드포인트로 모은다.

```
POST /api/cron/sweep
Authorization: Bearer ${CRON_SECRET}
```

**수행 작업 (순서대로, 각 건 단위 트랜잭션)**

1. `OFFERED` 중 `expires_at <= now()` → `EXPIRED`, TicketUsage → `RELEASED`, `WAIT_EXPIRED` 알림
2. 시작 시각이 지난 수업의 `WAITING` → `RELEASED`, TicketUsage → `RELEASED`
3. 심야 구간이 아니면, 좌석이 비었고 `OFFERED`가 없는 수업의 1순위에게 `OFFERED` 부여 + `WAIT_OPEN` 알림
4. 처리 건수를 응답으로 반환

**멱등해야 한다.** 여러 번 호출해도 결과가 같아야 하며, 동시 호출 시 중복 배정이 없어야 한다.
3번은 대상 수업 행에 잠금을 걸고 처리한다.

```json
{ "expired": 2, "released": 5, "offered": 2, "durationMs": 340 }
```

### 3.3 호출 경로 (3중)

| 경로 | 주기 | 역할 |
|---|---|---|
| GitHub Actions | 5분 | 주 경로. 무료이며 Vercel 플랜과 무관 |
| Vercel Cron | 하루 1회 | 백스톱. `vercel.json`에 `0 15 * * *` (KST 00:00) |
| 요청 시점 lazy | 즉시 | 회원이 수업 상세·대기 목록 조회 시 해당 수업만 처리 |

Vercel Cron은 UTC로만 동작하므로 KST 변환이 필요하다. 하루 1회를 초과하는 표현식을 넣으면
배포가 실패한다.

**GitHub Actions 워크플로**

```yaml
name: sweep
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "$URL/api/cron/sweep" \
            -H "Authorization: Bearer $SECRET"
        env:
          URL: ${{ secrets.APP_URL }}
          SECRET: ${{ secrets.CRON_SECRET }}
```

GitHub Actions의 스케줄은 부하에 따라 지연될 수 있다. 정확한 시각을 보장하지 않으므로
정합성을 여기에 의존하지 않는다는 원칙이 유지되어야 한다.

### 3.4 심야 정지

별도 배치를 두지 않는다. 스윕 3번 단계에서 심야 구간이면 배정을 건너뛰므로,
07:00 이후 첫 스윕이 자연스럽게 재개 역할을 한다.

07:00 직후 배정되는 수업이 당일 오전 수업일 수 있으므로
`expires_at = min(now + timeout, starts_at)` 규칙이 반드시 적용되어야 한다.
---

## 4. 알림 발송부

### 4.1 인터페이스

```ts
type NotificationTemplate =
  | 'WAIT_OPEN' | 'WAIT_EXPIRED'
  | 'CLASS_CANCELED' | 'CLASS_CLOSED'
  | 'INSTRUCTOR_CHANGED' | 'BOOKING_BLOCKED'

interface NotificationSender {
  send(input: {
    memberId: string
    template: NotificationTemplate
    payload: Record<string, string>
  }): Promise<{ channel: string; status: 'SENT' | 'FAILED' }>
}
```

### 4.2 구현체

| 구현체 | 환경 | 동작 |
|---|---|---|
| `InAppSender` | MVP 기본 | `notification_log`에만 기록. 앱 알림함으로 노출 |
| `KakaoSender` | 템플릿 승인 후 | 알림톡 발송 + 로그 기록 |
| `SmsSender` | 폴백 | 알림톡 실패 시 대체 발송 |

**모든 구현체가 `notification_log`에 기록한다.** 앱 알림함은 채널과 무관하게 동작한다. 이 구조 덕에 알림톡 심사가 늦어져도 기능 검증이 가능하다.

### 4.3 문구 템플릿

렌더링 결과는 `rendered_text`에 저장한다. 회원 화면은 이 값을 그대로 출력한다.

| 코드 | 제목 | 본문 |
|---|---|---|
| WAIT_OPEN | 대기 자리가 배정되었습니다 | {date} {className} 자리가 나왔습니다. {deadline}까지 확정해 주세요. |
| WAIT_EXPIRED | 대기 순번이 지났습니다 | {date} 수업의 확정 시간이 지나 순번이 넘어갔습니다. 횟수 1회가 반환되었습니다. |
| CLASS_CLOSED | 수업이 폐강되었습니다 | {date} {className} 수업이 인원 미달로 폐강되었습니다. 횟수 1회가 복구되었습니다. |
| CLASS_CANCELED | 수업이 취소되었습니다 | {date} {className} 수업이 스튜디오 사정으로 취소되었습니다. 횟수 1회가 복구되었습니다. |
| INSTRUCTOR_CHANGED | 강사가 변경되었습니다 | {date} {className} 수업의 담당 강사가 {instructor} 강사로 변경되었습니다. |
| BOOKING_BLOCKED | 예약이 정지되었습니다 | 노쇼 {count}회 누적으로 {until}까지 신규 예약이 제한됩니다. 기존 예약의 취소는 가능합니다. |

폐강·수업 취소 알림은 **대기자에게도 발송한다.** 대기자용은 본문 말미를 "선차감된 횟수 1회가 반환되었습니다."로 치환한다.

---

## 5. 데이터 마이그레이션

### 5.1 통합 엑셀 양식

고객이 임의 양식을 보내면 이관이 불가능하다. **아래 양식을 정의해 배포한다.**

시트명 `회원`

| 컬럼 | 헤더 | 필수 | 형식 | 예시 |
|---|---|---|---|---|
| A | 지점 | O | 강남점 / 성수점 / 판교점 | 강남점 |
| B | 회원명 | O | 텍스트 | 김민서 |
| C | 휴대폰번호 | O | 숫자만 11자리 | 01012345678 |
| D | 수강권종류 | O | 1:1 개인레슨 / 1:4 기구 필라테스 / 요가 전용 | 1:4 기구 필라테스 |
| E | 총횟수 | O | 정수 | 20 |
| F | 잔여횟수 | O | 정수 | 6 |
| G | 만료일 | O | YYYY-MM-DD | 2026-09-30 |
| H | 하루한도 | | 정수, 공란이면 무제한 | 1 |
| I | 주간한도 | | 정수, 공란이면 무제한 | 3 |
| J | 비고 | | 텍스트 | |

한 회원이 이용권을 2개 이상 보유하면 행을 나눠 작성한다. A~C는 동일하게 반복한다.

### 5.2 변환 규칙

`총횟수`와 `잔여횟수`의 차이만큼 `ticket_usage`에 `CONSUMED` 레코드를 생성한다. `class_schedule_id`는 NULL을 허용하고 `is_migrated = true` 플래그를 둔다. 이관 시점에 과거 수강 이력은 알 수 없으므로 소진 사실만 기록하는 방식이다.

```
ticket.total_count = 총횟수
ticket_usage(CONSUMED) × (총횟수 - 잔여횟수)
→ 시스템 계산 잔여 = 잔여횟수
```

### 5.3 검증 리포트

```
POST /api/admin/migration/validate   (파일 업로드)
POST /api/admin/migration/execute
```

`validate`는 DB에 쓰지 않고 결과만 반환한다.

| 검증 항목 | 처리 |
|---|---|
| 필수 컬럼 누락 | 오류 — 행 번호 표시 |
| 휴대폰 형식 불일치 | 오류 |
| 휴대폰 중복 (파일 내) | 오류 — 중복 행 쌍 표시 |
| 지점명·수강권명 불일치 | 오류 — 허용값 안내 |
| 잔여 > 총횟수 | 오류 |
| 만료일 과거 | 경고 — 이관은 하되 즉시 만료 상태 |
| 잔여 0 | 경고 |
| 한도 미기재 | 경고 — 무제한으로 처리 |

```json
{
  "totalRows": 1213,
  "validRows": 1198,
  "errors": [ { "row": 47, "column": "휴대폰번호", "message": "숫자 11자리가 아닙니다", "value": "010-1234-5678" } ],
  "warnings": [ { "row": 102, "column": "만료일", "message": "이미 지난 날짜입니다", "value": "2026-06-30" } ],
  "summary": { "byBranch": { "강남점": 402, "성수점": 398, "판교점": 398 }, "byTicketType": { "1:1 개인레슨": 121, "1:4 기구 필라테스": 702, "요가 전용": 375 } }
}
```

**오류가 1건이라도 있으면 `execute`를 차단한다.** 부분 이관은 대조 작업을 더 어렵게 만든다.

### 5.4 이관 후 대조

`execute` 성공 시 지점별 집계표를 출력한다. 매니저가 자기 지점 엑셀 원본과 인원수·총 잔여횟수 합계를 대조하는 용도이다.

---

## 6. 테스트 시나리오

이 프로젝트의 핵심 가치가 정합성이므로 아래 시나리오를 자동화 테스트로 남긴다.

### 6.1 동시성

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| C-01 | 잔여 1석에 동시 10건 예약 요청 | 성공 1건, 나머지 `ERR_CLASS_FULL`. `reserved_count == capacity` |
| C-02 | 동일 회원이 같은 수업에 동시 5건 요청 | 성공 1건, 나머지 `ERR_DUPLICATE_RESERVATION` |
| C-03 | 잔여 1회 회원이 서로 다른 2개 수업에 동시 요청 | 성공 1건, 나머지 `ERR_NO_REMAINING_COUNT` |
| C-04 | 예약 취소와 대기 배정이 동시 발생 | 좌석 수 음수 불가, OFFERED 중복 부여 없음 |
| C-05 | 폐강 실행과 타임아웃 스캐너 동시 실행 | TicketUsage RELEASED 중복 생성 없음 |

### 6.2 횟수 정합성

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| T-01 | 대기 등록 → 자진 취소 | 잔여 원복 |
| T-02 | 대기 등록 → 타임아웃 | 잔여 원복 + 다음 순번 OFFERED |
| T-03 | 대기 등록 → 확정 | 잔여 변화 없음, 상태만 CONFIRMED |
| T-04 | 대기 3건 등록 (주 3회 한도) | 4번째 등록 시 `ERR_WEEKLY_LIMIT_EXCEEDED` |
| T-05 | 예약 → 마감 전 취소 | 잔여 원복 |
| T-06 | 예약 → 마감 후 취소 | 잔여 차감 유지, 노쇼 카운트 미증가 |
| T-07 | 예약 → 노쇼 처리 | 잔여 차감 유지, 노쇼 카운트 +1 |
| T-08 | 폐강 | 예약자·대기자 전원 잔여 원복 |
| T-09 | 임의 시나리오 100회 후 원장 합계 검증 | `total - COUNT(HOLD,CONFIRMED,CONSUMED)` == 실제 잔여 |

### 6.3 시간 경계

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| D-01 | 22:59 좌석 반환 | 즉시 OFFERED |
| D-02 | 23:00 좌석 반환 | 배정 보류, 07:00 재개 |
| D-03 | 06:59 좌석 반환 | 배정 보류 |
| D-04 | 수업 3시간 1분 전 배정 | 타임아웃 30분 |
| D-05 | 수업 2시간 59분 전 배정 | 타임아웃 10분 |
| D-06 | 일요일 23:00 예약 | 해당 주차에 집계 |
| D-07 | 월요일 00:01 예약 | 다음 주차에 집계 |
| D-08 | 07:00 시작 수업에 06:50 좌석 반환 | 심야 정지 해제 직후이며 3시간 이내이므로 10분 타임아웃. 단 수업 시작 시각을 넘기지 않도록 `expires_at = min(now+10분, starts_at)` |

### 6.4 권한

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| P-01 | A지점 매니저가 B지점 수업 조회 | 403 |
| P-02 | A지점 매니저가 A지점 수업의 B지점 회원 조회 | 마스킹 응답 (이름·뒷4자리·잔여) |
| P-03 | A지점 매니저가 B지점 회원 직접 조회 | 403 |
| P-04 | MANAGER가 정책 설정 접근 | 403 |
| P-05 | 대리 예약으로 한도 초과 시도 | 회원 직접 예약과 동일하게 거부 |

---

## 7. 남은 결정 사항

구현 중 확정한다. 고객 확인이 필요한 사항은 아니다.

- 대기 순번 표시를 `sequence` 원값으로 할지, 앞선 이탈 건을 제외한 유효 순번으로 환산할지
- 관리자 감사 로그의 보관 범위 (현재는 이용권 수기 조정만 필수)
- CSV 인코딩 (엑셀 호환을 위해 UTF-8 BOM 권장)
- 대리 예약 시 회원에게 알림을 보낼지 여부