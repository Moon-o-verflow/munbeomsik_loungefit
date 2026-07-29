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

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Route modules are evaluated during `next build`. Delay construction until a
// query is actually made, so build-time evaluation never opens a DB path.
// Runtime construction still rejects a missing DATABASE_URL and can only use
// the Neon pooled URL configured above.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
