import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { KST_TIME_ZONE, kstNow } from "../src/lib/time";

type TicketCode = "PT_1ON1" | "PILATES_1ON4" | "YOGA";

const KST = KST_TIME_ZONE;

const memberSeeds: Array<{
  phone: string;
  name: string;
  branchCode: "GANGNAM" | "SEONGSU" | "PANGYO";
  ticketCode: TicketCode;
  total: number;
  remaining: number;
  preloadedConsumed?: number;
  expiresInDays: number;
  suspended?: boolean;
}> = [
  { phone: "01011110001", name: "김민서", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 6, expiresInDays: 64 },
  { phone: "01011110002", name: "정하윤", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 4, preloadedConsumed: 14, expiresInDays: 78 },
  { phone: "01011110003", name: "박서연", branchCode: "GANGNAM", ticketCode: "YOGA", total: 30, remaining: 2, preloadedConsumed: 23, expiresInDays: 17 },
  { phone: "01011110004", name: "강서현", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 3, preloadedConsumed: 15, expiresInDays: 43, suspended: true },
  { phone: "01011110005", name: "송예린", branchCode: "GANGNAM", ticketCode: "YOGA", total: 10, remaining: 0, expiresInDays: 7 },
  { phone: "01011110006", name: "노현우", branchCode: "GANGNAM", ticketCode: "YOGA", total: 30, remaining: 8, expiresInDays: 2 },
  { phone: "01011110007", name: "최유진", branchCode: "GANGNAM", ticketCode: "PT_1ON1", total: 10, remaining: 9, expiresInDays: 125 },
  { phone: "01011110008", name: "한지우", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 11, preloadedConsumed: 8, expiresInDays: 114 },
  { phone: "01011110009", name: "권민재", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 12, expiresInDays: 90 },
  { phone: "01011110010", name: "문지아", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 10, expiresInDays: 90 },
  { phone: "01011110011", name: "서도윤", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 9, expiresInDays: 90 },
  { phone: "01011110012", name: "오하린", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 8, expiresInDays: 90 },
  { phone: "01011110013", name: "임지후", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 7, expiresInDays: 90 },
  { phone: "01011110014", name: "장유나", branchCode: "GANGNAM", ticketCode: "PILATES_1ON4", total: 20, remaining: 6, expiresInDays: 90 },
  { phone: "01011110015", name: "이서준", branchCode: "SEONGSU", ticketCode: "PILATES_1ON4", total: 20, remaining: 3, preloadedConsumed: 6, expiresInDays: 90 },
  { phone: "01011110016", name: "윤채원", branchCode: "PANGYO", ticketCode: "PILATES_1ON4", total: 20, remaining: 7, preloadedConsumed: 2, expiresInDays: 90 },
  { phone: "01011110017", name: "고은채", branchCode: "SEONGSU", ticketCode: "YOGA", total: 20, remaining: 11, expiresInDays: 90 },
  { phone: "01011110018", name: "김도현", branchCode: "SEONGSU", ticketCode: "PILATES_1ON4", total: 20, remaining: 10, expiresInDays: 90 },
  { phone: "01011110019", name: "류서아", branchCode: "SEONGSU", ticketCode: "PILATES_1ON4", total: 20, remaining: 9, expiresInDays: 90 },
  { phone: "01011110020", name: "신우진", branchCode: "SEONGSU", ticketCode: "PT_1ON1", total: 10, remaining: 8, expiresInDays: 90 },
  { phone: "01011110021", name: "안유진", branchCode: "PANGYO", ticketCode: "YOGA", total: 20, remaining: 12, expiresInDays: 90 },
  { phone: "01011110022", name: "이준혁", branchCode: "PANGYO", ticketCode: "PILATES_1ON4", total: 20, remaining: 10, expiresInDays: 90 },
  { phone: "01011110023", name: "전다은", branchCode: "PANGYO", ticketCode: "PILATES_1ON4", total: 20, remaining: 9, expiresInDays: 90 },
  { phone: "01011110024", name: "최민준", branchCode: "PANGYO", ticketCode: "PT_1ON1", total: 10, remaining: 7, expiresInDays: 90 },
];

