import type { LoggedSet } from "@/lib/execution/progress";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { WeightUnit } from "@/lib/workouts/rules";
import type { QueuedOp } from "@/lib/offline/queue";

/**
 * Restauración de la ejecución sin red (fase 12, funciones puras). Al abrir una
 * ejecución con red se guarda una copia local; si después se recarga sin red,
 * el shell estático la restaura SOLO si pertenece al último usuario que abrió
 * una ejecución en el dispositivo y a esa misma sesión. Nunca inventa datos.
 */

export const SESSION_COPY_VERSION = 1;

export interface LocalSessionCopy {
  v: typeof SESSION_COPY_VERSION;
  /** `${userId}:${sessionId}` */
  key: string;
  userId: string;
  sessionId: string;
  title: string;
  /** Plan efectivo del atleta (snapshot + personalización) tal como lo entregó el servidor. */
  snapshot: SessionSnapshotV1;
  unit: WeightUnit;
  log: { startedAt: string; pausedAt: string | null; pausedSeconds: number };
  /** Series confirmadas por el servidor (las pendientes viven en la cola). */
  sets: (LoggedSet & { clientOpId: string | null })[];
  savedAt: string;
}

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXECUTION_PATH = new RegExp(`^/atleta/sesiones/(${UUID_RE})/ejecutar/?$`, "i");

/** sessionId de una ruta de ejecución; null si la ruta no es una ejecución. */
export function sessionIdFromPath(pathname: string): string | null {
  return EXECUTION_PATH.exec(pathname)?.[1]?.toLowerCase() ?? null;
}

export function buildSessionCopy(input: Omit<LocalSessionCopy, "v" | "key" | "savedAt">, now: Date): LocalSessionCopy {
  return { ...input, v: SESSION_COPY_VERSION, key: `${input.userId}:${input.sessionId}`, savedAt: now.toISOString() };
}

/** Convierte una copia guardada con un esquema anterior; null si no es reconocible. */
export function migrateSessionCopy(raw: unknown): LocalSessionCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LocalSessionCopy>;
  if (r.v !== SESSION_COPY_VERSION) return null;
  if (typeof r.userId !== "string" || typeof r.sessionId !== "string" || !r.snapshot || !Array.isArray(r.snapshot.blocks) || !r.log || !Array.isArray(r.sets)) return null;
  return r as LocalSessionCopy;
}

export type RestoreDecision =
  | { kind: "none"; reason: "not-execution" | "no-user" | "no-copy" }
  | { kind: "finished"; copy: LocalSessionCopy; ops: QueuedOp[] }
  | { kind: "restore"; copy: LocalSessionCopy; ops: QueuedOp[] };

/**
 * ¿Qué mostrar al recargar sin red? Restaurar solo con una copia del ÚLTIMO
 * usuario para ESA sesión; si la finalización está en cola, el resumen local.
 */
export function decideRestore(input: { pathname: string; lastUser: string | null; copy: LocalSessionCopy | null; ops: QueuedOp[] }): RestoreDecision {
  const sessionId = sessionIdFromPath(input.pathname);
  if (!sessionId) return { kind: "none", reason: "not-execution" };
  if (!input.lastUser) return { kind: "none", reason: "no-user" };
  const copy = input.copy;
  if (!copy || copy.userId !== input.lastUser || copy.sessionId.toLowerCase() !== sessionId) return { kind: "none", reason: "no-copy" };
  const ops = input.ops.filter((o) => o.userId === input.lastUser && o.sessionId.toLowerCase() === sessionId);
  const finishing = ops.some((o) => o.kind === "finish" && (o.status === "pending" || o.status === "sending"));
  return finishing ? { kind: "finished", copy, ops } : { kind: "restore", copy, ops };
}
