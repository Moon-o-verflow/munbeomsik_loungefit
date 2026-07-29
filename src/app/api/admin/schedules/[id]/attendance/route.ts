import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { recordBulkAttendance } from "@/services/attendance";
import { isUuid } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const attended = typeof body === "object" && body !== null ? (body as { attended?: unknown }).attended : undefined;
    const noShow = typeof body === "object" && body !== null ? (body as { noShow?: unknown }).noShow : undefined;
    if (!isUuid(id) || !Array.isArray(attended) || !Array.isArray(noShow) || !attended.every(isUuid) || !noShow.every(isUuid)) {
      throw new AppError("ERR_INVALID_REQUEST");
    }
    return Response.json(await recordBulkAttendance(await requireAdminScope(), id, { attended, noShow }));
  } catch (error) {
    return errorResponse(error);
  }
}
