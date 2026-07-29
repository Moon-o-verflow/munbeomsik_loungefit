import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { createProxyBooking } from "@/services/proxy-booking";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const memberId = typeof body === "object" && body !== null ? (body as { memberId?: unknown }).memberId : undefined;
    const scheduleId = typeof body === "object" && body !== null ? (body as { scheduleId?: unknown }).scheduleId : undefined;
    if (!isUuid(memberId) || !isUuid(scheduleId)) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await createProxyBooking(await requireAdminScope(), memberId, scheduleId), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
