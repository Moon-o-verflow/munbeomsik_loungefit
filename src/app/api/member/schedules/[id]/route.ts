import { errorResponse, AppError } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { getMemberScheduleDetail } from "@/services/schedule";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new AppError("ERR_CLASS_CLOSED");
    const scope = await requireMemberScope();
    return Response.json(await getMemberScheduleDetail(scope.memberId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
