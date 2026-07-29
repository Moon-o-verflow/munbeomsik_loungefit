import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getPolicy } from "@/lib/policy";
import { assertScopeBranch, scopedMemberWhere, type AdminScope } from "@/lib/scope";
import { kstMonthBounds } from "@/lib/time";
import { getTicketHoldCount, getTicketRemainingCount } from "@/services/ledger";

type LedgerClient = PrismaClient | Prisma.TransactionClient;

type MemberForAdmin = {
  id: string;
  name: string;
  phone: string;
  phoneLast4: string;
  branchId: string;
  isSuspended: boolean;
  branch: { name: string };
};

function maskedName(name: string) {
  return `${name.slice(0, 1)}OO`;
}

export async function getMemberNoShowCount(client: LedgerClient, memberId: string, now = new Date()) {
  const month = kstMonthBounds(now);
  return client.reservation.count({
    where: {
      memberId,
      status: "NO_SHOW",
      classSchedule: { startsAt: { gte: month.start, lt: month.end } },
    },
  });
}

export async function serializeAdminMember(
  scope: AdminScope,
  member: MemberForAdmin,
  ticketId?: string,
) {
  const isCrossBranch = scope.branchId !== null && member.branchId !== scope.branchId;
  let remainingCount = 0;
  if (ticketId) {
    remainingCount = await getTicketRemainingCount(prisma, ticketId);
  } else {
    const ticket = await prisma.ticket.findFirst({
      where: { memberId: member.id, isActive: true },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (ticket) remainingCount = await getTicketRemainingCount(prisma, ticket.id);
  }

  if (isCrossBranch) {
    return {
      id: member.id,
      name: maskedName(member.name),
      phoneLast4: member.phoneLast4,
      remainingCount,
      isCrossBranch: true as const,
    };
  }

  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    branchName: member.branch.name,
    remainingCount,
    noShowCount: await getMemberNoShowCount(prisma, member.id),
    isSuspended: member.isSuspended,
    isCrossBranch: false as const,
  };
}

async function findMemberForScope(scope: AdminScope, memberId: string, allowCrossHistory: boolean) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { branch: { select: { name: true } } },
  });
  if (!member) throw new AppError("ERR_MEMBER_NOT_FOUND");
  if (scope.branchId === null || member.branchId === scope.branchId) return member;
  if (!allowCrossHistory) throw new AppError("ERR_FORBIDDEN");

  const history = await prisma.reservation.findFirst({
    where: { memberId, classSchedule: { branchId: scope.branchId } },
    select: { id: true },
  });
  if (!history) throw new AppError("ERR_FORBIDDEN");
  return member;
}

export async function searchAdminMembers(scope: AdminScope, query: string) {
  const term = query.trim();
  const termWhere = term
    ? {
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { phoneLast4: { contains: term } },
        ],
      }
    : {};
  const visibilityWhere: Prisma.MemberWhereInput = scope.branchId
    ? {
        OR: [
          { branchId: scope.branchId },
          { reservations: { some: { classSchedule: { branchId: scope.branchId } } } },
        ],
      }
    : {};

  const members = await prisma.member.findMany({
    where: { AND: [visibilityWhere, termWhere] },
    include: { branch: { select: { name: true } } },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    take: 20,
  });
  return Promise.all(members.map((member) => serializeAdminMember(scope, member)));
}

export async function getProxyMember(scope: AdminScope, memberId: string) {
  const member = await findMemberForScope(scope, memberId, true);
  const serializedMember = await serializeAdminMember(scope, member);
  if (serializedMember.isCrossBranch) {
    return { member: serializedMember, tickets: [] };
  }
  const tickets = await prisma.ticket.findMany({
    where: { memberId: member.id, isActive: true },
    include: { ticketType: { select: { name: true } } },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  const now = new Date();

  return {
    member: serializedMember,
    tickets: await Promise.all(tickets.map(async (ticket) => ({
      id: ticket.id,
      ticketTypeName: ticket.ticketType.name,
      remainingCount: await getTicketRemainingCount(prisma, ticket.id),
      holdCount: await getTicketHoldCount(prisma, ticket.id),
      expiresAt: ticket.expiresAt.toISOString().slice(0, 10),
      dailyLimit: ticket.dailyLimit,
      weeklyLimit: ticket.weeklyLimit,
      isActive: ticket.isActive,
      checkedAt: now.toISOString(),
    }))),
  };
}

export async function getAdminMemberList(
  scope: AdminScope,
  options: { page: number; keyword: string; filter: "all" | "suspended" | "noshow" },
) {
  const policy = await getPolicy();
  const month = kstMonthBounds(new Date());
  const keyword = options.keyword.trim();
  const baseWhere: Prisma.MemberWhereInput = {
    ...scopedMemberWhere(scope),
    ...(keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: "insensitive" } },
            { phoneLast4: { contains: keyword } },
          ],
        }
      : {}),
    ...(options.filter === "suspended" ? { isSuspended: true } : {}),
    ...(options.filter === "noshow"
      ? { reservations: { some: { status: "NO_SHOW", classSchedule: { startsAt: { gte: month.start, lt: month.end } } } } }
      : {}),
  };
  const take = 20;
  const skip = (options.page - 1) * take;
  const [total, members] = await prisma.$transaction([
    prisma.member.count({ where: baseWhere }),
    prisma.member.findMany({
      where: baseWhere,
      include: {
        branch: { select: { name: true } },
        tickets: { where: { isActive: true }, include: { ticketType: { select: { name: true } } }, orderBy: { expiresAt: "asc" } },
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      take,
      skip,
    }),
  ]);

  return {
    page: options.page,
    total,
    pageSize: take,
    threshold: policy.noshowThresholdCount,
    members: await Promise.all(members.map(async (member) => {
      const ticket = member.tickets[0] ?? null;
      return {
        id: member.id,
        name: member.name,
        phone: member.phone,
        branchName: member.branch.name,
        ticketTypeName: ticket?.ticketType.name ?? null,
        remainingCount: ticket ? await getTicketRemainingCount(prisma, ticket.id) : 0,
        expiresAt: ticket?.expiresAt.toISOString().slice(0, 10) ?? null,
        noShowCount: await getMemberNoShowCount(prisma, member.id),
        isSuspended: member.isSuspended,
      };
    })),
  };
}

