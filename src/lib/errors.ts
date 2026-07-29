export const ERROR_DEFINITIONS = {
  ERR_MEMBER_SUSPENDED: {
    status: 403,
    message: "예약이 정지된 상태입니다. 자세한 내용은 데스크로 문의해 주세요.",
  },
  ERR_CLASS_NOT_OPEN: { status: 409, message: "아직 예약이 열리지 않은 수업입니다." },
  ERR_CLASS_CLOSED: { status: 409, message: "진행되지 않는 수업입니다." },
  ERR_CLASS_STARTED: { status: 409, message: "이미 시작된 수업은 예약할 수 없습니다." },
  ERR_TICKET_TYPE_MISMATCH: {
    status: 409,
    message: "보유하신 수강권으로는 예약할 수 없는 수업입니다.",
  },
  ERR_TICKET_EXPIRED: {
    status: 409,
    message: "이용권 만료일 이후의 수업은 예약할 수 없습니다.",
  },
  ERR_NO_REMAINING_COUNT: { status: 409, message: "남은 횟수가 없습니다." },
  ERR_DAILY_LIMIT_EXCEEDED: {
    status: 409,
    message: "하루 예약 가능 횟수를 모두 사용하셨습니다.",
  },
  ERR_WEEKLY_LIMIT_EXCEEDED: {
    status: 409,
    message: "이번 주 예약 가능 횟수를 모두 사용하셨습니다.",
  },
  ERR_DUPLICATE_RESERVATION: { status: 409, message: "이미 예약하신 수업입니다." },
  ERR_CLASS_FULL: {
    status: 409,
    message: "정원이 마감되었습니다. 대기 등록을 이용해 주세요.",
  },
  ERR_MEMBER_NOT_FOUND: {
    status: 404,
    message: "등록된 회원 정보를 찾을 수 없습니다. 데스크로 문의해 주세요.",
  },
  ERR_INVALID_CODE: { status: 400, message: "인증번호가 올바르지 않습니다." },
  ERR_CODE_EXPIRED: {
    status: 400,
    message: "인증번호가 만료되었습니다. 다시 요청해 주세요.",
  },
  ERR_RESERVATION_NOT_FOUND: { status: 404, message: "예약 정보를 찾을 수 없습니다." },
  ERR_UNAUTHORIZED: { status: 401, message: "다시 로그인해 주세요." },
  ERR_WAITLIST_DUPLICATE: { status: 409, message: "이미 대기 중인 수업입니다." },
  ERR_WAITLIST_NOT_APPLICABLE: { status: 409, message: "아직 자리가 남아 있어 대기 등록이 필요하지 않습니다." },
  ERR_OFFER_EXPIRED: { status: 410, message: "확정 시간이 지나 순번이 다음 대기자에게 넘어갔습니다." },
  ERR_FORBIDDEN: { status: 403, message: "해당 작업을 수행할 권한이 없습니다." },
  ERR_INVALID_REQUEST: { status: 400, message: "입력값이 올바르지 않습니다." },
  ERR_SCHEDULE_HAS_RESERVATION: {
    status: 409,
    message: "확정 예약이 있는 수업은 삭제할 수 없습니다. 폐강 또는 수업 취소 기능을 이용해 주세요.",
  },
  ERR_CLASS_NOT_STARTED: { status: 409, message: "수업 시작 전에는 출석 또는 노쇼 처리할 수 없습니다." },
  ERR_ATTENDANCE_REVERT_EXPIRED: {
    status: 409,
    message: "출석 처리는 수업 종료 후 24시간 이내에만 되돌릴 수 있습니다.",
  },
  ERR_POLICY_VALIDATION: { status: 400, message: "정책 값이 올바르지 않습니다." },
} as const;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly meta?: Record<string, number | string | boolean>;

  constructor(code: ErrorCode, meta?: Record<string, number | string | boolean>) {
    super(ERROR_DEFINITIONS[code].message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_DEFINITIONS[code].status;
    this.meta = meta;
  }
}

export class PolicyValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super(ERROR_DEFINITIONS.ERR_POLICY_VALIDATION.message);
    this.name = "PolicyValidationError";
    this.fields = fields;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof PolicyValidationError) {
    return Response.json({ error: { code: "ERR_POLICY_VALIDATION", fields: error.fields } }, { status: 400 });
  }
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message, ...(error.meta ? { meta: error.meta } : {}) } },
      { status: error.status },
    );
  }

  console.error(error);
  return Response.json(
    { error: { code: "ERR_UNAUTHORIZED", message: ERROR_DEFINITIONS.ERR_UNAUTHORIZED.message } },
    { status: 500 },
  );
}
