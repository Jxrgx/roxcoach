import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

export const AUTH_DIR = "tests/e2e/.auth";
export const COACH_STATE = `${AUTH_DIR}/coach.json`;
export const ATHLETE_STATE = `${AUTH_DIR}/athlete.json`;
/** Ids de los usuarios de prueba, escritos por el setup. */
export const SEED_IDS = `${AUTH_DIR}/ids.json`;

export interface SeedIds {
  coachId: string;
  athleteId: string;
}

export function readSeedIds(): SeedIds {
  return JSON.parse(readFileSync(SEED_IDS, "utf8")) as SeedIds;
}

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

/** Id de un usuario de Auth por correo (admin). */
export async function findUserId(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No se encontró el usuario de prueba ${email}.`);
  return user.id;
}

/**
 * Consulta directa a la BD de DESARROLLO para preparar datos de prueba
 * (DIRECT_URL de .env.local). Nunca imprime la cadena de conexión.
 */
export async function dbQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("Falta DIRECT_URL en .env.local para preparar datos de prueba.");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

/* ---------- Revisión visual y de accesibilidad ---------- */

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}


/** Elementos interactivos visibles con área táctil menor a 44 × 44 px. */
export async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("a[href], button, [role=tab], summary, select, input:not([type=radio]):not([type=checkbox])").forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") return;
      if (el.closest(".sr-only") || el.classList.contains("sr-only")) return;
      if (el.closest("dialog:not([open])")) return;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return out;
  });
}

/** Textos de navegación cortados con elipsis. */
export async function truncatedNavLabels(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("nav .truncate"))
      .filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent ?? ""),
  );
}

/** Píxeles de scroll horizontal accidental en la página (0 = ninguno). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
