<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
## 0. Next.js 16 주의

이 프로젝트는 Next.js 16이다. App Router API가 이전 버전과 다를 수 있다.
라우트 핸들러, `cookies()`, `headers()`, 동적 파라미터 시그니처를 쓰기 전에
`node_modules/next/dist/docs/` 해당 문서를 먼저 확인한다. 기억에 의존하지 않는다.


# AGENTS.md — 라운지핏 예약 플랫폼

## 프로젝트

필라테스·요가 스튜디오 체인 "라운지핏"의 회원·수업 예약 플랫폼.
3개 지점, 회원 약 1,200명. 회원 모바일 웹과 관리자 웹을 단일 Next.js 앱으로 운영한다.

## 문서 우선순위

작업 시작 전 아래를 읽는다. 추측하지 말고 문서를 근거로 구현한다.

| 순위 | 문서 | 범위 |
|---|---|---|
| 1 | `AGENTS.md` (이 파일) | 절대 규칙. 아래 문서와 충돌하면 **이 파일이 우선한다** |
| 2 | `docs/TDD-core.md` | 스택, ERD, 상태 머신, 인증, 시간 규칙, 에러 코드, 회원 API |
| 3 | `docs/TDD-extended.md` | 관리자 API, 배치, 알림, 마이그레이션, 테스트 시나리오 |
| 4 | `docs/PRD.md` | 요구사항, 범위, 결정 근거 |

TDD 문서에 남아 있는 "1분 주기 스캐너" 등 배치 관련 서술은 **이 파일의 규칙 3으로 대체되었다.**
문서가 모호하거나 서로 충돌하면 임의로 결정하지 말고 질문한다.

## 기술 스택

- Next.js 15 (App Router) / TypeScript strict
- Neon Serverless Postgres / Prisma
- Tailwind CSS
- 자체 JWT 인증 (httpOnly 쿠키)
- 배포 Vercel **Hobby(무료) 플랜** — 아래 규칙 3의 제약 원인
- **Redis 등 캐시 계층을 도입하지 않는다**

## 명령어

```bash
npm run dev                      # 개발 서버
npm run build                    # 빌드 검증
npm run lint                     # ESLint
npm run test                     # 테스트 (vitest)
npx prisma migrate dev --name X  # 스키마 변경 (db push 금지)
npx prisma studio                # 데이터 확인
npm run seed                     # 시드 데이터 주입
```

## 디렉터리

```
src/app/(member)/     회원 모바일 웹
src/app/(admin)/      관리자 웹
src/app/api/          API 라우트
src/lib/db.ts         Prisma 클라이언트 싱글턴
src/lib/auth.ts       JWT 발급·검증
src/lib/scope.ts      지점 권한 스코프
src/lib/time.ts       KST 시간 유틸
src/lib/errors.ts     에러 코드 정의
src/lib/policy.ts     정책값 조회
src/services/         비즈니스 로직 (트랜잭션 단위)
prisma/schema.prisma
```

API 라우트에 비즈니스 로직을 직접 쓰지 않는다. 라우트는 입력 검증과 응답 직렬화만 담당하고
로직은 `src/services/`에 둔다.

---

# 절대 규칙

이 프로젝트의 핵심 가치는 **예약·횟수 정합성**이다. 아래를 위반하면 안 된다.

## 1. 이용권 잔여 횟수를 컬럼으로 증감하지 않는다

`ticket_usage` 원장에 상태(HOLD / CONFIRMED / CONSUMED / RELEASED)를 기록하고
잔여는 파생값으로 계산한다. `remainingCount--` 같은 코드를 쓰지 않는다.

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

**HOLD 조건에 `starts_at > now()`가 반드시 들어간다.** 수업이 이미 시작된 대기 건은
배치가 정리하기 전이라도 잔여에서 제외되어야 한다. 이 조건이 규칙 3을 성립시킨다.

`RELEASED`는 종착 상태다. 재사용하지 않고 항상 새 레코드를 만든다.

## 2. 좌석 확정은 트랜잭션 + 행 잠금으로만 처리한다

**Prisma 쿼리 API는 행 잠금을 지원하지 않는다.** 반드시 `$queryRaw`로 직접 건다.

```ts
await prisma.$transaction(async (tx) => {
  const [schedule] = await tx.$queryRaw<Schedule[]>`
    SELECT id, capacity, reserved_count, status, starts_at
    FROM class_schedule
    WHERE id = ${scheduleId}::uuid
    FOR UPDATE
  `
  if (schedule.reserved_count >= schedule.capacity) throw new AppError('ERR_CLASS_FULL')
  // ticket_usage 생성 → reservation 생성 → reserved_count 증가
})
```

