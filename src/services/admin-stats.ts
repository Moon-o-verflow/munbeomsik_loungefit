import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { scopedWhere, type AdminScope } from "@/lib/scope";

type StatsInput = { from: Date; to: Date };

export async function getAdminStats(scope: AdminScope, input: StatsInput) {
  if (input.from.getTime() >= input.to.getTime()) throw new AppError("ERR_INVALID_REQUEST");
  const schedules = await prisma.classSchedule.findMany({
    where: { ...scopedWhere(scope), startsAt: { gte: input.from, lt: input.to } },
    include: {
      branch: { select: { name: true } },
      ticketType: { select: { name: true } },
      reservations: { include: { member: { include: { branch: { select: { name: true } } } } } },
    },
  });
  const reservations = schedules.flatMap((schedule) => schedule.reservations.map((reservation) => ({ reservation, schedule })));
  const total = reservations.length;
  const attended = reservations.filter(({ reservation }) => reservation.status === "ATTENDED").length;
  const noShow = reservations.filter(({ reservation }) => reservation.status === "NO_SHOW").length;
  const canceled = reservations.filter(({ reservation }) => ["CANCELED", "LATE_CANCELED", "CLASS_CANCELED"].includes(reservation.status)).length;
  const byBranch = new Map<string, { branchName: string; reservations: number; attended: number; noShow: number; reserved: number; capacity: number }>();
  const byClass = new Map<string, { ticketTypeName: string; sessions: number; reserved: number; capacity: number }>();
  const matrix = new Map<string, { memberBranch: string; classBranch: string; count: number }>();
  for (const schedule of schedules) {
    const branch = byBranch.get(schedule.branch.name) ?? { branchName: schedule.branch.name, reservations: 0, attended: 0, noShow: 0, reserved: 0, capacity: 0 };
    branch.reserved += schedule.reservedCount;
    branch.capacity += schedule.capacity;
    byBranch.set(schedule.branch.name, branch);
    const classRow = byClass.get(schedule.ticketType.name) ?? { ticketTypeName: schedule.ticketType.name, sessions: 0, reserved: 0, capacity: 0 };
    classRow.sessions += 1;
    classRow.reserved += schedule.reservedCount;
    classRow.capacity += schedule.capacity;
    byClass.set(schedule.ticketType.name, classRow);
  }
  for (const { reservation, schedule } of reservations) {
    const branch = byBranch.get(schedule.branch.name);
    if (branch) { branch.reservations += 1; if (reservation.status === "ATTENDED") branch.attended += 1; if (reservation.status === "NO_SHOW") branch.noShow += 1; }
    const key = `${reservation.member.branch.name}\u0000${schedule.branch.name}`;
    const row = matrix.get(key) ?? { memberBranch: reservation.member.branch.name, classBranch: schedule.branch.name, count: 0 };
    row.count += 1;
    matrix.set(key, row);
  }
  return {
    summary: { reservations: total, attended, noShow, canceled, noShowRate: total === 0 ? 0 : Number(((noShow / total) * 100).toFixed(1)) },
    byBranch: [...byBranch.values()].map((row) => ({ branchName: row.branchName, reservations: row.reservations, attended: row.attended, noShow: row.noShow, fillRate: row.capacity === 0 ? 0 : Number(((row.reserved / row.capacity) * 100).toFixed(1)) })),
    crossBranchMatrix: [...matrix.values()],
    byClass: [...byClass.values()].map((row) => ({ ticketTypeName: row.ticketTypeName, sessions: row.sessions, avgFillRate: row.capacity === 0 ? 0 : Number(((row.reserved / row.capacity) * 100).toFixed(1)) })),
  };
}
