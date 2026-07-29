import { AppError, ERROR_DEFINITIONS } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { type AdminScope } from "@/lib/scope";
import { kstDateTime, kstDayBounds, kstWeekBounds } from "@/lib/time";
import { cancelReservationForMember, createReservationForMember } from "@/services/reservation";
import { getProxyMember } from "@/services/admin-members";
import { getMemberScheduleList } from "@/services/schedule";
import { prisma } from "@/lib/db";
import { getTicketUsageCount } from "@/services/ledger";

export async function getProxyBookingAvailable(scope: AdminScope, memberId: string, date: string) {
  const policy = await getPolicy();
  if (!policy.proxyBookingEnabled) throw new AppError("ERR_FORBIDDEN");
  const targetDate = kstDateTime(date, "00:00");
  if (!targetDate) throw new AppError("ERR_INVALID_REQUEST");
  const [proxyMember, scheduleList] = await Promise.all([
    getProxyMember(scope, memberId),
    getMemberScheduleList(memberId, date, scope.branchId ?? undefined),
  ]);
  return {
    member: proxyMember.member.isCrossBranch
      ? proxyMember.member
      : {
          ...proxyMember.member,
          tickets: await Promise.all(proxyMember.tickets.map(async (ticket) => ({
            ...ticket,
            dailyUsed: await getTicketUsageCount(prisma, ticket.id, kstDayBounds(targetDate).start, kstDayBounds(targetDate).end),
            weeklyUsed: await getTicketUsageCount(prisma, ticket.id, kstWeekBounds(targetDate).start, kstWeekBounds(targetDate).end),
          }))),
        },
    schedules: scheduleList.schedules.map((schedule) => ({
      id: schedule.id,
      startsAt: schedule.startsAt,
      branchName: schedule.branchName,
      ticketTypeName: schedule.ticketTypeName,
      instructorName: schedule.instructorName,
      capacity: schedule.capacity,
      reservedCount: schedule.reservedCount,
      bookable: schedule.cardState === "AVAILABLE",
      blockedReason: schedule.cardState === "AVAILABLE" ? null : schedule.blockedReason ?? (schedule.cardState === "FULL" ? "ERR_CLASS_FULL" : "ERR_CLASS_CLOSED"),
      blockedMessage: schedule.cardState === "AVAILABLE"
        ? null
        : ERROR_DEFINITIONS[schedule.blockedReason ?? (schedule.cardState === "FULL" ? "ERR_CLASS_FULL" : "ERR_CLASS_CLOSED")].message,
    })),
  };
}

export async function createProxyBooking(scope: AdminScope, memberId: string, scheduleId: string) {
  const policy = await getPolicy();
  if (!policy.proxyBookingEnabled) throw new AppError("ERR_FORBIDDEN");
  await getProxyMember(scope, memberId);
  return createReservationForMember(memberId, scheduleId, {
    source: "PROXY",
    createdByManagerId: scope.managerId,
    scope,
  });
}

export async function cancelProxyBooking(scope: AdminScope, reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { memberId: true },
  });
  if (!reservation) throw new AppError("ERR_RESERVATION_NOT_FOUND");
  return cancelReservationForMember(reservation.memberId, reservationId, scope);
}
