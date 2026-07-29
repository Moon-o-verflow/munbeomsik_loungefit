import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { cancelAdminSchedule } from "@/services/admin-schedules";
import { isUuid } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const reason = typeof body === "object" && body !== null ? (body as { reason?: unknown }).reason : undefined;
    if (!isUuid(id) || typeof reason !== "string") throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await cancelAdminSchedule(await requireAdminScope(), id, reason));
  } catch (error) {
    return errorResponse(error);
  }
}
