import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { deleteAdminSchedule, getAdminScheduleDetail, updateAdminSchedule } from "@/services/admin-schedules";
import { isUuid } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

async function scheduleIdFrom(context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
  return id;
}

export async function GET(_request: Request, context: Context) {
  try {
    return Response.json(await getAdminScheduleDetail(await requireAdminScope(), await scheduleIdFrom(context)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) throw new AppError("ERR_INVALID_REQUEST");
    const value = body as { instructorName?: unknown; capacity?: unknown };
    if ((value.instructorName !== undefined && typeof value.instructorName !== "string") || (value.capacity !== undefined && typeof value.capacity !== "number")) {
      throw new AppError("ERR_INVALID_REQUEST");
    }
    const schedule = await updateAdminSchedule(await requireAdminScope(), await scheduleIdFrom(context), {
      ...(typeof value.instructorName === "string" ? { instructorName: value.instructorName } : {}),
      ...(typeof value.capacity === "number" ? { capacity: value.capacity } : {}),
    });
    return Response.json(schedule);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    return Response.json(await deleteAdminSchedule(await requireAdminScope(), await scheduleIdFrom(context)));
  } catch (error) {
    return errorResponse(error);
  }
}
