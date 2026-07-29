import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { kstDateTime, kstDayBounds } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { suspendAdminMember, unsuspendAdminMember } from "@/services/admin-members";

type Context = { params: Promise<{ id: string }> };

async function memberIdFrom(context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) throw new AppError("ERR_INVALID_REQUEST");
  return id;
}

export async function POST(request: Request, context: Context) {
  try {
    const body: unknown = await request.json();
    const reason = typeof body === "object" && body !== null ? (body as { reason?: unknown }).reason : undefined;
    const until = typeof body === "object" && body !== null ? (body as { until?: unknown }).until : undefined;
    if (typeof reason !== "string" || reason.trim().length === 0 || typeof until !== "string") {
      throw new AppError("ERR_INVALID_REQUEST");
    }
    const date = kstDateTime(until, "00:00");
    if (!date || date.getTime() < kstDayBounds(new Date()).start.getTime()) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await suspendAdminMember(await requireAdminScope(), await memberIdFrom(context), { reason: reason.trim(), until: date }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    return Response.json(await unsuspendAdminMember(await requireAdminScope(), await memberIdFrom(context)));
  } catch (error) {
    return errorResponse(error);
  }
}