`findUnique` + `update` 조합은 잠금이 아니다. 이렇게 짜지 않는다.
부분 유니크 인덱스는 애플리케이션 로직의 대체물이 아니라 이중 방어다. 둘 다 둔다.

## 3. 배치에 정합성을 의존하지 않는다 (lazy 우선)

**Vercel Hobby 플랜은 크론이 하루 1회로 제한되며, 더 잦은 표현식은 배포 자체가 실패한다.**
하루 1회조차 지정 시각의 정시가 아니라 해당 시간대 내 임의 시점에 실행된다.
따라서 **모든 상태 판정은 요청 시점에 독립적으로 계산한다.** 배치는 보조 수단일 뿐이다.

| 항목 | 잘못된 방식 | 이 프로젝트의 방식 |
|---|---|---|
| 롤링 오픈 | 배치가 `opened_at`을 채움 | **배치 없음.** 조회 조건으로 판정: `starts_at::date <= 오늘 + rolling_open_days` |
| 대기 만료 | 스캐너가 EXPIRED로 바꿔야 확정 불가 | 확정 API가 `expires_at < now()`를 직접 검사해 거부 |
| 선차감 반환 | 스캐너가 RELEASED로 바꿔야 잔여 복구 | 규칙 1의 계산식이 시작된 수업의 HOLD를 자동 제외 |
| 다음 순번 이관 | 1분 스캐너에만 의존 | 요청 시점 트리거 + 외부 스케줄러 병행 |

### 스윕 엔드포인트

물리적 상태 정리와 다음 순번 이관은 단일 엔드포인트로 모은다.

```
POST /api/cron/sweep     # Authorization: Bearer ${CRON_SECRET}
```

수행 작업: 만료된 OFFERED를 EXPIRED로 전이 → HOLD를 RELEASED로 → 심야 구간이 아니면
다음 순번에 OFFERED 부여 → 시작된 수업의 잔여 WAITING 정리.

**멱등해야 한다.** 여러 번 호출해도 결과가 같아야 한다.

### 호출 경로 (3중)

1. **외부 스케줄러** — GitHub Actions 워크플로에서 5분 주기 호출 (주 경로)
2. **Vercel Cron** — `vercel.json`에 하루 1회만 등록 (백스톱). 하루 1회를 초과하는 표현식 금지
3. **요청 시점 트리거** — 회원이 수업 상세·대기 목록을 조회할 때 해당 수업에 한해 lazy 실행

스케줄러가 멈춰도 데이터는 깨지지 않고 배정만 지연되어야 한다. 이 성질이 유지되지 않는
구현은 잘못된 것이다.

## 4. 대기열은 등록 시점 선차감이다

대기 등록 시 `HOLD`를 만든다. 잔여가 없으면 대기 등록 자체를 거부한다.
확정 시점 차감으로 바꾸지 않는다. 근거는 `docs/PRD.md` 12장에 있다.

## 5. 대기 배정은 한 번에 한 명에게만 한다

좌석이 3개 비어도 1순위 1명에게만 `OFFERED`를 부여한다. 동시 다중 배정 금지.

## 6. 시간은 전부 KST 기준이다

- 저장은 `timestamptz`, 연산·표시는 `Asia/Seoul` 고정. 사용자 로컬 타임존을 쓰지 않는다
- 주 경계는 월요일 00:00 ~ 일요일 24:00
- 클라이언트 시계를 신뢰하지 않는다. 카운트다운은 서버가 `remainingSeconds`를 내려준다
- **Vercel Cron은 UTC로만 동작한다.** KST 00:00은 `0 15 * * *`(전일 15:00 UTC)이다
- 대기 만료 시각은 수업 시작을 넘지 않는다: `expires_at = min(now + timeout, starts_at)`

## 7. 지점 권한은 공통 스코프 레이어로만 건다

라우트에서 `branchId` 조건을 직접 쓰지 않는다. `src/lib/scope.ts`를 경유한다.
Neon에는 RLS가 없으므로 이 레이어 누락이 곧 정보 유출이다.

## 8. 타 지점 회원은 마스킹한다

응답 직렬화 시점에 `member.branchId !== scope.branchId`이면 이름·뒷4자리·잔여만 내려준다.
화면에서 가리지 않는다.

## 9. 대리 예약도 검증을 우회하지 않는다

매니저 대리 예약은 회원 직접 예약과 완전히 동일한 검증을 거친다.
한도·만료일·정지 상태를 우회할 수 없다. 예외가 필요하면 이용권 수기 조정 기능을 쓴다.

