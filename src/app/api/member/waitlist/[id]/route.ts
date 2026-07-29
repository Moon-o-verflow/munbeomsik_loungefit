import { AppError, errorResponse } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { cancelMemberWaitlist } from "@/services/waitlist";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new AppError("ERR_OFFER_EXPIRED");
    const scope = await requireMemberScope();
    return Response.json(await cancelMemberWaitlist(scope.memberId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
