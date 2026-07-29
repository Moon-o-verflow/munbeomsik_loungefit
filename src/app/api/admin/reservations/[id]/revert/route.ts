import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { revertAttendance } from "@/services/attendance";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await revertAttendance(await requireAdminScope(), id));
  } catch (error) {
    return errorResponse(error);
  }
}
