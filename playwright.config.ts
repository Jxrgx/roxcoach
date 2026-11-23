import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Credenciales del proyecto Supabase de DESARROLLO y usuarios de prueba.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3100;

/**
 * Revisión responsive, de estados y de autenticación sobre el build de
 * producción. Ejecutar con `npm run test:e2e`.
 *
 * El proyecto "setup" crea (o actualiza) un coach y un atleta de prueba en
 * Supabase e inicia sesión con cada uno; el resto de pruebas reutiliza esas
 * sesiones (tests/e2e/.auth/, excluido de Git).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "e2e", testMatch: /.*\.spec\.ts/, dependencies: ["setup"] },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // APP_URL local: el build de producción la exige al arrancar (instrumentation.ts).
    env: { ROXCOACH_CATALOG: "1", APP_URL: `http://localhost:${PORT}` },
  },
});
