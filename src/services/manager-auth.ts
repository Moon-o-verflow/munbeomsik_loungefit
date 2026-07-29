import bcrypt from "bcryptjs";
import { issueManagerToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function authenticateManager(loginId: string, password: string) {
  const manager = await prisma.manager.findUnique({
    where: { loginId },
    select: { id: true, passwordHash: true, role: true, branchId: true, name: true },
  });

  if (!manager || !(await bcrypt.compare(password, manager.passwordHash))) {
    throw new AppError("ERR_UNAUTHORIZED");
  }
  if ((manager.role === "MANAGER" && manager.branchId === null) || (manager.role === "ADMIN" && manager.branchId !== null)) {
    throw new AppError("ERR_UNAUTHORIZED");
  }

  return {
    token: issueManagerToken({ sub: manager.id, role: manager.role, branchId: manager.branchId }),
    manager: { id: manager.id, name: manager.name, role: manager.role, branchId: manager.branchId },
  };
}
