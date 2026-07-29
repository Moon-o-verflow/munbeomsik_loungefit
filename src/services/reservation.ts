import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { cancelDeadlineAt, isRollingOpen, kstDayBounds, kstWeekBounds } from "@/lib/time";
import { getActiveWaitlistOfferCount, lockSchedule, lockTicket, selectAndLockTicket } from "@/services/booking";
import { getTicketRemainingCount, getTicketUsageCount } from "@/services/ledger";
import { sweepLockedWaitlistSchedule } from "@/services/waitlist";

type ReservationLock = { id: string; status: "RESERVED" | "CANCELED" | "LATE_CANCELED" | "ATTENDED" | "NO_SHOW" | "CLASS_CANCELED" };

async function lockReservation(tx: import("@/generated/prisma/client").Prisma.TransactionClient, reservationId: string, memberId: string) {
  const reservations = await tx.$queryRaw<ReservationLock[]>`
    SELECT id, status
    FROM reservation
    WHERE id = ${reservationId}::uuid AND member_id = ${memberId}::uuid
    FOR UPDATE
  `;
  return reservations[0] ?? null;
}

export async function createMemberReservation(memberId: string, scheduleId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { isSuspended: true },
  });

  if (!member) {
    throw new AppError("ERR_MEMBER_NOT_FOUND");
  }
  if (member.isSuspended) {
    throw new AppError("ERR_MEMBER_SUSPENDED");
  }

  const policy = await getPolicy();

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) {
      throw new AppError("ERR_CLASS_CLOSED");
    }

    if (!isRollingOpen(schedule.startsAt, policy.rollingOpenDays, now)) {
      throw new AppError("ERR_CLASS_NOT_OPEN");
    }
    if (schedule.status !== "SCHEDULED") {
      throw new AppError("ERR_CLASS_CLOSED");
    }
    if (schedule.startsAt.getTime() <= now.getTime()) {
      throw new AppError("ERR_CLASS_STARTED");
    }

    const ticket = await selectAndLockTicket(tx, memberId, schedule);
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

    const duplicate = await tx.reservation.findFirst({
      where: { classScheduleId: schedule.id, memberId, status: "RESERVED" },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("ERR_DUPLICATE_RESERVATION");
    }
    if (schedule.reservedCount + (await getActiveWaitlistOfferCount(tx, schedule.id)) >= schedule.capacity) {
      throw new AppError("ERR_CLASS_FULL");
    }

    const usage = await tx.ticketUsage.create({
      data: { ticketId: ticket.id, memberId, classScheduleId: schedule.id, status: "CONFIRMED" },
    });
    const reservation = await tx.reservation.create({
      data: { classScheduleId: schedule.id, memberId, ticketUsageId: usage.id, status: "RESERVED" },
    });
    await tx.classSchedule.update({
      where: { id: schedule.id },
      data: { reservedCount: { increment: 1 } },
    });

    return {
      reservationId: reservation.id,
      scheduleId: schedule.id,
      remainingCount: await getTicketRemainingCount(tx, ticket.id),
      cancelDeadlineAt: cancelDeadlineAt(schedule.startsAt, policy.cancelDeadlineMinutes),
    };
  });
}

export async function cancelMemberReservation(memberId: string, reservationId: string) {
  const existing = await prisma.reservation.findFirst({
    where: { id: reservationId, memberId },
    select: { classScheduleId: true, ticketUsage: { select: { id: true, ticketId: true } } },
  });
  if (!existing) {
    throw new AppError("ERR_RESERVATION_NOT_FOUND");
  }

  const policy = await getPolicy();

  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, existing.classScheduleId);
    if (!schedule) {
      throw new AppError("ERR_RESERVATION_NOT_FOUND");
    }
    const ticket = await lockTicket(tx, existing.ticketUsage.ticketId);
    if (!ticket) {
      throw new AppError("ERR_RESERVATION_NOT_FOUND");
    }
    const reservation = await lockReservation(tx, reservationId, memberId);
    if (!reservation || reservation.status !== "RESERVED") {
      throw new AppError("ERR_RESERVATION_NOT_FOUND");
    }

    const now = new Date();
    const refundable = now.getTime() < cancelDeadlineAt(schedule.startsAt, policy.cancelDeadlineMinutes).getTime();
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: refundable ? "CANCELED" : "LATE_CANCELED", canceledAt: now },
    });
    await tx.ticketUsage.update({
      where: { id: existing.ticketUsage.id },
      data: refundable ? { status: "RELEASED", releasedAt: now } : { status: "CONSUMED" },
    });
    await tx.classSchedule.update({
      where: { id: schedule.id },
      data: { reservedCount: { decrement: 1 } },
    });
    schedule.reservedCount -= 1;
    await sweepLockedWaitlistSchedule(tx, schedule, policy, now);

    return {
      status: refundable ? "CANCELED" : "LATE_CANCELED",
      refunded: refundable,
      remainingCount: await getTicketRemainingCount(tx, ticket.id),
    };
  });
}