function isAllowedDay(day: number, allowed: number[]) {
  return allowed.includes(day);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED) {
    throw new Error("Seed execution is blocked in production unless ALLOW_SEED is set.");
  }

  const now = kstNow();
  const today = now.startOf("day");
  const managerPassword = process.env.ADMIN_SEED_PASSWORD;
  if (!managerPassword) throw new Error("ADMIN_SEED_PASSWORD is required for seed data.");

  await prisma.$transaction(async (tx) => {
    await tx.reservation.deleteMany();
    await tx.waitlistEntry.deleteMany();
    await tx.ticketUsage.deleteMany();
    await tx.authCode.deleteMany();
    await tx.ticket.deleteMany();
    await tx.classSchedule.deleteMany();
    await tx.manager.deleteMany();
    await tx.member.deleteMany();
    await tx.ticketType.deleteMany();
    await tx.branch.deleteMany();
    await tx.policy.deleteMany();

    await tx.policy.create({
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

    const branches = {
      GANGNAM: await tx.branch.create({ data: { name: "강남점" } }),
      SEONGSU: await tx.branch.create({ data: { name: "성수점" } }),
      PANGYO: await tx.branch.create({ data: { name: "판교점" } }),
    };

    const ticketTypes = {
      PT_1ON1: await tx.ticketType.create({ data: { code: "PT_1ON1", name: "1:1 개인레슨" } }),
      PILATES_1ON4: await tx.ticketType.create({ data: { code: "PILATES_1ON4", name: "1:4 기구 필라테스" } }),
      YOGA: await tx.ticketType.create({ data: { code: "YOGA", name: "요가 전용" } }),
    };

    const passwordHash = await bcrypt.hash(managerPassword, 10);
    await tx.manager.createMany({
      data: [
        { loginId: "manager_gangnam", name: "강남점 매니저", role: "MANAGER", branchId: branches.GANGNAM.id, passwordHash },
        { loginId: "manager_seongsu", name: "성수점 매니저", role: "MANAGER", branchId: branches.SEONGSU.id, passwordHash },
        { loginId: "manager_pangyo", name: "판교점 매니저", role: "MANAGER", branchId: branches.PANGYO.id, passwordHash },
        { loginId: "admin", name: "총괄 관리자", role: "ADMIN", passwordHash },
      ],
    });

    const scheduleData: Array<{
      branchId: string;
      ticketTypeId: string;
      instructorName: string;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
    }> = [];
    const addSchedule = (branchId: string, ticketCode: TicketCode, instructorName: string, hour: number, allowedDays: number[], capacity: number) => {
      for (let offset = -14; offset <= 21; offset += 1) {
        const date = today.add(offset, "day");
        if (!isAllowedDay(date.day(), allowedDays)) continue;
        const startsAt = date.hour(hour).minute(0).second(0).millisecond(0).toDate();
        scheduleData.push({
          branchId,
          ticketTypeId: ticketTypes[ticketCode].id,
          instructorName,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 50 * 60 * 1_000),
          capacity,
        });
      }
    };

    addSchedule(branches.GANGNAM.id, "YOGA", "박서연", 7, [1, 3, 5], 12);
    addSchedule(branches.GANGNAM.id, "PILATES_1ON4", "김지원", 10, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.GANGNAM.id, "PT_1ON1", "김지원", 12, [2, 4], 1);
    addSchedule(branches.GANGNAM.id, "PILATES_1ON4", "김지원", 17, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.GANGNAM.id, "PILATES_1ON4", "김지원", 19, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.GANGNAM.id, "YOGA", "박서연", 21, [2, 4, 6], 12);
    addSchedule(branches.SEONGSU.id, "PILATES_1ON4", "이수민", 10, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.SEONGSU.id, "PILATES_1ON4", "이수민", 19, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.SEONGSU.id, "YOGA", "이수민", 7, [1, 3, 5], 12);
    addSchedule(branches.PANGYO.id, "PILATES_1ON4", "박서연", 10, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.PANGYO.id, "PILATES_1ON4", "박서연", 19, [0, 1, 2, 3, 4, 5, 6], 8);
    addSchedule(branches.PANGYO.id, "YOGA", "김지원", 21, [2, 4, 6], 12);
    await tx.classSchedule.createMany({ data: scheduleData });

    const createdMembers = new Map<string, { memberId: string; ticketId: string }>();

    for (const seed of memberSeeds) {
      const member = await tx.member.create({
        data: {
          branchId: branches[seed.branchCode].id,
          name: seed.name,
          phone: seed.phone,
          phoneLast4: seed.phone.slice(-4),
          isSuspended: seed.suspended ?? false,
          suspendedReason: seed.suspended ? "노쇼 누적" : null,
          suspendedUntil: seed.suspended ? today.add(7, "day").toDate() : null,
        },
      });
      const ticket = await tx.ticket.create({
        data: {
          memberId: member.id,
          ticketTypeId: ticketTypes[seed.ticketCode].id,
          totalCount: seed.total,
          expiresAt: today.add(seed.expiresInDays, "day").toDate(),
          dailyLimit: 1,
          weeklyLimit: seed.ticketCode === "PT_1ON1" ? null : 3,
          isActive: true,
        },
      });
      const consumed = seed.preloadedConsumed ?? seed.total - seed.remaining;
      if (consumed > 0) {
        await tx.ticketUsage.createMany({
          data: Array.from({ length: consumed }, () => ({
            ticketId: ticket.id,
            memberId: member.id,
            status: "CONSUMED" as const,
          })),
        });
      }
      createdMembers.set(seed.phone, { memberId: member.id, ticketId: ticket.id });
    }

    const memberTicket = (phone: string) => {
      const value = createdMembers.get(phone);
      if (!value) throw new Error(`Missing seed member ${phone}`);
      return value;
    };
    type SeedReservationStatus = "RESERVED" | "CANCELED" | "LATE_CANCELED" | "ATTENDED" | "NO_SHOW" | "CLASS_CANCELED";

    const nextAt = (hour: number) => {
      const candidate = today.hour(hour).minute(0).second(0).millisecond(0);
      return candidate.isAfter(now) ? candidate : candidate.add(1, "day");
    };
    const findGangnamPilates = async (startsAt: Date) => {
      const schedule = await tx.classSchedule.findFirst({
        where: { branchId: branches.GANGNAM.id, ticketTypeId: ticketTypes.PILATES_1ON4.id, startsAt },
      });
      if (!schedule) throw new Error("Missing generated Gangnam Pilates schedule for seed data.");
      return schedule;
    };
    const createScenarioSchedule = async (ticketCode: TicketCode, startsAt: Date, capacity = 8) => tx.classSchedule.create({
      data: {
        branchId: branches.GANGNAM.id,
        ticketTypeId: ticketTypes[ticketCode].id,
        instructorName: "시연 강사",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60 * 1_000),
        capacity,
      },
    });
    const createReservation = async (
      member: { memberId: string; ticketId: string },
      schedule: { id: string },
      status: SeedReservationStatus,
    ) => {
      const usageStatus = status === "RESERVED"
        ? "CONFIRMED"
        : status === "CANCELED" || status === "CLASS_CANCELED"
          ? "RELEASED"
          : "CONSUMED";
      const usage = await tx.ticketUsage.create({
        data: {
          ticketId: member.ticketId,
          memberId: member.memberId,
          classScheduleId: schedule.id,
          status: usageStatus,
          ...(usageStatus === "RELEASED" ? { releasedAt: now.toDate() } : {}),
        },
      });
      await tx.reservation.create({
        data: {
          classScheduleId: schedule.id,
          memberId: member.memberId,
          ticketUsageId: usage.id,
          status,
          ...(status === "CANCELED" || status === "LATE_CANCELED" || status === "CLASS_CANCELED" ? { canceledAt: now.toDate() } : {}),
        },
      });
      if (status === "RESERVED" || status === "ATTENDED" || status === "NO_SHOW") {
        await tx.classSchedule.update({ where: { id: schedule.id }, data: { reservedCount: { increment: 1 } } });
      }
    };

    // S-1/S-2: the closest future 19:00 Pilates class is full with two waiters.
    const fullSchedule = await findGangnamPilates(nextAt(19).toDate());
    const fullMembers = ["01011110009", "01011110010", "01011110011", "01011110012", "01011110013", "01011110014", "01011110015", "01011110016"];
    for (const phone of fullMembers) {
      await createReservation(memberTicket(phone), fullSchedule, "RESERVED");
    }
    for (const [index, phone] of ["01011110018", "01011110019"].entries()) {
      const member = memberTicket(phone);
      const usage = await tx.ticketUsage.create({
        data: { ticketId: member.ticketId, memberId: member.memberId, classScheduleId: fullSchedule.id, status: "HOLD" },
      });
      await tx.waitlistEntry.create({
        data: { classScheduleId: fullSchedule.id, memberId: member.memberId, ticketUsageId: usage.id, sequence: index + 1, status: "WAITING" },
      });
    }

    // S-3: an active offer is kept independent from the full-class waitlist.
    const offeredSchedule = await findGangnamPilates(nextAt(10).toDate());
    const offeredMember = memberTicket("01011110008");
    const offeredUsage = await tx.ticketUsage.create({
      data: { ticketId: offeredMember.ticketId, memberId: offeredMember.memberId, classScheduleId: offeredSchedule.id, status: "HOLD" },
    });
    await tx.waitlistEntry.create({
      data: {
        classScheduleId: offeredSchedule.id,
        memberId: offeredMember.memberId,
        ticketUsageId: offeredUsage.id,
        sequence: 1,
        status: "OFFERED",
        offeredAt: now.toDate(),
        expiresAt: new Date(Math.min(now.add(25, "minute").valueOf(), offeredSchedule.startsAt.getTime())),
      },
    });

    // S-4/S-5: close-review and attendance-pending records for the administrator dashboard.
    const closeCandidate = await createScenarioSchedule(
      "PILATES_1ON4",
      now.add(90, "minute").second(0).millisecond(0).toDate(),
    );
    await createReservation(memberTicket("01011110022"), closeCandidate, "RESERVED");
    const attendancePending = await createScenarioSchedule(
      "PILATES_1ON4",
      now.subtract(2, "hour").second(0).millisecond(0).toDate(),
    );
    for (const phone of ["01011110009", "01011110010", "01011110011", "01011110012", "01011110013"]) {
      await createReservation(memberTicket(phone), attendancePending, "RESERVED");
    }

    // S-6/S-7: current-month NO_SHOW alerts and all five past reservation badges.
    const historyStart = now.subtract(4, "hour").second(0).millisecond(0);
    for (let index = 0; index < 3; index += 1) {
      const schedule = await createScenarioSchedule("YOGA", historyStart.subtract(index, "day").toDate(), 12);
      await createReservation(memberTicket("01011110003"), schedule, "NO_SHOW");
    }
    for (const [index, status] of (["ATTENDED", "CANCELED", "LATE_CANCELED", "CLASS_CANCELED"] as const).entries()) {
      const schedule = await createScenarioSchedule("YOGA", historyStart.subtract(index + 4, "day").toDate(), 12);
      if (status === "CLASS_CANCELED") {
        await tx.classSchedule.update({ where: { id: schedule.id }, data: { status: "CANCELED", canceledReason: "시연용 수업 취소" } });
      }
      await createReservation(memberTicket("01011110003"), schedule, status);
    }

    // S-8: two usages in the KST week make the weekly-limit case visible.
    const daysSinceMonday = (today.day() + 6) % 7;
    const weekStart = today.subtract(daysSinceMonday, "day");
    for (let offset = 0; offset < 2; offset += 1) {
      const startsAt = weekStart.add(offset, "day").hour(17).minute(0).second(0).millisecond(0);
      const schedule = await createScenarioSchedule("PILATES_1ON4", startsAt.toDate());
      await createReservation(memberTicket("01011110002"), schedule, startsAt.isAfter(now) ? "RESERVED" : "ATTENDED");
    }

    // S-9: suspension does not remove already-created future reservations.
    for (const offset of [4, 5]) {
      const schedule = await createScenarioSchedule("PILATES_1ON4", today.add(offset, "day").hour(17).minute(0).second(0).millisecond(0).toDate());
      await createReservation(memberTicket("01011110004"), schedule, "RESERVED");
    }

    // S-10: twenty historical cross-branch bookings feed the statistics matrix.
    for (let offset = 1; offset <= 10; offset += 1) {
      const schedule = await createScenarioSchedule("PILATES_1ON4", today.subtract(offset, "day").hour(19).minute(0).second(0).millisecond(0).toDate());
      await createReservation(memberTicket("01011110015"), schedule, "ATTENDED");
      await createReservation(memberTicket("01011110016"), schedule, "ATTENDED");
    }

    // S-11: two future classes with different fill rates keep schedule/statistics screens populated.
    const partialSchedules = [
      await createScenarioSchedule("PILATES_1ON4", today.add(2, "day").hour(17).minute(0).second(0).millisecond(0).toDate()),
      await createScenarioSchedule("PILATES_1ON4", today.add(3, "day").hour(17).minute(0).second(0).millisecond(0).toDate()),
    ];
    for (const phone of ["01011110009", "01011110010", "01011110011", "01011110012"]) {
      await createReservation(memberTicket(phone), partialSchedules[0], "RESERVED");
    }
    for (const phone of ["01011110009", "01011110010", "01011110011", "01011110012", "01011110013", "01011110014"]) {
      await createReservation(memberTicket(phone), partialSchedules[1], "RESERVED");
    }
  }, { timeout: 60_000 });

  console.info(`Seeded 3 branches, 24 members, and KST schedules (${KST}).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
