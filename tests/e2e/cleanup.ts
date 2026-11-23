import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { e2eEnv, SEED_IDS } from "./helpers";

/**
 * Limpieza de datos de prueba (cierre fase 14). Reglas:
 * - Solo se borra lo que la prueba CREÓ, por ids exactos registrados al crearlo.
 * - Cada borrado va en una transacción y falla (con ROLLBACK) si afecta más filas
 *   de las esperadas.
 * - Los usuarios compartidos del setup (coach y atleta de tests/e2e/.auth/ids.json)
 *   nunca se borran.
 * - Orden: avisos → invitaciones → sesiones (cascada: asignaciones, registros,
 *   ajustes, ops) → plantillas → ejercicios → relaciones → usuarios.
 * Úsalo en `test.afterEach` o en `finally` (corre aunque la prueba falle).
 */

type Table = "coach_alerts" | "invitations" | "scheduled_sessions" | "workout_templates" | "exercises" | "coach_athletes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sharedUserIds(): Set<string> {
  if (!existsSync(SEED_IDS)) return new Set();
  const ids = JSON.parse(readFileSync(SEED_IDS, "utf8")) as { coachId?: string; athleteId?: string };
  return new Set([ids.coachId, ids.athleteId].filter((x): x is string => Boolean(x)));
}

async function withTx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("Falta DIRECT_URL para limpiar datos de prueba.");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

/** Borra filas por id exacto; falla y revierte si se borran más de las pedidas. */
export async function deleteExactIds(table: Table, ids: string[]): Promise<number> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;
  if (!unique.every((id) => UUID_RE.test(id))) throw new Error(`Limpieza de ${table}: ids inválidos.`);
  return withTx(async (c) => {
    const res = await c.query(`delete from ${table} where id = any($1::uuid[])`, [unique]);
    if ((res.rowCount ?? 0) > unique.length) throw new Error(`Limpieza de ${table}: afectó ${res.rowCount} filas (esperadas ≤ ${unique.length}). Se revirtió.`);
    return res.rowCount ?? 0;
  });
}

/**
 * Avisos generados por datos de la prueba: los del coach o atleta creados por
 * ella, o cuyo origen (`source_id`: asignación, invitación, registro…) creó ella.
 * `max` acota el borrado: si hay más, se revierte y falla.
 */
export async function deleteAlertsFor(opts: { userIds?: string[]; sourceIds?: string[]; max?: number }): Promise<number> {
  const shared = sharedUserIds();
  const userIds = [...new Set(opts.userIds ?? [])];
  const sourceIds = [...new Set(opts.sourceIds ?? [])];
  if (userIds.some((id) => shared.has(id))) throw new Error("Limpieza de avisos: no se borran por los usuarios compartidos (usa sourceIds).");
  if (userIds.length + sourceIds.length === 0) return 0;
  const max = opts.max ?? 200;
  return withTx(async (c) => {
    const res = await c.query(
      `delete from coach_alerts where coach_id = any($1::uuid[]) or athlete_id = any($1::uuid[]) or source_id = any($2::uuid[])`,
      [userIds, sourceIds],
    );
    if ((res.rowCount ?? 0) > max) throw new Error(`Limpieza de avisos: afectó ${res.rowCount} filas (máximo ${max}). Se revirtió.`);
    return res.rowCount ?? 0;
  });
}

/** Ids de las asignaciones de unas sesiones (origen de avisos "no iniciada"). Llamar ANTES de borrar las sesiones. */
export async function assignmentIdsOf(sessionIds: string[]): Promise<string[]> {
  if (sessionIds.length === 0) return [];
  return withTx(async (c) => (await c.query(`select id from assignments where session_id = any($1::uuid[])`, [sessionIds])).rows.map((r) => r.id as string));
}

/** Borra usuarios creados por la prueba (cascada de perfiles y sus datos). Nunca los compartidos. */
export async function deleteTestUsers(ids: string[]): Promise<void> {
  const shared = sharedUserIds();
  const env = e2eEnv();
  const admin = createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const id of new Set(ids)) {
    if (shared.has(id)) throw new Error("Limpieza: se intentó borrar un usuario compartido. Se detuvo.");
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not.?found/i.test(error.message)) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
  }
}

/**
 * Registro de lo que crea una prueba, para borrarlo al final en el orden correcto.
 * Los avisos se borran al FINAL (después de sesiones e invitaciones): así una
 * sincronización en paralelo no puede regenerarlos entre medio.
 */
export class TestData {
  users: string[] = [];
  invitations: string[] = [];
  sessions: string[] = [];
  templates: string[] = [];
  exercises: string[] = [];
  relations: string[] = [];
  /** Orígenes de avisos ya conocidos (p. ej. invitaciones aceptadas). */
  alertSources: string[] = [];

  async cleanup(): Promise<void> {
    const errors: unknown[] = [];
    const step = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        errors.push(e);
      }
    };
    const assignmentSources = await assignmentIdsOf(this.sessions).catch(() => [] as string[]);
    const sourceIds = [...this.alertSources, ...this.invitations, ...assignmentSources];
    // 1) Lo que genera avisos: sin relación, sesión ni invitación, la sincronización ya no los crea.
    await step(() => deleteExactIds("invitations", this.invitations));
    await step(() => deleteExactIds("scheduled_sessions", this.sessions));
    await step(() => deleteExactIds("workout_templates", this.templates));
    await step(() => deleteExactIds("exercises", this.exercises));
    await step(() => deleteExactIds("coach_athletes", this.relations));
    // 2) Avisos por usuario y por origen ANTES de borrar usuarios (al borrar un atleta,
    //    sus avisos en un coach compartido quedarían con athlete_id = NULL: huérfanos).
    await step(() => deleteAlertsFor({ userIds: this.users, sourceIds }));
    // 3) Usuarios (cascada de perfiles, relaciones, sesiones y datos propios).
    await step(() => deleteTestUsers(this.users));
    // 4) Última pasada por origen (por si una sincronización en paralelo alcanzó a crear uno).
    await step(() => deleteAlertsFor({ sourceIds }));
    this.users = [];
    this.invitations = [];
    this.sessions = [];
    this.templates = [];
    this.exercises = [];
    this.relations = [];
    this.alertSources = [];
    if (errors.length) throw errors[0];
  }
}
