import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { assertScopeBranch, scopedBranchWhere, scopedMemberWhere, scopedWhere, type AdminScope } from "@/lib/scope";
import { isRollingOpen, kstDateString, kstDateTime, kstDayBounds, kstIsoString, kstMonthBounds, toKst } from "@/lib/time";
import { lockSchedule, lockTicket } from "@/services/booking";
import { serializeAdminMember } from "@/services/admin-members";

type RepeatInput = {
  type: "NONE" | "WEEKLY";
  daysOfWeek: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">;
  from: string;
  to?: string;
};

export type CreateScheduleInput = {
  branchId: string;
  ticketTypeId: string;
  instructorName: string;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  repeat: RepeatInput;
};

const dayOfWeek = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;

function scheduleInstanceDates(input: CreateScheduleInput) {
  const from = kstDateTime(input.repeat.from, "00:00");
  const to = kstDateTime(input.repeat.type === "NONE" ? input.repeat.from : input.repeat.to ?? "", "00:00");
  if (!from || !to || from.getTime() > to.getTime()) throw new AppError("ERR_INVALID_REQUEST");
  const selectedDays = new Set(input.repeat.daysOfWeek.map((day) => dayOfWeek[day]));
  if (input.repeat.type === "WEEKLY" && selectedDays.size === 0) throw new AppError("ERR_INVALID_REQUEST");

  const dates: string[] = [];
  for (let current = from; current.getTime() <= to.getTime(); current = toKst(current).add(1, "day").toDate()) {
    if (input.repeat.type === "NONE" || selectedDays.has(toKst(current).day())) {
      dates.push(kstDateString(current));
    }
  }
  return dates;
}

async function assertScheduleDependencies(input: CreateScheduleInput, scope: AdminScope) {
  assertScopeBranch(scope, input.branchId);
  const [branch, ticketType] = await prisma.$transaction([
    prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } }),
    prisma.ticketType.findUnique({ where: { id: input.ticketTypeId }, select: { id: true } }),
  ]);
  if (!branch || !ticketType) throw new AppError("ERR_INVALID_REQUEST");
}

