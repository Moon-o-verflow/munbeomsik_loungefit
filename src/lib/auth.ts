import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";

const MEMBER_TOKEN_COOKIE = "loungefit_member_token";
const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type MemberSession = {
  sub: string;
  role: "MEMBER";
  branchId: string;
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
