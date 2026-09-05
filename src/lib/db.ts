import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Lazy, cached Prisma client. Without DATABASE_URL the demo phase keeps
// running on the local-first stores — nothing here throws at import time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!env().DATABASE_URL) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}