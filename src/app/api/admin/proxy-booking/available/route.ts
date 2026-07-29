import type { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { kstDateTime } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { getProxyBookingAvailable } from "@/services/proxy-booking";

export async function GET(request: NextRequest) {
  try {
    const memberId = request.nextUrl.searchParams.get("memberId");
    const date = request.nextUrl.searchParams.get("date");
    if (!isUuid(memberId) || typeof date !== "string" || !kstDateTime(date, "00:00")) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await getProxyBookingAvailable(await requireAdminScope(), memberId, date));
  } catch (error) {
    return errorResponse(error);
  }
}
