import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { getAdminMemberDetail } from "@/services/admin-members";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await getAdminMemberDetail(await requireAdminScope(), id));
  } catch (error) {
    return errorResponse(error);
  }
}