## 10. 에러 코드와 문구는 문서 정의를 그대로 쓴다

`docs/TDD-core.md` 6장의 코드와 문구를 임의로 만들거나 바꾸지 않는다.
프론트엔드는 서버가 준 `message`를 그대로 출력하고 문구를 지어내지 않는다.

## 11. 정책값을 하드코딩하지 않는다

취소 마감, 타임아웃, 심야 구간, 폐강 기준, 노쇼 임계 등 15개 항목은 `policy` 테이블에서 읽는다.
상수로 박지 않는다.

## 12. 디자인 스펙

`design/DESIGN.md`가 디자인 토큰이다. 색상·타이포·컴포넌트 규칙을
`tailwind.config.ts`에 등록하고 클래스로만 사용한다. 하드코딩 금지.

`design/screens-member.md` / `screens-admin.md`는 화면별 구현 스펙이다.
"~를 디자인한다"는 문장은 이미지 생성 지시가 아니라 **해당 화면을 그렇게 구현하라는 뜻**이다.
큰따옴표로 감싼 한국어 문구는 확정값이므로 그대로 쓴다.

화면을 만들기 전에 공용 컴포넌트를 먼저 만든다:
Button / Badge / Card / BottomSheet / Modal / TabBar / DataTable / EmptyState

---

# 작업 방식

## 계획 우선

- **큰 작업은 먼저 계획을 제시하고 승인을 받은 뒤 실행한다.** 계획 없이 대량 파일을 생성하지 않는다
- `--full-auto` 모드로 실행 중이더라도 이 원칙은 유지한다. 자동 승인은 파일 쓰기 권한일 뿐
  설계 판단을 위임한 것이 아니다
- 규칙 1~11에 영향을 주는 판단이 필요하면 **진행을 멈추고 질문한다.** 스스로 결정하지 않는다
- 한 번에 하나의 Phase만 진행한다
- 스키마 변경은 `prisma migrate dev`로 이력을 남긴다. `db push`를 쓰지 않는다
- 커밋은 Phase 단위로 나눈다

## 구현 순서

당일 배포가 목표다. 시간이 부족하면 **Phase 1·2를 완성하고 3·4를 축소한다.**
Phase 1·2가 미완인 채 3·4를 건드리지 않는다.

| Phase | 범위 | 우선도 |
|---|---|---|
| 1 | 인증, 시드, 시간표 조회, 예약·취소, TicketUsage 원장, 검증 11단계 | 필수 |
| 2 | 대기열 선차감 등록, 좌석 반환, 순차 배정, 만료 판정, 심야 정지, 스윕 | 필수 |
| 3 | 시간표 등록, 대리 예약, 출석·노쇼, 폐강, 수업 취소, 대체 강사, 예약 정지 | 높음 |
| 4 | 정책 화면, 지점 분리·마스킹, 알림 인터페이스, 통계, 데이터 이관 | 여유 시 |

## 테스트

`docs/TDD-extended.md` 6장 시나리오 중 아래를 최우선으로 자동화한다.

- C-01 잔여 1석에 동시 10건 요청
- C-03 잔여 1회 회원의 동시 2건 요청
- T-02 대기 등록 후 타임아웃 시 잔여 원복
- T-09 임의 시나리오 100회 후 원장 합계 검증
- D-08 07:00 시작 수업에 06:50 배정 시 만료 시각이 수업 시작을 넘지 않을 것

## 마지막 단계

모든 Phase 종료 후 `README.md`를 작성한다. 제출물이므로 아래를 포함한다.

- 실행 방법 (환경 변수, 마이그레이션, 시드, 개발 서버)
- 라이브 URL
- 핵심 의사결정 요약 — 특히 원장 방식, 선차감, lazy 배치 구조를 택한 이유
- 알려진 제약 (알림 mock 동작, Hobby 크론 제약과 외부 스케줄러 병행)

**README는 마지막에 한 번만 작성한다.** 중간에 미리 만들지 않는다.

---

# 하지 말아야 할 것

- 문서에 없는 기능을 임의로 추가하지 않는다 (앱 내 결제, 태블릿 출석, 강사 화면은 2차 범위)
- 사용자 노출 문구를 지어내지 않는다
- 정합성을 위해 필요한 트랜잭션을 성능을 이유로 생략하지 않는다
- 마이그레이션 시 오류 행을 건너뛰고 부분 이관하지 않는다
- `vercel.json`에 하루 1회를 초과하는 크론 표현식을 넣지 않는다 (배포 실패)
- `any` 사용 금지. 불가피하면 주석으로 사유를 남긴다