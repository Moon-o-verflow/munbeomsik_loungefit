import { errorResponse, AppError } from "@/lib/errors";
import { isPhone } from "@/lib/validation";
import { requestMemberAuthCode } from "@/services/member-auth";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const phone = typeof body === "object" && body !== null ? (body as { phone?: unknown }).phone : undefined;
    if (!isPhone(phone)) throw new AppError("ERR_MEMBER_NOT_FOUND");
    return Response.json(await requestMemberAuthCode(phone));
  } catch (error) {
    return errorResponse(error);
  }
}
