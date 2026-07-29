import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { changeAdminScheduleInstructor } from "@/services/admin-schedules";
import { isUuid } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const instructorName = typeof body === "object" && body !== null ? (body as { instructorName?: unknown }).instructorName : undefined;
    if (!isUuid(id) || typeof instructorName !== "string") throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await changeAdminScheduleInstructor(await requireAdminScope(), id, instructorName));
  } catch (error) {
    return errorResponse(error);
  }
}
