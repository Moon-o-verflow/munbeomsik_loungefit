import { AppError, errorResponse } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { createMemberWaitlist } from "@/services/waitlist";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const scheduleId = typeof body === "object" && body !== null ? (body as { scheduleId?: unknown }).scheduleId : undefined;
    if (!isUuid(scheduleId)) throw new AppError("ERR_CLASS_CLOSED");
    const scope = await requireMemberScope();
    return Response.json(await createMemberWaitlist(scope.memberId, scheduleId), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
