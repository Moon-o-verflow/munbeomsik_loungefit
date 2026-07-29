import { prisma } from "@/lib/db";

export async function getPolicy() {
  const policy = await prisma.policy.findUnique({ where: { id: 1 } });
  if (!policy) {
    throw new Error("The singleton policy row (id = 1) is missing.");
  }
  return policy;
}
