import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { databaseUrl } from "@/lib/env";

/**
 * Cliente único de Prisma (driver adapter de Postgres, Prisma 7).
 * En desarrollo se reutiliza entre recargas para no agotar conexiones.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
}

export function db(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrisma();
  return globalForPrisma.prisma;
}
