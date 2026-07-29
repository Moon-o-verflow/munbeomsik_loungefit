import { prisma } from "@/lib/db";
import { kstDayBounds, kstWeekBounds } from "@/lib/time";
import { getTicketHoldCount, getTicketRemainingCount, getTicketUsageCount } from "@/services/ledger";

export async function getMemberTickets(memberId: string) {
  const now = new Date();
  const day = kstDayBounds(now);
  const week = kstWeekBounds(now);
  const tickets = await prisma.ticket.findMany({
    where: { memberId, isActive: true },
    include: { ticketType: { select: { name: true } } },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { isSuspended: true, suspendedReason: true, suspendedUntil: true },
  });

  return {
    tickets: await Promise.all(
      tickets.map(async (ticket) => ({
        id: ticket.id,
        ticketTypeName: ticket.ticketType.name,
        totalCount: ticket.totalCount,
        remainingCount: await getTicketRemainingCount(prisma, ticket.id),
        holdCount: await getTicketHoldCount(prisma, ticket.id),
        expiresAt: ticket.expiresAt.toISOString().slice(0, 10),
        daysUntilExpiry: Math.ceil((ticket.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1_000)),
        dailyLimit: ticket.dailyLimit,
        weeklyLimit: ticket.weeklyLimit,
        dailyUsed: await getTicketUsageCount(prisma, ticket.id, day.start, day.end),
        weeklyUsed: await getTicketUsageCount(prisma, ticket.id, week.start, week.end),
      })),
    ),
    suspension: {
      isSuspended: member?.isSuspended ?? false,
      reason: member?.suspendedReason ?? null,
      until: member?.suspendedUntil?.toISOString().slice(0, 10) ?? null,
    },
  };
}
