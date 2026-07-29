import type { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { createAdminSchedules, getAdminScheduleMonth, getAdminScheduleOptions, type CreateScheduleInput } from "@/services/admin-schedules";
import { isUuid } from "@/lib/validation";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function parseCreateInput(body: unknown): CreateScheduleInput {
  if (!isRecord(body) || !isRecord(body.repeat)) throw new AppError("ERR_INVALID_REQUEST");
  const repeat = body.repeat;
  const type = repeat.type;
  const daysOfWeek = repeat.daysOfWeek;
  if (
    !isUuid(body.branchId) ||
    !isUuid(body.ticketTypeId) ||
    typeof body.instructorName !== "string" ||
    typeof body.startTime !== "string" ||
    typeof body.durationMinutes !== "number" ||
    typeof body.capacity !== "number" ||
    (type !== "NONE" && type !== "WEEKLY") ||
    !Array.isArray(daysOfWeek) ||
    !daysOfWeek.every((day) => typeof day === "string" && ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(day)) ||
    typeof repeat.from !== "string" ||
    (repeat.to !== undefined && typeof repeat.to !== "string")
  ) {
    throw new AppError("ERR_INVALID_REQUEST");
  }
  return {
    branchId: body.branchId,
    ticketTypeId: body.ticketTypeId,
    instructorName: body.instructorName,
    startTime: body.startTime,
    durationMinutes: body.durationMinutes,
    capacity: body.capacity,
    repeat: {
      type,
      daysOfWeek: daysOfWeek as CreateScheduleInput["repeat"]["daysOfWeek"],
      from: repeat.from,
      ...(typeof repeat.to === "string" ? { to: repeat.to } : {}),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const year = Number(request.nextUrl.searchParams.get("year"));
    const month = Number(request.nextUrl.searchParams.get("month"));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new AppError("ERR_INVALID_REQUEST");
    const scope = await requireAdminScope();
    const [monthData, options] = await Promise.all([
      getAdminScheduleMonth(scope, year, month),
      getAdminScheduleOptions(scope),
    ]);
    return Response.json({ ...monthData, ...options });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json(await createAdminSchedules(await requireAdminScope(), parseCreateInput(await request.json())), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
