import type { Page } from "@playwright/test";

export const AUTH_DIR = "tests/e2e/.auth";
export const COACH_STATE = `${AUTH_DIR}/coach.json`;
export const ATHLETE_STATE = `${AUTH_DIR}/athlete.json`;

export interface E2EEnv {
  supabaseUrl: string;
  secretKey: string;
  coachEmail: string;
  coachPassword: string;
  athleteEmail: string;
  athletePassword: string;
}

/**
 * Lee las variables necesarias o falla con instrucciones claras.
 * Contraseña por rol (E2E_COACH_PASSWORD / E2E_ATHLETE_PASSWORD), con
 * E2E_PASSWORD como respaldo compartido. Nunca imprime valores.
 */
export function e2eEnv(): E2EEnv {
  const vars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    E2E_COACH_EMAIL: process.env.E2E_COACH_EMAIL,
    E2E_ATHLETE_EMAIL: process.env.E2E_ATHLETE_EMAIL,
    E2E_COACH_PASSWORD: process.env.E2E_COACH_PASSWORD ?? process.env.E2E_PASSWORD,
    E2E_ATHLETE_PASSWORD: process.env.E2E_ATHLETE_PASSWORD ?? process.env.E2E_PASSWORD,
  };
  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables para las pruebas E2E: ${missing.join(", ")}. Complétalas en .env.local (ver .env.example).`,
    );
  }
  for (const k of ["E2E_COACH_PASSWORD", "E2E_ATHLETE_PASSWORD"] as const) {
    if ((vars[k] ?? "").length < 8) throw new Error(`${k} debe tener al menos 8 caracteres.`);
  }
  return {
    // Solo el origen: tolera que la URL se haya copiado con una ruta (p. ej. /rest/v1/).
    supabaseUrl: new URL(vars.NEXT_PUBLIC_SUPABASE_URL!).origin,
    secretKey: vars.SUPABASE_SECRET_KEY!,
    coachEmail: vars.E2E_COACH_EMAIL!,
    coachPassword: vars.E2E_COACH_PASSWORD!,
    athleteEmail: vars.E2E_ATHLETE_EMAIL!,
    athletePassword: vars.E2E_ATHLETE_PASSWORD!,
  };
}

export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}
