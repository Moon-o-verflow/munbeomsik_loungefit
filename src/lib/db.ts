import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@/generated/prisma/client";
import ws from "ws";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Prisma runtime access.");
  }

  neonConfig.webSocketConstructor = ws;

  // Runtime queries use only DATABASE_URL, the Neon pooled connection string.
  // DIRECT_URL is intentionally confined to prisma.config.ts for CLI migrations.
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    transactionOptions: {
      maxWait: 5_000,
      timeout: 10_000,
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
