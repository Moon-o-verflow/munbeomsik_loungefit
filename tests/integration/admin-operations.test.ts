import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { AdminScope } from "@/lib/scope";
import { toKst } from "@/lib/time";
import { getTicketRemainingCount } from "@/services/ledger";
import { createProxyBooking } from "@/services/proxy-booking";
import { closeAdminSchedule, getAdminScheduleDetail } from "@/services/admin-schedules";
import { recordAttendance, revertAttendance } from "@/services/attendance";
import { searchAdminMembers } from "@/services/admin-members";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type Fixture = {
  scope: AdminScope;
  otherScope: AdminScope;
  branchId: string;
  otherBranchId: string;
  ticketTypeId: string;
  otherTicketTypeId: string;
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

async function createFixture(): Promise<Fixture> {
  await prisma.policy.create({
    data: {
      id: 1,
      cancelDeadlineMinutes: 180,
      rollingOpenDays: 14,
      rollingOpenHour: 0,
      waitlistTimeoutMinutes: 30,
      waitlistUrgentTimeoutMinutes: 10,
      waitlistUrgentThresholdMinutes: 180,
      quietHoursStart: 23,
      quietHoursEnd: 7,
      classCloseDeadlineMinutes: 120,
      classMinHeadcount: 3,
      noshowThresholdCount: 3,
      noshowSuspendDays: 7,
      noshowResetCycle: "MONTHLY",
      proxyBookingEnabled: true,
    },
  });
  const branch = await prisma.branch.create({ data: { name: "admin-test-own" } });
  const otherBranch = await prisma.branch.create({ data: { name: "admin-test-other" } });
  const manager = await prisma.manager.create({ data: { branchId: branch.id, loginId: "admin-test-manager", passwordHash: "unused", role: "MANAGER", name: "manager" } });
  const otherManager = await prisma.manager.create({ data: { branchId: otherBranch.id, loginId: "admin-test-other-manager", passwordHash: "unused", role: "MANAGER", name: "other-manager" } });
  const ticketType = await prisma.ticketType.create({ data: { code: "ADMIN_TEST_A", name: "admin-test-a" } });
  const otherTicketType = await prisma.ticketType.create({ data: { code: "ADMIN_TEST_B", name: "admin-test-b" } });
  return {
    scope: { managerId: manager.id, role: "MANAGER", branchId: branch.id },
    otherScope: { managerId: otherManager.id, role: "MANAGER", branchId: otherBranch.id },
    branchId: branch.id,
    otherBranchId: otherBranch.id,
    ticketTypeId: ticketType.id,
    otherTicketTypeId: otherTicketType.id,
  };
}

let sequence = 0;

async function createMemberTicket(
  fixture: Fixture,
  options: { branchId?: string; ticketTypeId?: string; totalCount?: number; expiresAt?: Date; dailyLimit?: number | null; weeklyLimit?: number | null; isSuspended?: boolean } = {},
) {
  sequence += 1;
  const member = await prisma.member.create({
    data: {
      branchId: options.branchId ?? fixture.branchId,
      name: `admin-member-${sequence}`,
      phone: `0106666${String(sequence).padStart(4, "0")}`,
      phoneLast4: String(sequence).padStart(4, "0"),
      isSuspended: options.isSuspended ?? false,
    },
  });
  const ticket = await prisma.ticket.create({
    data: {
      memberId: member.id,
      ticketTypeId: options.ticketTypeId ?? fixture.ticketTypeId,
      totalCount: options.totalCount ?? 3,
      expiresAt: options.expiresAt ?? new Date("2030-12-31"),
      dailyLimit: options.dailyLimit,
      weeklyLimit: options.weeklyLimit,
      isActive: true,
    },
  });
  return { member, ticket };
}

async function createSchedule(
  fixture: Fixture,
  options: { startsAt?: Date; endsAt?: Date; capacity?: number; branchId?: string; ticketTypeId?: string } = {},
) {
  const startsAt = options.startsAt ?? new Date(Date.now() + 48 * 60 * 60 * 1_000);
  return prisma.classSchedule.create({
    data: {
      branchId: options.branchId ?? fixture.branchId,
      ticketTypeId: options.ticketTypeId ?? fixture.ticketTypeId,
      instructorName: "admin-test-instructor",
      startsAt,
      endsAt: options.endsAt ?? new Date(startsAt.getTime() + 50 * 60 * 1_000),
      capacity: options.capacity ?? 4,
    },
  });
}

async function createReservedUsage(memberId: string, ticketId: string, scheduleId: string) {
  const usage = await prisma.ticketUsage.create({ data: { memberId, ticketId, classScheduleId: scheduleId, status: "CONFIRMED" } });
  return prisma.reservation.create({ data: { memberId, classScheduleId: scheduleId, ticketUsageId: usage.id, status: "RESERVED" } });
}

async function expectCode(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toMatchObject({ code });
}

integration("admin operations", () => {
  beforeEach(async () => {
    sequence = 0;
    await clearDatabase();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  test("proxy booking applies the same member, ticket, limit, and capacity validation", async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture);
    const bookable = await createMemberTicket(fixture);
    const created = await createProxyBooking(fixture.scope, bookable.member.id, schedule.id);
    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: created.reservationId } });
    expect(reservation.source).toBe("PROXY");
    expect(reservation.createdByManagerId).toBe(fixture.scope.managerId);

    const suspended = await createMemberTicket(fixture, { isSuspended: true });
    await expectCode(createProxyBooking(fixture.scope, suspended.member.id, schedule.id), "ERR_MEMBER_SUSPENDED");

    const mismatch = await createMemberTicket(fixture, { ticketTypeId: fixture.otherTicketTypeId });
    await expectCode(createProxyBooking(fixture.scope, mismatch.member.id, schedule.id), "ERR_TICKET_TYPE_MISMATCH");

    const expired = await createMemberTicket(fixture, { expiresAt: new Date("2020-01-01") });
    await expectCode(createProxyBooking(fixture.scope, expired.member.id, schedule.id), "ERR_TICKET_EXPIRED");

    const empty = await createMemberTicket(fixture, { totalCount: 1 });
    await prisma.ticketUsage.create({ data: { memberId: empty.member.id, ticketId: empty.ticket.id, status: "CONSUMED" } });
    await expectCode(createProxyBooking(fixture.scope, empty.member.id, schedule.id), "ERR_NO_REMAINING_COUNT");

    const dailyLimited = await createMemberTicket(fixture, { totalCount: 2, dailyLimit: 1 });
    const dailyStartsAt = toKst(new Date()).add(2, "day").hour(10).minute(0).second(0).millisecond(0).toDate();
    const dailySchedule = await createSchedule(fixture, { startsAt: dailyStartsAt });
    const sameDay = await createSchedule(fixture, { startsAt: new Date(dailyStartsAt.getTime() + 60 * 60 * 1_000) });
    await prisma.ticketUsage.create({ data: { memberId: dailyLimited.member.id, ticketId: dailyLimited.ticket.id, classScheduleId: sameDay.id, status: "CONFIRMED" } });
    await expectCode(createProxyBooking(fixture.scope, dailyLimited.member.id, dailySchedule.id), "ERR_DAILY_LIMIT_EXCEEDED");

    const fullSchedule = await createSchedule(fixture, { capacity: 1 });
    const occupant = await createMemberTicket(fixture);
    await createReservedUsage(occupant.member.id, occupant.ticket.id, fullSchedule.id);
    await prisma.classSchedule.update({ where: { id: fullSchedule.id }, data: { reservedCount: 1 } });
    const noSeat = await createMemberTicket(fixture);
    await expectCode(createProxyBooking(fixture.scope, noSeat.member.id, fullSchedule.id), "ERR_CLASS_FULL");
  });

  test("attendance consumes the ledger and can be reverted only for 24 hours", async () => {
    const fixture = await createFixture();
    const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    const schedule = await createSchedule(fixture, { startsAt, endsAt: new Date(Date.now() - 60 * 60 * 1_000) });
    const member = await createMemberTicket(fixture);
    const reservation = await createReservedUsage(member.member.id, member.ticket.id, schedule.id);

    await recordAttendance(fixture.scope, reservation.id, "ATTENDED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("ATTENDED");
    expect((await prisma.ticketUsage.findFirstOrThrow({ where: { ticketId: member.ticket.id } })).status).toBe("CONSUMED");

    await revertAttendance(fixture.scope, reservation.id);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("RESERVED");
    expect((await prisma.ticketUsage.findFirstOrThrow({ where: { ticketId: member.ticket.id } })).status).toBe("CONFIRMED");

    const staleSchedule = await createSchedule(fixture, { startsAt: new Date(Date.now() - 27 * 60 * 60 * 1_000), endsAt: new Date(Date.now() - 25 * 60 * 60 * 1_000) });
    const staleMember = await createMemberTicket(fixture);
    const staleReservation = await createReservedUsage(staleMember.member.id, staleMember.ticket.id, staleSchedule.id);
    await recordAttendance(fixture.scope, staleReservation.id, "NO_SHOW");
    await expectCode(revertAttendance(fixture.scope, staleReservation.id), "ERR_ATTENDANCE_REVERT_EXPIRED");
  });

  test("closing a class releases both reservations and waitlist holds", async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture, { capacity: 2 });
    const reservedMember = await createMemberTicket(fixture);
    const reservation = await createReservedUsage(reservedMember.member.id, reservedMember.ticket.id, schedule.id);
    const waitingMember = await createMemberTicket(fixture);
    const hold = await prisma.ticketUsage.create({ data: { memberId: waitingMember.member.id, ticketId: waitingMember.ticket.id, classScheduleId: schedule.id, status: "HOLD" } });
    const waitlist = await prisma.waitlistEntry.create({ data: { classScheduleId: schedule.id, memberId: waitingMember.member.id, ticketUsageId: hold.id, sequence: 1, status: "WAITING" } });
    await prisma.classSchedule.update({ where: { id: schedule.id }, data: { reservedCount: 1 } });

    await closeAdminSchedule(fixture.scope, schedule.id, "low attendance");

    expect((await prisma.classSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe("CLOSED");
    expect((await prisma.classSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).reservedCount).toBe(0);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("CLASS_CANCELED");
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: waitlist.id } })).status).toBe("RELEASED");
    expect((await prisma.ticketUsage.findFirstOrThrow({ where: { ticketId: reservedMember.ticket.id } })).status).toBe("RELEASED");
    expect((await prisma.ticketUsage.findFirstOrThrow({ where: { ticketId: waitingMember.ticket.id } })).status).toBe("RELEASED");
    expect(await getTicketRemainingCount(prisma, reservedMember.ticket.id)).toBe(reservedMember.ticket.totalCount);
    expect(await getTicketRemainingCount(prisma, waitingMember.ticket.id)).toBe(waitingMember.ticket.totalCount);
  });

  test("manager scope denies another branch and masks cross-branch reservation history members", async () => {
    const fixture = await createFixture();
    const ownSchedule = await createSchedule(fixture);
    const otherSchedule = await createSchedule(fixture, { branchId: fixture.otherBranchId });
    const crossMember = await createMemberTicket(fixture, { branchId: fixture.otherBranchId });
    await createReservedUsage(crossMember.member.id, crossMember.ticket.id, ownSchedule.id);

    const results = await searchAdminMembers(fixture.scope, crossMember.member.name);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: crossMember.member.id, phoneLast4: crossMember.member.phoneLast4, isCrossBranch: true });
    expect("phone" in results[0]).toBe(false);
    await expectCode(getAdminScheduleDetail(fixture.scope, otherSchedule.id), "ERR_FORBIDDEN");
  });
});
