import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { databaseUrl } from "@/lib/env";

/**
 * Cliente único de Prisma (driver adapter de Postgres, Prisma 7).
 * En desarrollo se reutiliza entre recargas para no agotar conexiones.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Conexiones inactivas: `pg` las cierra a los 10 s por defecto y abrir una
 * nueva contra el pooler de Supabase (TLS) cuesta ~400 ms más que reutilizarla
 * (medido en la fase 14). Se conservan 5 min; el pooler en modo transacción
 * admite conexiones de cliente inactivas sin ocupar conexiones de Postgres.
 */
const IDLE_TIMEOUT_MS = 5 * 60_000;

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: databaseUrl(), idleTimeoutMillis: IDLE_TIMEOUT_MS });
  // Medición opcional (docs/development-workflow.md → Medir la navegación): registra la
  // duración y el SQL parametrizado ($1, $2…) de cada consulta, nunca sus valores.
  // La validación del entorno la rechaza en producción real.
  if (process.env.ROXCOACH_DB_TRACE === "1") {
    const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
    client.$on("query", (e) => console.log(`[q] ${e.duration}ms ${e.query.replace(/\s+/g, " ").slice(0, 140)}`));
    return client;
  }
  return new PrismaClient({ adapter });
}

export function db(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrisma();
  return globalForPrisma.prisma;
}
