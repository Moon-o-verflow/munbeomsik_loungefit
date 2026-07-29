import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { toKst } from "@/lib/time";
import { getTicketRemainingCount } from "@/services/ledger";
import { cancelMemberReservation, createMemberReservation } from "@/services/reservation";
import { cancelMemberWaitlist, createMemberWaitlist, sweepWaitlistSchedule } from "@/services/waitlist";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type MemberTicket = { memberId: string; ticketId: string };

async function clearDatabase() {
  await prisma.reservation.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.ticketUsage.deleteMany();
  await prisma.authCode.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.classSchedule.deleteMany();
  await prisma.manager.deleteMany();
  await prisma.member.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.policy.deleteMany();
}

function nonQuietPolicyHour() {
  return (toKst(new Date()).hour() + 1) % 24;
}

async function createPolicy(quietHoursStart = nonQuietPolicyHour(), quietHoursEnd = (quietHoursStart + 1) % 24) {
  await prisma.policy.create({
    data: {
      id: 1,
      cancelDeadlineMinutes: 180,
      rollingOpenDays: 14,
      rollingOpenHour: 0,
      waitlistTimeoutMinutes: 30,
      waitlistUrgentTimeoutMinutes: 10,
      waitlistUrgentThresholdMinutes: 180,
      quietHoursStart,
      quietHoursEnd,
      classCloseDeadlineMinutes: 120,
      classMinHeadcount: 3,
      noshowThresholdCount: 3,
      noshowSuspendDays: 7,
      noshowResetCycle: "MONTHLY",
      proxyBookingEnabled: true,
    },
  });
}

async function createMemberTicket(branchId: string, ticketTypeId: string, number: number, totalCount = 3): Promise<MemberTicket> {
  const member = await prisma.member.create({
    data: {
      branchId,
      name: `member-${number}`,
      phone: `0107777${String(number).padStart(4, "0")}`,
      phoneLast4: String(number).padStart(4, "0"),
    },
  });
  const ticket = await prisma.ticket.create({
    data: {
      memberId: member.id,
      ticketTypeId,
      totalCount,
      expiresAt: new Date("2030-12-31"),
      isActive: true,
    },
  });
  return { memberId: member.id, ticketId: ticket.id };
}

async function createFullScheduleFixture() {
  await createPolicy();
  const branch = await prisma.branch.create({ data: { name: "test-branch" } });
  const ticketType = await prisma.ticketType.create({ data: { code: "TEST_WAITLIST", name: "test ticket" } });
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
  const schedule = await prisma.classSchedule.create({
    data: {
      branchId: branch.id,
      ticketTypeId: ticketType.id,
      instructorName: "test instructor",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 50 * 60 * 1_000),
      capacity: 1,
    },
  });
  const reservedMember = await createMemberTicket(branch.id, ticketType.id, 1);
  const firstWaiter = await createMemberTicket(branch.id, ticketType.id, 2);
  const secondWaiter = await createMemberTicket(branch.id, ticketType.id, 3);
  const usage = await prisma.ticketUsage.create({
    data: { ticketId: reservedMember.ticketId, memberId: reservedMember.memberId, classScheduleId: schedule.id, status: "CONFIRMED" },
  });
  const reservation = await prisma.reservation.create({
    data: { classScheduleId: schedule.id, memberId: reservedMember.memberId, ticketUsageId: usage.id, status: "RESERVED" },
  });
  await prisma.classSchedule.update({ where: { id: schedule.id }, data: { reservedCount: 1 } });
  return { schedule, reservedMember, firstWaiter, secondWaiter, reservation };
}

async function ignoreBusinessError(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
}

