import { errorResponse, AppError } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { createMemberReservation } from "@/services/reservation";
import { getMemberReservations } from "@/services/schedule";

export async function GET() {
  try {
    const scope = await requireMemberScope();
    return Response.json(await getMemberReservations(scope.memberId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const scheduleId = typeof body === "object" && body !== null ? (body as { scheduleId?: unknown }).scheduleId : undefined;
    if (!isUuid(scheduleId)) throw new AppError("ERR_CLASS_CLOSED");
    const scope = await requireMemberScope();
    return Response.json(await createMemberReservation(scope.memberId, scheduleId), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
