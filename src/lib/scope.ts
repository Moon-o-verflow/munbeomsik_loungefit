import { requireMemberSession, type MemberSession } from "@/lib/auth";

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