export async function getAdminScheduleOptions(scope: AdminScope) {
  const [branches, ticketTypes] = await prisma.$transaction([
    prisma.branch.findMany({
      where: scopedBranchWhere(scope),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticketType.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { branches, ticketTypes };
}

export async function getAdminScheduleMonth(scope: AdminScope, year: number, month: number) {
  const firstDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthBounds = kstMonthBounds(kstDateTime(firstDate, "00:00") ?? new Date());
  const policy = await getPolicy();
  const schedules = await prisma.classSchedule.findMany({
    where: { ...scopedWhere(scope), startsAt: { gte: monthBounds.start, lt: monthBounds.end } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      reservedCount: true,
      instructorName: true,
      status: true,
      ticketType: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  const days = new Map<string, { date: string; classCount: number; totalCapacity: number; totalReserved: number; isOpened: boolean }>();
  for (const schedule of schedules) {
    const date = kstDateString(schedule.startsAt);
    const current = days.get(date) ?? { date, classCount: 0, totalCapacity: 0, totalReserved: 0, isOpened: isRollingOpen(schedule.startsAt, policy.rollingOpenDays) };
    current.classCount += 1;
    current.totalCapacity += schedule.capacity;
    current.totalReserved += schedule.reservedCount;
    days.set(date, current);
  }
  return {
    days: [...days.values()],
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      date: kstDateString(schedule.startsAt),
      startsAt: kstIsoString(schedule.startsAt),
      endsAt: kstIsoString(schedule.endsAt),
      capacity: schedule.capacity,
      reservedCount: schedule.reservedCount,
      instructorName: schedule.instructorName,
      status: schedule.status,
      ticketTypeName: schedule.ticketType.name,
    })),
  };
}

export async function createAdminSchedules(scope: AdminScope, input: CreateScheduleInput) {
  if (
    input.instructorName.trim().length === 0 ||
    input.durationMinutes <= 0 ||
    input.durationMinutes > 360 ||
    input.capacity <= 0 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)
  ) {
    throw new AppError("ERR_INVALID_REQUEST");
  }
  await assertScheduleDependencies(input, scope);
  const dates = scheduleInstanceDates(input);

  return prisma.$transaction(async (tx) => {
    const skipped: Array<{ date: string; reason: string }> = [];
    let createdCount = 0;
    for (const date of dates) {
      const startsAt = kstDateTime(date, input.startTime);
      if (!startsAt) throw new AppError("ERR_INVALID_REQUEST");
      const existing = await tx.classSchedule.findFirst({
        where: { branchId: input.branchId, startsAt },
        select: { id: true },
      });
      if (existing) {
        skipped.push({ date, reason: "동일 시간 수업 존재" });
        continue;
      }
      await tx.classSchedule.create({
        data: {
          branchId: input.branchId,
          ticketTypeId: input.ticketTypeId,
          instructorName: input.instructorName.trim(),
          startsAt,
          endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
          capacity: input.capacity,
        },
      });
      createdCount += 1;
    }
    return { createdCount, skipped };
  });
}

export async function getAdminScheduleDetail(scope: AdminScope, scheduleId: string) {
  const schedule = await prisma.classSchedule.findFirst({
    where: { id: scheduleId, ...scopedWhere(scope) },
    include: {
      branch: { select: { name: true } },
      ticketType: { select: { name: true } },
      reservations: {
        include: {
          member: { include: { branch: { select: { name: true } } } },
          ticketUsage: { select: { ticketId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      waitlistEntries: {
        where: { status: { in: ["WAITING", "OFFERED"] } },
        include: {
          member: { include: { branch: { select: { name: true } } } },
          ticketUsage: { select: { ticketId: true } },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!schedule) throw new AppError("ERR_FORBIDDEN");
  const policy = await getPolicy();
  const now = new Date();

  return {
    id: schedule.id,
    branchName: schedule.branch.name,
    ticketTypeName: schedule.ticketType.name,
    instructorName: schedule.instructorName,
    startsAt: kstIsoString(schedule.startsAt),
    endsAt: kstIsoString(schedule.endsAt),
    capacity: schedule.capacity,
    reservedCount: schedule.reservedCount,
    status: schedule.status,
    isPast: schedule.startsAt.getTime() <= now.getTime(),
    closeDecisionDeadlineAt: kstIsoString(new Date(schedule.startsAt.getTime() - policy.classCloseDeadlineMinutes * 60_000)),
    reservations: await Promise.all(schedule.reservations.map(async (reservation) => ({
      reservationId: reservation.id,
      member: await serializeAdminMember(scope, reservation.member, reservation.ticketUsage.ticketId),
      status: reservation.status,
      source: reservation.source,
      createdAt: kstIsoString(reservation.createdAt),
    }))),
    waitlist: await Promise.all(schedule.waitlistEntries.map(async (entry) => ({
      waitlistId: entry.id,
      sequence: entry.sequence,
      status: entry.status,
      member: await serializeAdminMember(scope, entry.member, entry.ticketUsage.ticketId),
    }))),
  };
}

export async function updateAdminSchedule(
  scope: AdminScope,
  scheduleId: string,
  input: { instructorName?: string; capacity?: number },
) {
  if (input.instructorName === undefined && input.capacity === undefined) throw new AppError("ERR_INVALID_REQUEST");
  if (input.instructorName !== undefined && input.instructorName.trim().length === 0) throw new AppError("ERR_INVALID_REQUEST");
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity <= 0)) throw new AppError("ERR_INVALID_REQUEST");

  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) throw new AppError("ERR_CLASS_CLOSED");
    assertScopeBranch(scope, schedule.branchId);
    const activeReservationCount = await tx.reservation.count({ where: { classScheduleId: schedule.id, status: "RESERVED" } });
    if (input.capacity !== undefined && (activeReservationCount > 0 || input.capacity < schedule.reservedCount)) {
      throw new AppError("ERR_SCHEDULE_HAS_RESERVATION");
    }
    return tx.classSchedule.update({
      where: { id: schedule.id },
      data: {
        ...(input.instructorName !== undefined ? { instructorName: input.instructorName.trim() } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      },
    });
  });
}

export async function deleteAdminSchedule(scope: AdminScope, scheduleId: string) {
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) throw new AppError("ERR_CLASS_CLOSED");
    assertScopeBranch(scope, schedule.branchId);
    const [reservationCount, waitlistCount, usageCount] = await Promise.all([
      tx.reservation.count({ where: { classScheduleId: schedule.id } }),
      tx.waitlistEntry.count({ where: { classScheduleId: schedule.id } }),
      tx.ticketUsage.count({ where: { classScheduleId: schedule.id } }),
    ]);
    if (reservationCount > 0 || waitlistCount > 0 || usageCount > 0) throw new AppError("ERR_SCHEDULE_HAS_RESERVATION");
    await tx.classSchedule.delete({ where: { id: schedule.id } });
    return { deleted: true };
  });
}

export async function getAdminClosePreview(scope: AdminScope, scheduleId: string) {
  const schedule = await prisma.classSchedule.findFirst({
    where: { id: scheduleId, ...scopedWhere(scope) },
    select: { id: true, status: true },
  });
  if (!schedule || schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
  const [reservationCount, waitlistCount] = await prisma.$transaction([
    prisma.reservation.count({ where: { classScheduleId: schedule.id, status: "RESERVED" } }),
    prisma.waitlistEntry.count({ where: { classScheduleId: schedule.id, status: { in: ["WAITING", "OFFERED"] } } }),
  ]);
  return { reservations: reservationCount, waitlist: waitlistCount, restoredCount: reservationCount + waitlistCount };
}

async function terminateAdminSchedule(
  scope: AdminScope,
  scheduleId: string,
  input: { reason: string; status: "CLOSED" | "CANCELED" },
) {
  if (input.reason.trim().length === 0) throw new AppError("ERR_INVALID_REQUEST");
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule || schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
    assertScopeBranch(scope, schedule.branchId);
    const [reservations, waitlist] = await Promise.all([
      tx.reservation.findMany({
        where: { classScheduleId: schedule.id, status: "RESERVED" },
        select: { id: true, ticketUsageId: true, ticketUsage: { select: { ticketId: true } } },
      }),
      tx.waitlistEntry.findMany({
        where: { classScheduleId: schedule.id, status: { in: ["WAITING", "OFFERED"] } },
        select: { id: true, ticketUsageId: true, ticketUsage: { select: { ticketId: true } } },
      }),
    ]);

    const ticketIds = [...new Set([...reservations, ...waitlist].map((entry) => entry.ticketUsage.ticketId))].sort();
    for (const ticketId of ticketIds) {
      if (!(await lockTicket(tx, ticketId))) throw new AppError("ERR_CLASS_CLOSED");
    }

    const now = new Date();
    for (const reservation of reservations) {
      await tx.reservation.update({ where: { id: reservation.id }, data: { status: "CLASS_CANCELED", canceledAt: now } });
      await tx.ticketUsage.update({ where: { id: reservation.ticketUsageId }, data: { status: "RELEASED", releasedAt: now } });
    }
    for (const entry of waitlist) {
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "RELEASED" } });
      await tx.ticketUsage.update({ where: { id: entry.ticketUsageId }, data: { status: "RELEASED", releasedAt: now } });
    }
    await tx.classSchedule.update({
      where: { id: schedule.id },
      data: { status: input.status, canceledReason: input.reason.trim(), reservedCount: 0 },
    });
    // Notification persistence and delivery are intentionally deferred to Phase 4.
    return {
      closedAt: kstIsoString(now),
      affected: { reservations: reservations.length, waitlist: waitlist.length, restoredCount: reservations.length + waitlist.length },
    };
  });
}

