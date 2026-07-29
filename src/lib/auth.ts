import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";

const MEMBER_TOKEN_COOKIE = "loungefit_member_token";
const MANAGER_TOKEN_COOKIE = "loungefit_manager_token";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type MemberSession = {
  sub: string;
  role: "MEMBER";
  branchId: string;
};

export type ManagerSession = {
  sub: string;
  role: "MANAGER" | "ADMIN";
  branchId: string | null;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }
  return secret;
}

export function issueMemberToken(session: MemberSession) {
  return jwt.sign(session, jwtSecret(), { expiresIn: TOKEN_MAX_AGE_SECONDS });
}

export function verifyMemberToken(token: string): MemberSession {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (
      typeof payload !== "object" ||
      payload === null ||
      payload.role !== "MEMBER" ||
      typeof payload.sub !== "string" ||
      typeof payload.branchId !== "string"
    ) {
      throw new Error("Invalid member token payload");
    }
    return { sub: payload.sub, role: "MEMBER", branchId: payload.branchId };
  } catch {
    throw new AppError("ERR_UNAUTHORIZED");
  }
}

export function issueManagerToken(session: ManagerSession) {
  return jwt.sign(session, jwtSecret(), { expiresIn: TOKEN_MAX_AGE_SECONDS });
}

export function verifyManagerToken(token: string): ManagerSession {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (
      typeof payload !== "object" ||
      payload === null ||
      (payload.role !== "MANAGER" && payload.role !== "ADMIN") ||
      typeof payload.sub !== "string" ||
      (payload.branchId !== null && typeof payload.branchId !== "string")
    ) {
      throw new Error("Invalid manager token payload");
    }
    if ((payload.role === "MANAGER" && payload.branchId === null) || (payload.role === "ADMIN" && payload.branchId !== null)) {
      throw new Error("Invalid manager scope");
    }
    return { sub: payload.sub, role: payload.role, branchId: payload.branchId };
  } catch {
    throw new AppError("ERR_UNAUTHORIZED");
  }
}

export async function requireMemberSession() {
  const token = (await cookies()).get(MEMBER_TOKEN_COOKIE)?.value;
  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED");
  }
  return verifyMemberToken(token);
}

export async function setMemberSessionCookie(token: string) {
  (await cookies()).set(MEMBER_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
}

export async function requireManagerSession() {
  const token = (await cookies()).get(MANAGER_TOKEN_COOKIE)?.value;
  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED");
  }
  return verifyManagerToken(token);
}

export async function setManagerSessionCookie(token: string) {
  (await cookies()).set(MANAGER_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
}

export async function clearManagerSessionCookie() {
  (await cookies()).delete(MANAGER_TOKEN_COOKIE);
}
