import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// La CLI de Prisma no lee .env.local como Next.js; lo cargamos aquí.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  // Migraciones con conexión directa/sesión (no el pooler de transacciones).
  // Opcional para `prisma generate`; requerida para migrate.
  datasource: { url: process.env.DIRECT_URL },
});
