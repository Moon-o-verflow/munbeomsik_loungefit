import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type LedgerClient = PrismaClient | Prisma.TransactionClient;

export async function getTicketRemainingCount(client: LedgerClient, ticketId: string) {
  const rows = await client.$queryRaw<{ remainingCount: number }[]>`
    SELECT t.total_count - COUNT(u.id)::int AS "remainingCount"
    FROM ticket t
    LEFT JOIN ticket_usage u
      ON u.ticket_id = t.id
      AND (
        u.status IN ('CONFIRMED', 'CONSUMED')
        OR (
          u.status = 'HOLD'
          AND (
            NOT EXISTS (
              SELECT 1
              FROM class_schedule hold_schedule
              WHERE hold_schedule.id = u.class_schedule_id
                AND hold_schedule.starts_at <= NOW()
            )
          )
        )
      )
    WHERE t.id = ${ticketId}::uuid
    GROUP BY t.id, t.total_count
  `;

  return rows[0]?.remainingCount ?? 0;
}

export async function getTicketUsageCount(
  client: LedgerClient,
  ticketId: string,
  from: Date,
  to: Date,
) {
  const rows = await client.$queryRaw<{ usageCount: number }[]>`
    SELECT COUNT(*)::int AS "usageCount"
    FROM ticket_usage u
    INNER JOIN class_schedule c ON c.id = u.class_schedule_id
    WHERE u.ticket_id = ${ticketId}::uuid
      AND c.starts_at >= ${from}
      AND c.starts_at < ${to}
      AND (
        u.status IN ('CONFIRMED', 'CONSUMED')
        OR (u.status = 'HOLD' AND c.starts_at > NOW())
      )
  `;

  return rows[0]?.usageCount ?? 0;
}

export async function getTicketHoldCount(client: LedgerClient, ticketId: string) {
  const rows = await client.$queryRaw<{ holdCount: number }[]>`
    SELECT COUNT(*)::int AS "holdCount"
    FROM ticket_usage u
    INNER JOIN class_schedule c ON c.id = u.class_schedule_id
    WHERE u.ticket_id = ${ticketId}::uuid
      AND u.status = 'HOLD'
      AND c.starts_at > NOW()
  `;
  return rows[0]?.holdCount ?? 0;
}
