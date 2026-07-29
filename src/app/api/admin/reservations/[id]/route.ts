import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { isUuid } from "@/lib/validation";
import { cancelProxyBooking } from "@/services/proxy-booking";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await cancelProxyBooking(await requireAdminScope(), id));
  } catch (error) {
    return errorResponse(error);
  }
}
