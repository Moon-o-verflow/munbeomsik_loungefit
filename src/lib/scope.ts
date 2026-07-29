import type { Prisma } from "@/generated/prisma/client";
import { requireManagerSession, requireMemberSession, type ManagerSession, type MemberSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export type MemberScope = {
  memberId: string;
  branchId: string;
};

export function memberScopeFromSession(session: MemberSession): MemberScope {
  return { memberId: session.sub, branchId: session.branchId };
}

export async function requireMemberScope(): Promise<MemberScope> {
  return memberScopeFromSession(await requireMemberSession());
}

export type AdminScope = {
  managerId: string;
  role: "MANAGER" | "ADMIN";
  branchId: string | null;
};

export function adminScopeFromSession(session: ManagerSession): AdminScope {
  return { managerId: session.sub, role: session.role, branchId: session.branchId };
}

export async function requireAdminScope(): Promise<AdminScope> {
  return adminScopeFromSession(await requireManagerSession());
}

export function scopedWhere(scope: AdminScope): Prisma.ClassScheduleWhereInput {
  return scope.branchId ? { branchId: scope.branchId } : {};
}

export function scopedBranchWhere(scope: AdminScope): Prisma.BranchWhereInput {
  return scope.branchId ? { id: scope.branchId } : {};
}

export function scopedMemberWhere(scope: AdminScope): Prisma.MemberWhereInput {
  return scope.branchId ? { branchId: scope.branchId } : {};
}

export function assertScopeBranch(scope: AdminScope, branchId: string) {
  if (scope.branchId !== null && scope.branchId !== branchId) {
    throw new AppError("ERR_FORBIDDEN");
  }
}
