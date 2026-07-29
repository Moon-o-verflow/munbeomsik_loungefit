import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createMemberReservation } from "@/services/reservation";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type Fixture = {
  memberIds: string[];
  ticketTypeId: string;
  scheduleIds: [string, string];
};

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

async function makeFixture(memberCount: number, ticketCount: number): Promise<Fixture> {
  await clearDatabase();
  await prisma.policy.create({
    data: {
      id: 1, cancelDeadlineMinutes: 180, rollingOpenDays: 14, rollingOpenHour: 0,
      waitlistTimeoutMinutes: 30, waitlistUrgentTimeoutMinutes: 10, waitlistUrgentThresholdMinutes: 180,
      quietHoursStart: 23, quietHoursEnd: 7, classCloseDeadlineMinutes: 120, classMinHeadcount: 3,
      noshowThresholdCount: 3, noshowSuspendDays: 7, noshowResetCycle: "MONTHLY", proxyBookingEnabled: true,
    },
  });
  const branch = await prisma.branch.create({ data: { name: "테스트점" } });
  const ticketType = await prisma.ticketType.create({ data: { code: "TEST_PILATES", name: "테스트 필라테스" } });
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
  const scheduleOne = await prisma.classSchedule.create({
    data: { branchId: branch.id, ticketTypeId: ticketType.id, instructorName: "테스트 강사", startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60 * 1_000), capacity: 1 },
  });
  const scheduleTwo = await prisma.classSchedule.create({
    data: { branchId: branch.id, ticketTypeId: ticketType.id, instructorName: "테스트 강사", startsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000), endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000 + 50 * 60 * 1_000), capacity: 1 },
  });
  const memberIds: string[] = [];
  for (let index = 0; index < memberCount; index += 1) {
    const member = await prisma.member.create({ data: { branchId: branch.id, name: `회원${index}`, phone: `0109999${`${index}`.padStart(4, "0")}`, phoneLast4: `${index}`.padStart(4, "0") } });
    await prisma.ticket.create({ data: { memberId: member.id, ticketTypeId: ticketType.id, totalCount: ticketCount, expiresAt: new Date("2030-12-31"), isActive: true } });
    memberIds.push(member.id);
  }
  return { memberIds, ticketTypeId: ticketType.id, scheduleIds: [scheduleOne.id, scheduleTwo.id] };
}

function errorCode(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" && result.reason instanceof AppError ? result.reason.code : null;
}

integration("reservation concurrency", () => {
  beforeEach(async () => { await clearDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test("C-01: ten simultaneous requests for one seat produce one reservation", async () => {
    const fixture = await makeFixture(10, 1);
    const results = await Promise.allSettled(fixture.memberIds.map((memberId) => createMemberReservation(memberId, fixture.scheduleIds[0])));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => errorCode(result) === "ERR_CLASS_FULL")).toHaveLength(9);
  });

  test("C-02: simultaneous duplicate requests leave one active reservation", async () => {
    const fixture = await makeFixture(1, 2);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => createMemberReservation(fixture.memberIds[0], fixture.scheduleIds[0])));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => errorCode(result) === "ERR_DUPLICATE_RESERVATION")).toHaveLength(4);
  });

  test("C-03: one remaining credit cannot reserve two schedules concurrently", async () => {
    const fixture = await makeFixture(1, 1);
    const results = await Promise.allSettled([
      createMemberReservation(fixture.memberIds[0], fixture.scheduleIds[0]),
      createMemberReservation(fixture.memberIds[0], fixture.scheduleIds[1]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => errorCode(result) === "ERR_NO_REMAINING_COUNT")).toHaveLength(1);
  });
});
