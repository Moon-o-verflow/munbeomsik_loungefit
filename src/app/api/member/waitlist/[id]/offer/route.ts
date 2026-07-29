import { AppError, errorResponse } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { getMemberWaitlistOffer } from "@/services/waitlist";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new AppError("ERR_OFFER_EXPIRED");
    const scope = await requireMemberScope();
    return Response.json(await getMemberWaitlistOffer(scope.memberId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
