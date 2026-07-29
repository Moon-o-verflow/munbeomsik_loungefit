import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { isQuietHours, isRollingOpen, kstDayBounds, kstIsoString, kstWeekBounds } from "@/lib/time";
import { getActiveWaitlistOfferCount, lockSchedule, lockTicket, selectAndLockTicket, type LockedSchedule } from "@/services/booking";
import { getTicketRemainingCount, getTicketUsageCount } from "@/services/ledger";

type WaitlistStatusValue = "WAITING" | "OFFERED" | "CONFIRMED" | "EXPIRED" | "RELEASED";

type LockedWaitlistEntry = {
  id: string;
  memberId: string;
  ticketUsageId: string;
  ticketId: string;
  sequence: number;
  status: WaitlistStatusValue;
  expiresAt: Date | null;
};

type SweepResult = {
  expired: number;
  released: number;
  offered: number;
};

function emptySweepResult(): SweepResult {
  return { expired: 0, released: 0, offered: 0 };
}

async function lockWaitlistEntry(tx: Prisma.TransactionClient, waitlistId: string) {
  const entries = await tx.$queryRaw<LockedWaitlistEntry[]>`
    SELECT
      w.id,
      w.member_id AS "memberId",
      w.ticket_usage_id AS "ticketUsageId",
      u.ticket_id AS "ticketId",
      w.sequence,
      w.status,
      w.expires_at AS "expiresAt"
    FROM waitlist_entry w
    INNER JOIN ticket_usage u ON u.id = w.ticket_usage_id
    WHERE w.id = ${waitlistId}::uuid
    FOR UPDATE OF w
  `;
  return entries[0] ?? null;
}

async function enforceTicketLimits(
  tx: Prisma.TransactionClient,
  ticket: { id: string; dailyLimit: number | null; weeklyLimit: number | null },
  schedule: LockedSchedule,
) {
  const day = kstDayBounds(schedule.startsAt);
  const week = kstWeekBounds(schedule.startsAt);

  if (ticket.dailyLimit !== null) {
    const dailyUsed = await getTicketUsageCount(tx, ticket.id, day.start, day.end);
    if (dailyUsed >= ticket.dailyLimit) {
      throw new AppError("ERR_DAILY_LIMIT_EXCEEDED", { dailyLimit: ticket.dailyLimit, dailyUsed });
    }
  }

  if (ticket.weeklyLimit !== null) {
    const weeklyUsed = await getTicketUsageCount(tx, ticket.id, week.start, week.end);
    if (weeklyUsed >= ticket.weeklyLimit) {
      throw new AppError("ERR_WEEKLY_LIMIT_EXCEEDED", { weeklyLimit: ticket.weeklyLimit, weeklyUsed });
    }
  }
}

async function releaseWaitlistEntryAfterTicketLock(
  tx: Prisma.TransactionClient,
  entry: LockedWaitlistEntry,
  status: "EXPIRED" | "RELEASED",
  now: Date,
) {
  if (entry.status !== "WAITING" && entry.status !== "OFFERED") return false;

  await tx.waitlistEntry.update({
    where: { id: entry.id },
    data: { status },
  });
  await tx.ticketUsage.update({
    where: { id: entry.ticketUsageId },
    data: { status: "RELEASED", releasedAt: now },
  });
  return true;
}

function offerExpiresAt(
  schedule: LockedSchedule,
  policy: Awaited<ReturnType<typeof getPolicy>>,
  now: Date,
) {
  const startsInMinutes = (schedule.startsAt.getTime() - now.getTime()) / 60_000;
  const timeoutMinutes = startsInMinutes <= policy.waitlistUrgentThresholdMinutes
    ? policy.waitlistUrgentTimeoutMinutes
    : policy.waitlistTimeoutMinutes;
  return new Date(Math.min(now.getTime() + timeoutMinutes * 60_000, schedule.startsAt.getTime()));
}

