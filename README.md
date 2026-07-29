# 라운지핏

필라테스·요가 스튜디오 체인의 회원 예약과 관리자 운영을 하나의 Next.js 16 앱으로 제공합니다.

## 라이브 URL

[https://munbeomsik-loungefit.vercel.app/login](https://munbeomsik-loungefit.vercel.app/login)

## 실행 방법

Node.js 20 이상과 Neon Postgres가 필요합니다. `.env.example`을 `.env`로 복사한 뒤 다음 값을 설정합니다. 비밀값은 저장소에 커밋하지 않습니다.

| 변수 | 사용처 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 런타임·시드 | Neon **pooled** URL. PrismaClient의 Neon 어댑터가 이 주소만 사용합니다. |
| `DIRECT_URL` | Prisma CLI | 마이그레이션 전용 direct URL. Vercel 런타임에는 넣지 않습니다. |
| `JWT_SECRET` | 런타임 | 충분히 긴 임의 문자열 |
| `CRON_SECRET` | 스윕 API·외부 스케줄러 | Bearer 토큰 검증값 |
| `SMS_PROVIDER=mock` | 개발·시연 | 실제 SMS 대신 고정 인증번호를 사용합니다. |
| `DEV_LOGIN_CODE=000000` | 개발·시연 | mock SMS일 때의 로그인 인증번호 |
| `ADMIN_SEED_PASSWORD` | 시드 실행 때만 | 관리자 시연 계정 비밀번호 |
| `TEST_DATABASE_URL`, `TEST_DIRECT_URL` | 통합 테스트 | 운영/Preview와 분리된 전용 테스트 DB URL |

```powershell
npm install
npx prisma migrate dev --name <migration-name> # 스키마를 변경할 때만
npm run seed
npm run dev
```

이미 존재하는 개발 DB에 커밋된 마이그레이션만 반영할 때는 `npx prisma migrate deploy`를 사용합니다. `prisma db push`는 사용하지 않습니다.

### 테스트 DB와 자동화 테스트

통합 테스트는 데이터를 매번 삭제하므로 `TEST_DATABASE_URL`과 `TEST_DIRECT_URL`이 운영·Preview·개발 DB와 반드시 달라야 합니다.

```powershell
$env:DIRECT_URL = $env:TEST_DIRECT_URL
npx prisma migrate deploy
npm run test
```

`tests/setup.ts`가 테스트 실행 시에만 `DATABASE_URL`을 `TEST_DATABASE_URL`로 바꿉니다. 테스트는 자체 fixture를 생성하므로 운영 시드 데이터에 의존하지 않습니다.

## 테스트 케이스

아래 P0 케이스는 `npm run test`에서 실행됩니다. `TEST_DATABASE_URL`이 없으면 통합 테스트 스위트는 안전하게 skip됩니다.

| ID | 실행 파일 | 검증 내용 |
| --- | --- | --- |
| C-01 | `reservation-concurrency.test.ts` | 잔여 1석에 10건 동시 예약: 정확히 1건만 성공하고 좌석 수가 정원을 넘지 않는다. |
| C-02 | `reservation-concurrency.test.ts` | 같은 회원의 동일 수업 5건 동시 요청: 예약은 1건만 남는다. |
| C-03 | `reservation-concurrency.test.ts` | 잔여 1회로 서로 다른 수업 2건 동시 예약: 1건만 성공한다. |
| T-02 | `waitlist.test.ts` | OFFER 만료 후 HOLD가 RELEASED로 바뀌고 다음 대기자 한 명만 OFFERED가 된다. |
| D-08 | `waitlist.test.ts` | 07:00 수업의 06:50 배정은 만료 시각을 수업 시작 시각으로 제한한다. |
| T-09 | `waitlist.test.ts` | 예약·취소·대기·스윕 100회 혼합 뒤에도 원장 계산 잔여가 음수가 아니며 계산식과 일치한다. |
| 관리자 핵심 | `admin-operations.test.ts` | 지점 스코프, 대리 예약, 출석/노쇼, 폐강·수업 취소의 원장 복구를 검증한다. |

## 시연 데이터와 수동 확인

`npm run seed`는 실행 대상의 기존 데이터를 모두 지우고 시연 데이터를 다시 만듭니다. 운영 DB에는 `NODE_ENV=production`, `ALLOW_SEED=true`, `ADMIN_SEED_PASSWORD`가 모두 있어야만 실행됩니다. 시드가 끝나면 `ALLOW_SEED`를 제거합니다.

| 로그인 | 역할·상태 | 확인할 내용 |
| --- | --- | --- |
| `01011110001` / `000000` | 정상 회원 | 수업 예약과 마감 전 취소 |
| `01011110004` / `000000` | 예약 정지 회원 | 신규 예약 거부, 기존 예약 취소 가능 |
| `01011110008` / `000000` | 대기 OFFER 회원 | 예약 확정 화면과 서버 기준 카운트다운 |
| `manager_gangnam` / `ADMIN_SEED_PASSWORD` | 강남점 매니저 | 시간표·대기자·대리 예약·출석·폐강 |
| `manager_seongsu` / `ADMIN_SEED_PASSWORD` | 성수점 매니저 | 강남점 권한 차단과 교차 수강 회원 마스킹 |
| `admin` / `ADMIN_SEED_PASSWORD` | 중앙 관리자 | 정책 설정과 통계 |

시드는 상대 날짜로 아래 상태를 만들므로, 다시 시드해도 과거 수업만 남아 화면이 비는 일을 피합니다.

- 가장 가까운 미래 강남 19:00 필라테스: 8/8 예약, 교차 수강 2명, WAITING 2명
- 가장 가까운 미래 강남 10:00 필라테스: OFFERED 1건과 25분 카운트다운
- 종료된 수업의 미처리 예약, 노쇼 이력, 정지 회원의 기존 미래 예약
- 미래 수업의 부분 예약과 과거 교차 수강 이력: 관리자 통계·마스킹 확인용

알림은 현재 영속 로그나 실제 채널이 아닌 `NotificationSender` mock입니다. 따라서 알림함·발송 이력 시연 데이터는 만들지 않습니다.

## 운영 반영

마이그레이션은 direct URL로 한 번 실행하고, 런타임과 시드는 pooled URL을 사용합니다. 다음은 PowerShell 예시입니다.

```powershell
# 1. DIRECT_URL로 커밋된 마이그레이션만 적용
npx prisma migrate deploy

# 2. 빈/폐기 가능한 DB에서만 시드 (DATABASE_URL은 pooled URL)
$env:NODE_ENV = "production"
$env:ALLOW_SEED = "true"
npm run seed
Remove-Item Env:ALLOW_SEED

# 3. main push 후 Vercel Production 배포 확인
git push origin main
```

Vercel Production 환경에는 `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `SMS_PROVIDER`, `DEV_LOGIN_CODE`를 넣습니다. `DIRECT_URL`은 로컬 또는 별도 migration CI의 Prisma CLI 전용입니다. GitHub Actions의 5분 스윕에는 `APP_URL`과 `CRON_SECRET` secret을 설정합니다. `vercel.json`은 Hobby 제한을 지키는 하루 1회 UTC 백스톱(`0 15 * * *`)만 등록합니다.

## 핵심 의사결정

- **원장 기반 횟수 관리**: 이용권의 잔여 횟수는 `TicketUsage`의 `CONFIRMED`·`CONSUMED`와 시작 전 `HOLD`에서 파생합니다. 잔여 컬럼을 직접 증감하지 않으므로 취소·만료·폐강이 겹쳐도 이중 반환을 막습니다.
- **대기 등록 시 선차감**: 대기 순간 `HOLD`를 생성합니다. 좌석을 받았을 때 다시 차감하지 않아 확정 단계가 단순하고, 잔여가 없는 회원의 대기 등록을 처음부터 막습니다.
- **행 잠금과 고정 순서**: 좌석 확정 트랜잭션은 `class_schedule → ticket` 순서로 `FOR UPDATE` 잠금을 잡고, 부분 유니크 인덱스를 추가 방어선으로 둡니다.
- **lazy 우선 스윕**: 롤링 오픈·대기 만료·HOLD 잔여 판정은 요청 시점 계산만으로 정합합니다. 외부 5분 스케줄러, Vercel 하루 1회 Cron, 상세 조회 lazy 트리거는 물리적 상태 정리와 알림 지연을 줄이는 보조 경로입니다.
- **지점 스코프**: 모든 관리자 조회와 변경은 공통 스코프 레이어를 통과합니다. 교차 수강은 허용하되 타 지점 회원의 이름·전화번호는 서버 직렬화 단계에서 마스킹합니다.

## 알려진 제약

- SMS·카카오 알림은 mock 인터페이스이며 실제 발송과 영속 알림함은 연동 대상이 아닙니다.
- Vercel Hobby Cron은 하루 한 번만 안정적으로 쓸 수 있으므로 GitHub Actions 등 외부 5분 스케줄러를 함께 설정해야 합니다.
- CSV 기반 기존 고객 데이터 이관과 통계 CSV 내려받기는 이번 범위에서 제외했습니다.
