import { errorResponse, AppError } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { cancelMemberReservation } from "@/services/reservation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    const scope = await requireMemberScope();
    return Response.json(await cancelMemberReservation(scope.memberId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