integration("waitlist ledger and expiry", () => {
  beforeEach(async () => { await clearDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test("T-02: an expired offer releases its HOLD and offers the next waiter", async () => {
    const fixture = await createFullScheduleFixture();
    const first = await createMemberWaitlist(fixture.firstWaiter.memberId, fixture.schedule.id);
    const second = await createMemberWaitlist(fixture.secondWaiter.memberId, fixture.schedule.id);

    await cancelMemberReservation(fixture.reservedMember.memberId, fixture.reservation.id);
    const offered = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: first.waitlistId } });
    expect(offered.status).toBe("OFFERED");
    await prisma.waitlistEntry.update({ where: { id: offered.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    await sweepWaitlistSchedule(fixture.schedule.id);

    const expired = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: first.waitlistId } });
    const next = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: second.waitlistId } });
    const expiredUsage = await prisma.ticketUsage.findUniqueOrThrow({ where: { id: expired.ticketUsageId } });
    expect(expired.status).toBe("EXPIRED");
    expect(expiredUsage.status).toBe("RELEASED");
    expect(next.status).toBe("OFFERED");
    expect(await getTicketRemainingCount(prisma, fixture.firstWaiter.ticketId)).toBe(3);
  });

  test("D-08: the offer deadline never passes a 07:00 class start", async () => {
    await createPolicy(0, 1);
    const branch = await prisma.branch.create({ data: { name: "boundary-branch" } });
    const ticketType = await prisma.ticketType.create({ data: { code: "TEST_BOUNDARY", name: "boundary ticket" } });
    const simulatedNow = toKst(new Date()).add(2, "day").hour(6).minute(50).second(0).millisecond(0).toDate();
    const startsAt = toKst(simulatedNow).hour(7).minute(0).second(0).millisecond(0).toDate();
    const schedule = await prisma.classSchedule.create({
      data: { branchId: branch.id, ticketTypeId: ticketType.id, instructorName: "boundary", startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60 * 1_000), capacity: 1 },
    });
    const waiter = await createMemberTicket(branch.id, ticketType.id, 10);
    const usage = await prisma.ticketUsage.create({ data: { ticketId: waiter.ticketId, memberId: waiter.memberId, classScheduleId: schedule.id, status: "HOLD" } });
    const entry = await prisma.waitlistEntry.create({ data: { classScheduleId: schedule.id, memberId: waiter.memberId, ticketUsageId: usage.id, sequence: 1, status: "WAITING" } });

    await sweepWaitlistSchedule(schedule.id, simulatedNow);

    const offered = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(offered.status).toBe("OFFERED");
    expect(offered.expiresAt?.getTime()).toBe(startsAt.getTime());
  });

  test("T-09: 100 mixed reservation and waitlist operations preserve ledger-derived balances", async () => {
    await createPolicy();
    const branch = await prisma.branch.create({ data: { name: "ledger-branch" } });
    const ticketType = await prisma.ticketType.create({ data: { code: "TEST_LEDGER", name: "ledger ticket" } });
    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
    const schedules = await Promise.all(Array.from({ length: 3 }, (_, index) => prisma.classSchedule.create({
      data: {
        branchId: branch.id,
        ticketTypeId: ticketType.id,
        instructorName: `instructor-${index}`,
        startsAt: new Date(startsAt.getTime() + index * 60 * 60 * 1_000),
        endsAt: new Date(startsAt.getTime() + (index * 60 + 50) * 60 * 1_000),
        capacity: 1,
      },
    })));
    const members = await Promise.all(Array.from({ length: 6 }, (_, index) => createMemberTicket(branch.id, ticketType.id, 20 + index, 10)));
    let randomState = 17;
    const random = (length: number) => {
      randomState = (randomState * 1_103_515_245 + 12_345) & 0x7fffffff;
      return randomState % length;
    };

    for (let index = 0; index < 100; index += 1) {
      const schedule = schedules[random(schedules.length)];
      const member = members[random(members.length)];
      const operation = random(5);
      if (operation === 0) await ignoreBusinessError(createMemberReservation(member.memberId, schedule.id));
      if (operation === 1) {
        const reservation = await prisma.reservation.findFirst({ where: { memberId: member.memberId, status: "RESERVED" }, select: { id: true } });
        if (reservation) await ignoreBusinessError(cancelMemberReservation(member.memberId, reservation.id));
      }
      if (operation === 2) await ignoreBusinessError(createMemberWaitlist(member.memberId, schedule.id));
      if (operation === 3) {
        const entry = await prisma.waitlistEntry.findFirst({ where: { memberId: member.memberId, status: { in: ["WAITING", "OFFERED"] } }, select: { id: true } });
        if (entry) await ignoreBusinessError(cancelMemberWaitlist(member.memberId, entry.id));
      }
      if (operation === 4) await sweepWaitlistSchedule(schedule.id);
    }

    const expected = await prisma.$queryRaw<{ ticketId: string; remainingCount: number }[]>`
      SELECT
        t.id AS "ticketId",
        t.total_count - COUNT(u.id) FILTER (
          WHERE u.status IN ('CONFIRMED', 'CONSUMED')
            OR (
              u.status = 'HOLD'
              AND NOT EXISTS (
                SELECT 1 FROM class_schedule c WHERE c.id = u.class_schedule_id AND c.starts_at <= NOW()
              )
            )
        )::int AS "remainingCount"
      FROM ticket t
      LEFT JOIN ticket_usage u ON u.ticket_id = t.id
      GROUP BY t.id, t.total_count
    `;
    for (const ticket of expected) {
      expect(ticket.remainingCount).toBeGreaterThanOrEqual(0);
      expect(await getTicketRemainingCount(prisma, ticket.ticketId)).toBe(ticket.remainingCount);
    }
  }, 90_000);
});
