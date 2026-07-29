import { AppError, errorResponse } from "@/lib/errors";
import { requireHeadAdminScope } from "@/lib/scope";
import { getAdminPolicy, updateAdminPolicy, type PolicyPatch } from "@/services/admin-policy";

const numberFields = new Set<keyof PolicyPatch>([
  "cancelDeadlineMinutes", "rollingOpenDays", "rollingOpenHour", "waitlistTimeoutMinutes", "waitlistUrgentTimeoutMinutes", "waitlistUrgentThresholdMinutes", "quietHoursStart", "quietHoursEnd", "classCloseDeadlineMinutes", "classMinHeadcount", "noshowThresholdCount", "noshowSuspendDays",
]);

export async function GET() {
  try {
    await requireHeadAdminScope();
    return Response.json(await getAdminPolicy());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireHeadAdminScope();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) throw new AppError("ERR_INVALID_REQUEST");
    const patch: PolicyPatch = {};
    for (const [key, value] of Object.entries(body)) {
      if (numberFields.has(key as keyof PolicyPatch)) {
        if (typeof value !== "number") throw new AppError("ERR_INVALID_REQUEST");
        Object.assign(patch, { [key]: value });
      } else if (key === "proxyBookingEnabled") {
        if (typeof value !== "boolean") throw new AppError("ERR_INVALID_REQUEST");
        patch.proxyBookingEnabled = value;
      } else if (key === "noshowResetCycle") {
        if (typeof value !== "string") throw new AppError("ERR_INVALID_REQUEST");
        patch.noshowResetCycle = value;
      } else {
        throw new AppError("ERR_INVALID_REQUEST");
      }
    }
    if (Object.keys(patch).length === 0) throw new AppError("ERR_INVALID_REQUEST");
    return Response.json(await updateAdminPolicy(patch));
  } catch (error) {
    return errorResponse(error);
  }
}
