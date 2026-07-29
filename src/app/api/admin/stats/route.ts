import type { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { kstDateTime } from "@/lib/time";
import { getAdminStats } from "@/services/admin-stats";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const fromDate = from ? kstDateTime(from, "00:00") : null;
    const toStart = to ? kstDateTime(to, "00:00") : null;
    if (!fromDate || !toStart) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await getAdminStats(await requireAdminScope(), { from: fromDate, to: new Date(toStart.getTime() + 24 * 60 * 60 * 1_000) }));
  } catch (error) {
    return errorResponse(error);
  }
}
