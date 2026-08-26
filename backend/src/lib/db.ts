import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode pattern: reuse a single PrismaClient across hot
// reloads via a global, instead of opening a fresh pool on every module
// re-evaluation.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
