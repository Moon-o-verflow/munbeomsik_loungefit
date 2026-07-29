import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertScopeBranch, type AdminScope } from "@/lib/scope";
import { lockSchedule, lockTicket, type LockedSchedule } from "@/services/booking";

type AdminReservationLock = {
  id: string;
  memberId: string;
  ticketUsageId: string;
  status: "RESERVED" | "CANCELED" | "LATE_CANCELED" | "ATTENDED" | "NO_SHOW" | "CLASS_CANCELED";
};

async function lockAdminReservation(tx: Prisma.TransactionClient, reservationId: string, scheduleId: string) {
  const reservations = await tx.$queryRaw<AdminReservationLock[]>`
    SELECT id, member_id AS "memberId", ticket_usage_id AS "ticketUsageId", status
    FROM reservation
    WHERE id = ${reservationId}::uuid AND class_schedule_id = ${scheduleId}::uuid
    FOR UPDATE
  `;
  return reservations[0] ?? null;
}

function ensureAttendanceEligible(schedule: LockedSchedule, now: Date) {
  if (schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
  if (schedule.startsAt.getTime() > now.getTime()) throw new AppError("ERR_CLASS_NOT_STARTED");
}

async function getReservationTicket(tx: Prisma.TransactionClient, reservationId: string, scheduleId: string) {
  return tx.reservation.findFirst({
    where: { id: reservationId, classScheduleId: scheduleId },
    select: { id: true, ticketUsage: { select: { ticketId: true } } },
  });
}

async function applyAttendance(
  tx: Prisma.TransactionClient,
  schedule: LockedSchedule,
  reservationId: string,
  status: "ATTENDED" | "NO_SHOW",
) {
  const reservationBeforeLock = await getReservationTicket(tx, reservationId, schedule.id);
  if (!reservationBeforeLock) throw new AppError("ERR_RESERVATION_NOT_FOUND");
  if (!(await lockTicket(tx, reservationBeforeLock.ticketUsage.ticketId))) throw new AppError("ERR_RESERVATION_NOT_FOUND");
  const reservation = await lockAdminReservation(tx, reservationId, schedule.id);
  if (!reservation || reservation.status !== "RESERVED") throw new AppError("ERR_RESERVATION_NOT_FOUND");

  await tx.reservation.update({ where: { id: reservation.id }, data: { status } });
  await tx.ticketUsage.update({ where: { id: reservation.ticketUsageId }, data: { status: "CONSUMED" } });
  return { reservationId: reservation.id, status };
}

export async function recordAttendance(scope: AdminScope, reservationId: string, status: "ATTENDED" | "NO_SHOW") {
  const existing = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { classScheduleId: true } });
  if (!existing) throw new AppError("ERR_RESERVATION_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, existing.classScheduleId);
    if (!schedule) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    assertScopeBranch(scope, schedule.branchId);
    ensureAttendanceEligible(schedule, new Date());
    return applyAttendance(tx, schedule, reservationId, status);
  });
}

export async function revertAttendance(scope: AdminScope, reservationId: string) {
  const existing = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { classScheduleId: true, ticketUsage: { select: { ticketId: true } } },
  });
  if (!existing) throw new AppError("ERR_RESERVATION_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, existing.classScheduleId);
    if (!schedule) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    assertScopeBranch(scope, schedule.branchId);
    if (schedule.status !== "SCHEDULED") throw new AppError("ERR_CLASS_CLOSED");
    const now = new Date();
    if (now.getTime() > schedule.endsAt.getTime() + 24 * 60 * 60 * 1_000) {
      throw new AppError("ERR_ATTENDANCE_REVERT_EXPIRED");
    }
    if (!(await lockTicket(tx, existing.ticketUsage.ticketId))) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    const reservation = await lockAdminReservation(tx, reservationId, schedule.id);
    if (!reservation || (reservation.status !== "ATTENDED" && reservation.status !== "NO_SHOW")) {
      throw new AppError("ERR_RESERVATION_NOT_FOUND");
    }
    await tx.reservation.update({ where: { id: reservation.id }, data: { status: "RESERVED" } });
    await tx.ticketUsage.update({ where: { id: reservation.ticketUsageId }, data: { status: "CONFIRMED" } });
    return { reservationId: reservation.id, status: "RESERVED" };
  });
}

export async function recordBulkAttendance(
  scope: AdminScope,
  scheduleId: string,
  input: { attended: string[]; noShow: string[] },
) {
  const selectedIds = [...input.attended, ...input.noShow];
  if (selectedIds.length === 0 || new Set(selectedIds).size !== selectedIds.length) throw new AppError("ERR_INVALID_REQUEST");
  return prisma.$transaction(async (tx) => {
    const schedule = await lockSchedule(tx, scheduleId);
    if (!schedule) throw new AppError("ERR_CLASS_CLOSED");
    assertScopeBranch(scope, schedule.branchId);
    ensureAttendanceEligible(schedule, new Date());
    const selected = await tx.reservation.findMany({
      where: { id: { in: selectedIds }, classScheduleId: schedule.id },
      select: { id: true, ticketUsage: { select: { ticketId: true } } },
    });
    if (selected.length !== selectedIds.length) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    const ticketIds = [...new Set(selected.map((reservation) => reservation.ticketUsage.ticketId))].sort();
    for (const ticketId of ticketIds) {
      if (!(await lockTicket(tx, ticketId))) throw new AppError("ERR_RESERVATION_NOT_FOUND");
    }
    const attended = new Set(input.attended);
    const results: Array<{ reservationId: string; status: "ATTENDED" | "NO_SHOW" }> = [];
    for (const reservationId of selectedIds) {
      const reservation = await lockAdminReservation(tx, reservationId, schedule.id);
      if (!reservation || reservation.status !== "RESERVED") throw new AppError("ERR_RESERVATION_NOT_FOUND");
      const status = attended.has(reservationId) ? "ATTENDED" : "NO_SHOW";
      await tx.reservation.update({ where: { id: reservation.id }, data: { status } });
      await tx.ticketUsage.update({ where: { id: reservation.ticketUsageId }, data: { status: "CONSUMED" } });
      results.push({ reservationId, status });
    }
    return { scheduleId: schedule.id, processed: results };
  });
}