export async function offerNextWaitlistForLockedSchedule(
  tx: Prisma.TransactionClient,
  schedule: LockedSchedule,
  policy: Awaited<ReturnType<typeof getPolicy>>,
  now: Date,
) {
  if (
    schedule.status !== "SCHEDULED" ||
    schedule.startsAt.getTime() <= now.getTime() ||
    isQuietHours(policy.quietHoursStart, policy.quietHoursEnd, now)
  ) {
    return null;
  }

  if (schedule.reservedCount >= schedule.capacity) return null;
  if ((await getActiveWaitlistOfferCount(tx, schedule.id)) > 0) return null;

  const entries = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM waitlist_entry
    WHERE class_schedule_id = ${schedule.id}::uuid
      AND status = 'WAITING'
    ORDER BY sequence ASC
    LIMIT 1
    FOR UPDATE
  `;
  const entry = entries[0];
  if (!entry) return null;

  const expiresAt = offerExpiresAt(schedule, policy, now);
  await tx.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: "OFFERED", offeredAt: now, expiresAt },
  });

  return { waitlistId: entry.id, expiresAt };
}

export async function sweepLockedWaitlistSchedule(
  tx: Prisma.TransactionClient,
  schedule: LockedSchedule,
  policy: Awaited<ReturnType<typeof getPolicy>>,
  now: Date,
) {
  const result = emptySweepResult();
  const expiredEntries = await tx.waitlistEntry.findMany({
    where: {
      classScheduleId: schedule.id,
      status: "OFFERED",
      expiresAt: { lte: now },
    },
    select: { id: true, ticketUsage: { select: { ticketId: true } } },
  });

  for (const candidate of expiredEntries) {
    // Every transaction obtains class_schedule, then ticket, then the waitlist row.
    const ticket = await lockTicket(tx, candidate.ticketUsage.ticketId);
    if (!ticket) continue;
    const entry = await lockWaitlistEntry(tx, candidate.id);
    if (entry?.status === "OFFERED" && entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) {
      if (await releaseWaitlistEntryAfterTicketLock(tx, entry, "EXPIRED", now)) {
        result.expired += 1;
        result.released += 1;
      }
    }
  }

  if (schedule.startsAt.getTime() <= now.getTime()) {
    const waitingEntries = await tx.waitlistEntry.findMany({
      where: { classScheduleId: schedule.id, status: "WAITING" },
      select: { id: true, ticketUsage: { select: { ticketId: true } } },
    });
    for (const candidate of waitingEntries) {
      const ticket = await lockTicket(tx, candidate.ticketUsage.ticketId);
      if (!ticket) continue;
      const entry = await lockWaitlistEntry(tx, candidate.id);
      if (entry && await releaseWaitlistEntryAfterTicketLock(tx, entry, "RELEASED", now)) {
        result.released += 1;
      }
    }
    return result;
  }

  if (await offerNextWaitlistForLockedSchedule(tx, schedule, policy, now)) {
    result.offered += 1;
  }
  return result;
}

export async function sweepWaitlistSchedule(scheduleId: string, now = new Date()) {
  const policy = await getPolicy();
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) return emptySweepResult();
    return sweepLockedWaitlistSchedule(tx, schedule, policy, now);
  });
}

export async function sweepAllWaitlists(now = new Date()) {
  const startedAt = Date.now();
  const scheduleIds = await prisma.waitlistEntry.findMany({
    where: { status: { in: ["WAITING", "OFFERED"] } },
    select: { classScheduleId: true },
    distinct: ["classScheduleId"],
  });
  const total = emptySweepResult();

  for (const { classScheduleId } of scheduleIds) {
    const result = await sweepWaitlistSchedule(classScheduleId, now);
    total.expired += result.expired;
    total.released += result.released;
    total.offered += result.offered;
  }

  return { ...total, durationMs: Date.now() - startedAt };
}

export async function createMemberWaitlist(memberId: string, scheduleId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { isSuspended: true },
  });
  if (!member) throw new AppError("ERR_MEMBER_NOT_FOUND");
  if (member.isSuspended) throw new AppError("ERR_MEMBER_SUSPENDED");

  const policy = await getPolicy();
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) throw new AppError("ERR_CLASS_CLOSED");
    if (!isRollingOpen(schedule.startsAt, policy.rollingOpenDays, now)) throw new AppError("ERR_CLASS_NOT_OPEN");
    if (schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
    if (schedule.startsAt.getTime() <= now.getTime()) throw new AppError("ERR_CLASS_STARTED");

    const duplicate = await tx.waitlistEntry.findFirst({
      where: { classScheduleId: schedule.id, memberId, status: { in: ["WAITING", "OFFERED"] } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("ERR_WAITLIST_DUPLICATE");

    const occupiedCount = schedule.reservedCount + await getActiveWaitlistOfferCount(tx, schedule.id);
    if (occupiedCount < schedule.capacity) throw new AppError("ERR_WAITLIST_NOT_APPLICABLE");

    const ticket = await selectAndLockTicket(tx, memberId, schedule);
    await enforceTicketLimits(tx, ticket, schedule);

    const sequence = (await tx.waitlistEntry.aggregate({
      where: { classScheduleId: schedule.id },
      _max: { sequence: true },
    }))._max.sequence ?? 0;
    const usage = await tx.ticketUsage.create({
      data: { ticketId: ticket.id, memberId, classScheduleId: schedule.id, status: "HOLD" },
    });
    const entry = await tx.waitlistEntry.create({
      data: {
        classScheduleId: schedule.id,
        memberId,
        ticketUsageId: usage.id,
        sequence: sequence + 1,
        status: "WAITING",
      },
    });

    return {
      waitlistId: entry.id,
      sequence: entry.sequence,
      remainingCount: await getTicketRemainingCount(tx, ticket.id),
      notice: "대기 등록으로 횟수 1회가 차감되었습니다. 자리를 받지 못하면 자동으로 반환됩니다.",
    };
  });
}

export async function cancelMemberWaitlist(memberId: string, waitlistId: string) {
  const existing = await prisma.waitlistEntry.findFirst({
    where: { id: waitlistId, memberId },
    select: { classScheduleId: true, ticketUsage: { select: { ticketId: true } } },
  });
  if (!existing) throw new AppError("ERR_OFFER_EXPIRED");

  const policy = await getPolicy();
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const schedule = await lockSchedule(tx, existing.classScheduleId);
    if (!schedule) throw new AppError("ERR_OFFER_EXPIRED");
    const ticket = await lockTicket(tx, existing.ticketUsage.ticketId);
    if (!ticket) throw new AppError("ERR_OFFER_EXPIRED");
    const entry = await lockWaitlistEntry(tx, waitlistId);
    if (!entry || entry.memberId !== memberId || !await releaseWaitlistEntryAfterTicketLock(tx, entry, "RELEASED", now)) {
      throw new AppError("ERR_OFFER_EXPIRED");
    }
    await sweepLockedWaitlistSchedule(tx, schedule, policy, now);

    return { status: "RELEASED", remainingCount: await getTicketRemainingCount(tx, ticket.id) };
  });
}

export async function getMemberWaitlistOffer(memberId: string, waitlistId: string) {
  const entryBeforeSweep = await prisma.waitlistEntry.findFirst({
    where: { id: waitlistId, memberId },
    select: { classScheduleId: true },
  });
  if (!entryBeforeSweep) throw new AppError("ERR_OFFER_EXPIRED");
  await sweepWaitlistSchedule(entryBeforeSweep.classScheduleId);

  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: waitlistId, memberId },
    include: {
      classSchedule: { include: { branch: true, ticketType: true } },
    },
  });
  if (!entry || entry.status === "EXPIRED" || entry.status === "RELEASED") {
    throw new AppError("ERR_OFFER_EXPIRED");
  }

  const now = new Date();
  return {
    waitlistId: entry.id,
    status: entry.status,
    expiresAt: entry.expiresAt ? kstIsoString(entry.expiresAt) : null,
    remainingSeconds: entry.expiresAt ? Math.max(0, Math.floor((entry.expiresAt.getTime() - now.getTime()) / 1_000)) : null,
    schedule: {
      id: entry.classSchedule.id,
      branchName: entry.classSchedule.branch.name,
      ticketTypeName: entry.classSchedule.ticketType.name,
      instructorName: entry.classSchedule.instructorName,
      startsAt: kstIsoString(entry.classSchedule.startsAt),
      endsAt: kstIsoString(entry.classSchedule.endsAt),
    },
  };
}

export async function confirmMemberWaitlist(memberId: string, waitlistId: string) {
  const existing = await prisma.waitlistEntry.findFirst({
    where: { id: waitlistId, memberId },
    select: { classScheduleId: true, ticketUsage: { select: { ticketId: true } } },
  });
  if (!existing) throw new AppError("ERR_OFFER_EXPIRED");

  const policy = await getPolicy();
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const schedule = await lockSchedule(tx, existing.classScheduleId);
    if (!schedule) throw new AppError("ERR_OFFER_EXPIRED");
    const ticket = await lockTicket(tx, existing.ticketUsage.ticketId);
    if (!ticket) throw new AppError("ERR_OFFER_EXPIRED");
    const entry = await lockWaitlistEntry(tx, waitlistId);
    if (!entry || entry.memberId !== memberId || entry.status !== "OFFERED") {
      throw new AppError("ERR_OFFER_EXPIRED");
    }
    if (!entry.expiresAt || entry.expiresAt.getTime() <= now.getTime()) {
      await releaseWaitlistEntryAfterTicketLock(tx, entry, "EXPIRED", now);
      await offerNextWaitlistForLockedSchedule(tx, schedule, policy, now);
      throw new AppError("ERR_OFFER_EXPIRED");
    }
    if (schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
    if (schedule.startsAt.getTime() <= now.getTime()) throw new AppError("ERR_CLASS_STARTED");
    if (schedule.reservedCount >= schedule.capacity) throw new AppError("ERR_CLASS_FULL");

    await tx.ticketUsage.update({ where: { id: entry.ticketUsageId }, data: { status: "CONFIRMED" } });
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "CONFIRMED" } });
    const reservation = await tx.reservation.create({
      data: { classScheduleId: schedule.id, memberId, ticketUsageId: entry.ticketUsageId, status: "RESERVED" },
    });
    await tx.classSchedule.update({ where: { id: schedule.id }, data: { reservedCount: { increment: 1 } } });

    return {
      reservationId: reservation.id,
      waitlistId: entry.id,
      status: "CONFIRMED",
      remainingCount: await getTicketRemainingCount(tx, ticket.id),
    };
  });
}
