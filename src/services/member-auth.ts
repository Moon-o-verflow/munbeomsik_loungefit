import { prisma } from "@/lib/db";
import { issueMemberToken } from "@/lib/auth";
import { AppError } from "@/lib/errors";

const AUTH_CODE_TTL_MS = 3 * 60 * 1_000;
const MAX_AUTH_ATTEMPTS = 5;

function createAuthCode() {
  if (process.env.SMS_PROVIDER === "mock") {
    return process.env.DEV_LOGIN_CODE ?? "000000";
  }
  return `${Math.floor(100_000 + Math.random() * 900_000)}`;
}

export async function requestMemberAuthCode(phone: string) {
  const member = await prisma.member.findUnique({
    where: { phone },
    select: { id: true },
  });

  if (!member) {
    throw new AppError("ERR_MEMBER_NOT_FOUND");
  }

  const code = createAuthCode();
  await prisma.authCode.create({
    data: {
      phone,
      code,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  if (process.env.SMS_PROVIDER === "mock") {
    console.info(`[mock sms] ${phone}: ${code}`);
    return { ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}) };
  }

  return {};
}

export async function verifyMemberAuthCode(phone: string, code: string) {
  const authCode = await prisma.authCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!authCode || authCode.expiresAt.getTime() < Date.now()) {
    throw new AppError("ERR_CODE_EXPIRED");
  }

  if (authCode.attemptCount >= MAX_AUTH_ATTEMPTS || authCode.code !== code) {
    await prisma.authCode.update({
      where: { id: authCode.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new AppError("ERR_INVALID_CODE");
  }

  const member = await prisma.member.findUnique({
    where: { phone },
    select: { id: true, branchId: true },
  });

  if (!member) {
    throw new AppError("ERR_MEMBER_NOT_FOUND");
  }

  await prisma.authCode.update({
    where: { id: authCode.id },
    data: { consumedAt: new Date() },
  });

  return issueMemberToken({ sub: member.id, role: "MEMBER", branchId: member.branchId });
}
