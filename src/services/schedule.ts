import { prisma } from "@/lib/db";
import { AppError, ERROR_DEFINITIONS, type ErrorCode } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { cancelDeadlineAt, isRollingOpen, kstDateRange, kstIsoString, kstNow, kstWeekBounds, kstDayBounds } from "@/lib/time";
import { getTicketRemainingCount, getTicketUsageCount } from "@/services/ledger";
import { sweepWaitlistSchedule } from "@/services/waitlist";

type ScheduleWithRelations = Awaited<ReturnType<typeof findSchedules>>[number];

async function findSchedules(memberId: string, date: string, branchId?: string) {
  const { start, end } = kstDateRange(date);
  return prisma.classSchedule.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      branch: { select: { name: true } },
      ticketType: { select: { name: true } },
      reservations: {
        where: { memberId, status: "RESERVED" },
        select: { id: true },
      },
      waitlistEntries: {
        where: { status: { in: ["WAITING", "OFFERED"] } },
        select: { id: true, memberId: true, sequence: true, status: true, expiresAt: true },
      },
    },
    orderBy: { startsAt: "asc" },
  });
}

async function getScheduleBlockedReason(memberId: string, schedule: ScheduleWithRelations): Promise<ErrorCode | null> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isSuspended: true } });
  if (!member) {
    throw new AppError("ERR_MEMBER_NOT_FOUND");
  }
  if (member.isSuspended) return "ERR_MEMBER_SUSPENDED";

  const tickets = await prisma.ticket.findMany({
    where: { memberId, ticketTypeId: schedule.ticketTypeId, isActive: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  if (tickets.length === 0) return "ERR_TICKET_TYPE_MISMATCH";

  const classDate = kstIsoString(schedule.startsAt).slice(0, 10);
  const validTickets = tickets.filter((ticket) => ticket.expiresAt.toISOString().slice(0, 10) >= classDate);
  if (validTickets.length === 0) return "ERR_TICKET_EXPIRED";

  for (const ticket of validTickets) {
    if ((await getTicketRemainingCount(prisma, ticket.id)) < 1) continue;
    if (ticket.dailyLimit !== null) {
      const day = kstDayBounds(schedule.startsAt);
      if ((await getTicketUsageCount(prisma, ticket.id, day.start, day.end)) >= ticket.dailyLimit) {
        return "ERR_DAILY_LIMIT_EXCEEDED";
      }
    }
    if (ticket.weeklyLimit !== null) {
      const week = kstWeekBounds(schedule.startsAt);
      if ((await getTicketUsageCount(prisma, ticket.id, week.start, week.end)) >= ticket.weeklyLimit) {
        return "ERR_WEEKLY_LIMIT_EXCEEDED";
      }
    }
    return null;
  }
  return "ERR_NO_REMAINING_COUNT";
}

async function serializeSchedule(memberId: string, schedule: ScheduleWithRelations) {
  const policy = await getPolicy();
  const now = new Date();
  let cardState: "AVAILABLE" | "FULL" | "RESERVED" | "WAITING" | "BLOCKED" | "CLOSED" = "AVAILABLE";
  let blockedReason: ErrorCode | null = null;
  const myWaitlist = schedule.waitlistEntries.find((entry) => entry.memberId === memberId) ?? null;
  const offeredCount = schedule.waitlistEntries.filter((entry) => entry.status === "OFFERED").length;

  if (schedule.status !== "SCHEDULED" || schedule.startsAt <= now) {
    cardState = "CLOSED";
  } else if (schedule.reservations.length > 0) {
    cardState = "RESERVED";
  } else if (myWaitlist) {
    cardState = "WAITING";
  } else if (!isRollingOpen(schedule.startsAt, policy.rollingOpenDays, now)) {
    cardState = "BLOCKED";
    blockedReason = "ERR_CLASS_NOT_OPEN";
  } else if (schedule.reservedCount + offeredCount >= schedule.capacity) {
    cardState = "FULL";
  } else {
    blockedReason = await getScheduleBlockedReason(memberId, schedule);
    if (blockedReason) cardState = "BLOCKED";
  }

  return {
    id: schedule.id,
    branchName: schedule.branch.name,
    ticketTypeName: schedule.ticketType.name,
    instructorName: schedule.instructorName,
    startsAt: kstIsoString(schedule.startsAt),
    endsAt: kstIsoString(schedule.endsAt),
    capacity: schedule.capacity,
    reservedCount: schedule.reservedCount,
    waitingCount: schedule.waitlistEntries.length,
    cardState,
    myWaitlist: myWaitlist
      ? {
          id: myWaitlist.id,
          sequence: myWaitlist.sequence,
          status: myWaitlist.status,
          expiresAt: myWaitlist.expiresAt ? kstIsoString(myWaitlist.expiresAt) : null,
        }
      : null,
    blockedReason,
    blockedMessage: blockedReason ? ERROR_DEFINITIONS[blockedReason].message : null,
    cancelDeadlineAt: kstIsoString(cancelDeadlineAt(schedule.startsAt, policy.cancelDeadlineMinutes)),
  };
}

export async function getMemberScheduleList(memberId: string, date: string, branchId?: string) {
  const policy = await getPolicy();
  const schedules = await findSchedules(memberId, date, branchId);
  const today = kstNow();
  return {
    date,
    branches: await prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    openedRange: {
      from: today.format("YYYY-MM-DD"),
      to: today.add(policy.rollingOpenDays, "day").format("YYYY-MM-DD"),
    },
    schedules: await Promise.all(schedules.map((schedule) => serializeSchedule(memberId, schedule))),
  };
}

export async function getMemberScheduleDetail(memberId: string, scheduleId: string) {
  await sweepWaitlistSchedule(scheduleId);
  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      branch: { select: { name: true } },
      ticketType: { select: { name: true } },
      reservations: { where: { memberId, status: "RESERVED" }, select: { id: true } },
      waitlistEntries: {
        where: { status: { in: ["WAITING", "OFFERED"] } },
        select: { id: true, memberId: true, sequence: true, status: true, expiresAt: true },
      },
    },
  });
  if (!schedule) throw new AppError("ERR_CLASS_CLOSED");

  const policy = await getPolicy();
  const tickets = await prisma.ticket.findMany({
    where: { memberId, ticketTypeId: schedule.ticketTypeId, isActive: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  const classDate = kstIsoString(schedule.startsAt).slice(0, 10);
  const ticket = tickets.find((candidate) => candidate.expiresAt.toISOString().slice(0, 10) >= classDate) ?? null;
  const week = kstWeekBounds(schedule.startsAt);

  return {
    ...(await serializeSchedule(memberId, schedule)),
    deductCount: 1,
    cancelDeadlineAt: kstIsoString(cancelDeadlineAt(schedule.startsAt, policy.cancelDeadlineMinutes)),
    myTicket: ticket
      ? {
          remainingCount: await getTicketRemainingCount(prisma, ticket.id),
          expiresAt: ticket.expiresAt.toISOString().slice(0, 10),
          weeklyLimit: ticket.weeklyLimit,
          weeklyUsed: await getTicketUsageCount(prisma, ticket.id, week.start, week.end),
        }
      : null,
  };
}

export async function getMemberReservations(memberId: string) {
  const policy = await getPolicy();
  const now = new Date();
  const activeWaitlists = await prisma.waitlistEntry.findMany({
    where: { memberId, status: { in: ["WAITING", "OFFERED"] } },
    select: { classScheduleId: true },
    distinct: ["classScheduleId"],
  });
  for (const { classScheduleId } of activeWaitlists) {
    await sweepWaitlistSchedule(classScheduleId, now);
  }
  const reservations = await prisma.reservation.findMany({
    where: { memberId },
    include: {
      classSchedule: { include: { branch: true, ticketType: true } },
    },
    orderBy: { classSchedule: { startsAt: "asc" } },
  });
  const waitlists = await prisma.waitlistEntry.findMany({
    where: { memberId, status: { in: ["WAITING", "OFFERED"] } },
    include: { classSchedule: { include: { branch: true, ticketType: true } } },
    orderBy: [{ classSchedule: { startsAt: "asc" } }, { sequence: "asc" }],
  });

  return {
    upcoming: reservations
      .filter((reservation) => reservation.status === "RESERVED" && reservation.classSchedule.startsAt > now)
      .map((reservation) => ({
        reservationId: reservation.id,
        scheduleId: reservation.classScheduleId,
        branchName: reservation.classSchedule.branch.name,
        ticketTypeName: reservation.classSchedule.ticketType.name,
        startsAt: kstIsoString(reservation.classSchedule.startsAt),
        instructorName: reservation.classSchedule.instructorName,
        cancelDeadlineAt: kstIsoString(cancelDeadlineAt(reservation.classSchedule.startsAt, policy.cancelDeadlineMinutes)),
        cancelable: now < cancelDeadlineAt(reservation.classSchedule.startsAt, policy.cancelDeadlineMinutes),
      })),
    waiting: waitlists.map((entry) => ({
      waitlistId: entry.id,
      scheduleId: entry.classScheduleId,
      sequence: entry.sequence,
      status: entry.status,
      expiresAt: entry.expiresAt ? kstIsoString(entry.expiresAt) : null,
      remainingSeconds: entry.expiresAt ? Math.max(0, Math.floor((entry.expiresAt.getTime() - now.getTime()) / 1_000)) : null,
      branchName: entry.classSchedule.branch.name,
      ticketTypeName: entry.classSchedule.ticketType.name,
      instructorName: entry.classSchedule.instructorName,
      startsAt: kstIsoString(entry.classSchedule.startsAt),
      holdNotice: "횟수 1회가 선차감된 상태입니다.",
    })),
    past: reservations
      .filter((reservation) => reservation.status !== "RESERVED" || reservation.classSchedule.startsAt <= now)
      .map((reservation) => ({
        reservationId: reservation.id,
        scheduleId: reservation.classScheduleId,
        startsAt: kstIsoString(reservation.classSchedule.startsAt),
        status: reservation.status,
      })),
  };
}