export async function getAdminMemberDetail(scope: AdminScope, memberId: string) {
  const member = await findMemberForScope(scope, memberId, false);
  assertScopeBranch(scope, member.branchId);
  const policy = await getPolicy();
  const tickets = await prisma.ticket.findMany({
    where: { memberId },
    include: { ticketType: { select: { name: true } } },
    orderBy: [{ isActive: "desc" }, { expiresAt: "asc" }],
  });
  const history = await prisma.reservation.findMany({
    where: { memberId },
    include: { classSchedule: { include: { branch: true, ticketType: true } } },
    orderBy: { classSchedule: { startsAt: "desc" } },
    take: 100,
  });

  return {
    member: { id: member.id, name: member.name, phone: member.phone, branchName: member.branch.name, createdAt: member.createdAt.toISOString() },
    tickets: await Promise.all(tickets.map(async (ticket) => ({
      id: ticket.id,
      ticketTypeName: ticket.ticketType.name,
      totalCount: ticket.totalCount,
      remainingCount: await getTicketRemainingCount(prisma, ticket.id),
      holdCount: await getTicketHoldCount(prisma, ticket.id),
      expiresAt: ticket.expiresAt.toISOString().slice(0, 10),
      dailyLimit: ticket.dailyLimit,
      weeklyLimit: ticket.weeklyLimit,
      isActive: ticket.isActive,
    }))),
    suspension: { isSuspended: member.isSuspended, reason: member.suspendedReason, until: member.suspendedUntil?.toISOString().slice(0, 10) ?? null },
    noShow: {
      currentCycleCount: await getMemberNoShowCount(prisma, member.id),
      threshold: policy.noshowThresholdCount,
      cycleStartedAt: kstMonthBounds(new Date()).start.toISOString().slice(0, 10),
      totalCount: await prisma.reservation.count({ where: { memberId, status: "NO_SHOW" } }),
    },
    reservationHistory: history.map((reservation) => ({
      reservationId: reservation.id,
      startsAt: reservation.classSchedule.startsAt.toISOString(),
      branchName: reservation.classSchedule.branch.name,
      ticketTypeName: reservation.classSchedule.ticketType.name,
      instructorName: reservation.classSchedule.instructorName,
      source: reservation.source,
      status: reservation.status,
    })),
  };
}

export async function suspendAdminMember(
  scope: AdminScope,
  memberId: string,
  input: { reason: string; until: Date },
) {
  const member = await findMemberForScope(scope, memberId, false);
  assertScopeBranch(scope, member.branchId);
  const [updated, activeReservationCount] = await prisma.$transaction([
    prisma.member.update({
      where: { id: memberId },
      data: { isSuspended: true, suspendedReason: input.reason, suspendedUntil: input.until },
    }),
    prisma.reservation.count({ where: { memberId, status: "RESERVED" } }),
  ]);
  return {
    memberId: updated.id,
    suspension: { isSuspended: true, reason: updated.suspendedReason, until: updated.suspendedUntil?.toISOString().slice(0, 10) ?? null },
    activeReservationCount,
  };
}

export async function unsuspendAdminMember(scope: AdminScope, memberId: string) {
  const member = await findMemberForScope(scope, memberId, false);
  assertScopeBranch(scope, member.branchId);
  await prisma.member.update({
    where: { id: memberId },
    data: { isSuspended: false, suspendedReason: null, suspendedUntil: null },
  });
  return { memberId, isSuspended: false };
}