export function closeAdminSchedule(scope: AdminScope, scheduleId: string, reason: string) {
  return terminateAdminSchedule(scope, scheduleId, { reason, status: "CLOSED" });
}

export function cancelAdminSchedule(scope: AdminScope, scheduleId: string, reason: string) {
  return terminateAdminSchedule(scope, scheduleId, { reason, status: "CANCELED" });
}

export async function changeAdminScheduleInstructor(scope: AdminScope, scheduleId: string, instructorName: string) {
  if (instructorName.trim().length === 0) throw new AppError("ERR_INVALID_REQUEST");
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) throw new AppError("ERR_CLASS_CLOSED");
    assertScopeBranch(scope, schedule.branchId);
    const updated = await tx.classSchedule.update({ where: { id: schedule.id }, data: { instructorName: instructorName.trim() } });
    // Notification persistence and delivery are intentionally deferred to Phase 4.
    return { id: updated.id, instructorName: updated.instructorName };
  });
}

export async function getAdminDashboard(scope: AdminScope) {
  const now = new Date();
  const today = kstDayBounds(now);
  const policy = await getPolicy();
  const [schedules, noShowMembers] = await prisma.$transaction([
    prisma.classSchedule.findMany({
      where: { ...scopedWhere(scope), startsAt: { gte: today.start, lt: today.end } },
      include: {
        ticketType: { select: { name: true } },
        waitlistEntries: { where: { status: { in: ["WAITING", "OFFERED"] } }, select: { id: true } },
        reservations: { select: { status: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.member.findMany({
      where: { ...scopedMemberWhere(scope), isSuspended: false },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            reservations: {
              where: { status: "NO_SHOW", classSchedule: { startsAt: { gte: kstMonthBounds(now).start, lt: kstMonthBounds(now).end } } },
            },
          },
        },
      },
    }),
  ]);
  const closeCandidates = schedules.filter((schedule) => (
    schedule.status === "SCHEDULED" &&
    schedule.reservedCount < policy.classMinHeadcount &&
    now.getTime() >= schedule.startsAt.getTime() - policy.classCloseDeadlineMinutes * 60_000
  ));
  const todayClasses = schedules.map((schedule) => {
    const hasPending = schedule.reservations.some((reservation) => reservation.status === "RESERVED");
    const attendanceStatus = schedule.endsAt.getTime() > now.getTime() ? "NOT_YET" : hasPending ? "PENDING" : "DONE";
    return {
      id: schedule.id,
      startsAt: kstIsoString(schedule.startsAt),
      ticketTypeName: schedule.ticketType.name,
      instructorName: schedule.instructorName,
      capacity: schedule.capacity,
      reservedCount: schedule.reservedCount,
      waitingCount: schedule.waitlistEntries.length,
      attendanceStatus,
    };
  });
  return {
    branchName: scope.branchId
      ? (await prisma.branch.findUnique({ where: { id: scope.branchId }, select: { name: true } }))?.name ?? ""
      : "전체 지점",
    todayClasses,
    closeCandidates: closeCandidates.map((schedule) => ({
      id: schedule.id,
      startsAt: kstIsoString(schedule.startsAt),
      ticketTypeName: schedule.ticketType.name,
      reservedCount: schedule.reservedCount,
      minHeadcount: policy.classMinHeadcount,
      decisionDeadlineAt: kstIsoString(new Date(schedule.startsAt.getTime() - policy.classCloseDeadlineMinutes * 60_000)),
    })),
    noShowAlerts: noShowMembers
      .filter((member) => member._count.reservations >= policy.noshowThresholdCount)
      .map((member) => ({
        memberId: member.id,
        name: member.name,
        noShowCount: member._count.reservations,
        threshold: policy.noshowThresholdCount,
        isSuspended: false,
      })),
    pendingAttendanceCount: todayClasses.filter((schedule) => schedule.attendanceStatus === "PENDING").length,
  };
}
