import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { getAdminClosePreview } from "@/services/admin-schedules";
import { isUuid } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await getAdminClosePreview(await requireAdminScope(), id));
  } catch (error) {
    return errorResponse(error);
  }
}
