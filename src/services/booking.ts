import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { kstDateString } from "@/lib/time";
import { getTicketRemainingCount } from "@/services/ledger";

export type LockedSchedule = {
  id: string;
  branchId: string;
  ticketTypeId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  reservedCount: number;
  status: "SCHEDULED" | "CLOSED" | "CANCELED";
};

export type LockedTicket = {
  id: string;
  expiresAt: Date;
  dailyLimit: number | null;
  weeklyLimit: number | null;
};

export async function lockSchedule(tx: Prisma.TransactionClient, scheduleId: string) {
  const schedules = await tx.$queryRaw<LockedSchedule[]>`
    SELECT
      id,
      branch_id AS "branchId",
      ticket_type_id AS "ticketTypeId",
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      capacity,
      reserved_count AS "reservedCount",
      status
    FROM class_schedule
    WHERE id = ${scheduleId}::uuid
    FOR UPDATE
  `;
  return schedules[0] ?? null;
}

export async function lockTicket(tx: Prisma.TransactionClient, ticketId: string) {
  const tickets = await tx.$queryRaw<LockedTicket[]>`
    SELECT id, expires_at AS "expiresAt", daily_limit AS "dailyLimit", weekly_limit AS "weeklyLimit"
    FROM ticket
    WHERE id = ${ticketId}::uuid
    FOR UPDATE
  `;
  return tickets[0] ?? null;
}

export async function selectAndLockTicket(
  tx: Prisma.TransactionClient,
  memberId: string,
  schedule: LockedSchedule,
) {
  const typeTickets = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM ticket
    WHERE member_id = ${memberId}::uuid
      AND ticket_type_id = ${schedule.ticketTypeId}::uuid
      AND is_active = true
    ORDER BY expires_at ASC, created_at ASC
  `;

  if (typeTickets.length === 0) {
    throw new AppError("ERR_TICKET_TYPE_MISMATCH");
  }

  const scheduleDate = kstDateString(schedule.startsAt);
  const validTickets = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM ticket
    WHERE member_id = ${memberId}::uuid
      AND ticket_type_id = ${schedule.ticketTypeId}::uuid
      AND is_active = true
      AND expires_at >= ${scheduleDate}::date
    ORDER BY expires_at ASC, created_at ASC
  `;

  if (validTickets.length === 0) {
    throw new AppError("ERR_TICKET_EXPIRED");
  }

  for (const candidate of validTickets) {
    // Reservation and waitlist transactions always lock class_schedule before ticket.
    const ticket = await lockTicket(tx, candidate.id);
    if (ticket && (await getTicketRemainingCount(tx, ticket.id)) >= 1) {
      return ticket;
    }
  }

  throw new AppError("ERR_NO_REMAINING_COUNT");
}

export async function getActiveWaitlistOfferCount(tx: Prisma.TransactionClient, scheduleId: string) {
  const rows = await tx.$queryRaw<{ offerCount: number }[]>`
    SELECT COUNT(*)::int AS "offerCount"
    FROM waitlist_entry
    WHERE class_schedule_id = ${scheduleId}::uuid
      AND status = 'OFFERED'
  `;
  return rows[0]?.offerCount ?? 0;
}
