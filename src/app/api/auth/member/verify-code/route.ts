import { setMemberSessionCookie } from "@/lib/auth";
import { errorResponse, AppError } from "@/lib/errors";
import { isPhone, isSixDigitCode } from "@/lib/validation";
import { verifyMemberAuthCode } from "@/services/member-auth";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const record = typeof body === "object" && body !== null ? (body as { phone?: unknown; code?: unknown }) : {};
    if (!isPhone(record.phone) || !isSixDigitCode(record.code)) throw new AppError("ERR_INVALID_CODE");
    const token = await verifyMemberAuthCode(record.phone, record.code);
    await setMemberSessionCookie(token);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
