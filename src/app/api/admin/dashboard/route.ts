import { errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { getAdminDashboard } from "@/services/admin-schedules";

export async function GET() {
  try {
    return Response.json(await getAdminDashboard(await requireAdminScope()));
  } catch (error) {
    return errorResponse(error);
  }
}
