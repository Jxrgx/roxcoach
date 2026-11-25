// Utilidades compartidas del dataset de demostración (seed, status, cleanup).
// Nunca imprimen secretos, contraseñas, cadenas de conexión ni correos completos.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const MANIFEST_DIR = ".demo";
export const MANIFEST_PATH = `${MANIFEST_DIR}/roxcoach-demo.json`;
export const APP_TIME_ZONE = "America/Mexico_City";
export const DEFAULT_COACH_EMAIL = "jorgocios@gmail.com";

export function loadEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Correo parcialmente enmascarado: jo******s@gmail.com */
export function mask(email) {
  const [user = "", domain = ""] = String(email).split("@");
  if (user.length <= 2) return `${user[0] ?? ""}*@${domain}`;
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 3))}${user.slice(-1)}@${domain}`;
}

function refOf(raw) {
  try {
    const url = new URL(raw);
    const api = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(url.hostname);
    if (api) return api[1];
    const direct = /^db\.([a-z0-9]{20})\.supabase\.(co|in)$/.exec(url.hostname);
    if (direct) return direct[1];
    const pooled = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username));
    if (pooled) return pooled[1];
  } catch {
    /* no es URL */
  }
  return null;
}

/**
 * Proyecto destino. Protección contra ejecutar el dataset en otra base (p. ej.
 * una futura producción): DEMO_TARGET_PROJECT_REF debe coincidir con el proyecto
 * de NEXT_PUBLIC_SUPABASE_URL y de DIRECT_URL.
 */
export function assertTargetProject() {
  const expected = process.env.DEMO_TARGET_PROJECT_REF?.trim();
  if (!expected) fail("Falta DEMO_TARGET_PROJECT_REF (el ref del proyecto de desarrollo, p. ej. el subdominio de NEXT_PUBLIC_SUPABASE_URL).");
  const api = refOf(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = refOf(process.env.DIRECT_URL ?? "");
  if (!api || !db) fail("No se reconoce el proyecto en NEXT_PUBLIC_SUPABASE_URL o DIRECT_URL.");
  if (api !== db) fail("NEXT_PUBLIC_SUPABASE_URL y DIRECT_URL apuntan a proyectos distintos. Se detiene.");
  if (api !== expected) fail("El proyecto configurado no es DEMO_TARGET_PROJECT_REF. Se detiene (¿base equivocada?).");
  if (process.env.VERCEL || process.env.VERCEL_ENV) fail("El dataset demo no se ejecuta dentro de Vercel.");
  return api;
}

export function pgClient() {
  if (!process.env.DIRECT_URL) fail("Falta DIRECT_URL.");
  return new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
}

export function adminClient() {
  if (!process.env.SUPABASE_SECRET_KEY) fail("Falta SUPABASE_SECRET_KEY (solo en .env.local de desarrollo).");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Coach existente por correo EXACTO. Se detiene si no existe, si no es coach o
 * si no tiene coach_profile. Nunca lo modifica.
 */
export async function findCoach(client) {
  const email = (process.env.DEMO_EXISTING_COACH_EMAIL?.trim() || DEFAULT_COACH_EMAIL).toLowerCase();
  const users = (await client.query(`select id, email from auth.users where lower(email) = $1`, [email])).rows;
  if (users.length !== 1) fail(`No existe un usuario con el correo ${mask(email)} en este proyecto.`);
  const user = users[0];
  const profile = (await client.query(`select id, name, role::text as role from profiles where id = $1`, [user.id])).rows[0];
  if (!profile) fail("El usuario no tiene perfil.");
  if (profile.role !== "coach") fail(`El usuario ${mask(email)} no tiene rol coach (no se cambia automáticamente).`);
  const coach = (await client.query(`select profile_id, gym_name from coach_profiles where profile_id = $1`, [user.id])).rows[0];
  if (!coach) fail(`El usuario ${mask(email)} no tiene coach_profile.`);
  return { id: user.id, email: user.email, maskedEmail: mask(user.email), name: profile.name, gymName: coach.gym_name || "" };
}

/** "YYYY-MM-DD" de hoy en la zona de la app, desplazado `offset` días. */
export function dayKey(offset = 0, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Instante de una hora local (zona de la app) en un día dado. */
export function localInstant(key, hh, mm = 0) {
  // Desfase de la zona en ese día (Ciudad de México no usa horario de verano desde 2022).
  const probe = new Date(`${key}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: APP_TIME_ZONE }));
  const offsetMin = Math.round((local.getTime() - probe.getTime()) / 60000);
  const utc = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), hh, mm) - offsetMin * 60000;
  return new Date(utc);
}

export function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

export function writeManifest(manifest) {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}
