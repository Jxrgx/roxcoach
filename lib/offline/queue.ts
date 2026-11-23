import type { LoggedSet, SetPosition } from "@/lib/execution/progress";
import { slotKey } from "@/lib/execution/progress";
import type { SetLogInput } from "@/lib/validations";

/**
 * Cola local de la ejecución (funciones puras). Toda acción del atleta durante
 * la ejecución se convierte en una operación con un id único (idempotencia):
 * se guarda primero en el dispositivo, se muestra de inmediato y se envía en
 * orden. El servidor sigue siendo la fuente de verdad.
 */

/** Versión del esquema de la cola en IndexedDB (para migrar en el futuro). */
export const QUEUE_SCHEMA_VERSION = 1;

export type OpKind = "logSet" | "pause" | "resume" | "finish";
export type OpStatus = "pending" | "sending" | "rejected" | "conflict";

/**
 * Qué espera encontrar el atleta en esa serie: "new" = que esté vacía;
 * "correct" = que siga siendo la que vio (opId, null si es una serie anterior a la fase 11).
 */
export type SetExpectation = { kind: "new" } | { kind: "correct"; opId: string | null };

export interface QueuedOp {
  v: typeof QUEUE_SCHEMA_VERSION;
  opId: string;
  /** Dueño de la operación: nunca se muestran ni envían operaciones de otro usuario. */
  userId: string;
  sessionId: string;
  /** Orden de creación dentro de la sesión. */
  seq: number;
  kind: OpKind;
  /** Hora local del dispositivo (ISO). */
  createdAt: string;
  status: OpStatus;
  attempts: number;
  error: string | null;
  /** Solo lo necesario: posición y lo capturado (nunca lo planeado). */
  position?: SetPosition;
  input?: SetLogInput;
  expect?: SetExpectation;
  /** Valores locales para mostrarla mientras está pendiente. */
  preview?: Omit<LoggedSet, keyof SetPosition>;
}

/** Lo que viaja al servidor (sin estado local ni vista previa). */
export interface WireOp {
  opId: string;
  kind: OpKind;
  clientAt: string;
  position?: SetPosition;
  input?: SetLogInput;
  expect?: SetExpectation;
}

export type OpOutcome = "applied" | "duplicate" | "conflict" | "rejected" | "retry" | "skipped";

export interface OpResult {
  opId: string;
  outcome: OpOutcome;
  message?: string;
  /** Serie tal como quedó en el servidor (para logSet aplicadas o duplicadas). */
  set?: LoggedSet & { clientOpId: string | null };
  /** Estado de la pausa en el servidor tras la operación. */
  times?: { pausedAt: string | null; pausedSeconds: number };
  /** La sesión quedó finalizada. */
  finished?: boolean;
}

export function createOp(
  base: { userId: string; sessionId: string; seq: number; kind: OpKind; now: Date },
  extra: Pick<QueuedOp, "position" | "input" | "expect" | "preview"> = {},
  newId: () => string = () => crypto.randomUUID(),
): QueuedOp {
  return {
    v: QUEUE_SCHEMA_VERSION,
    opId: newId(),
    userId: base.userId,
    sessionId: base.sessionId,
    seq: base.seq,
    kind: base.kind,
    createdAt: base.now.toISOString(),
    status: "pending",
    attempts: 0,
    error: null,
    ...extra,
  };
}

export const toWire = (op: QueuedOp): WireOp => ({
  opId: op.opId,
  kind: op.kind,
  clientAt: op.createdAt,
  ...(op.position ? { position: op.position } : {}),
  ...(op.input ? { input: op.input } : {}),
  ...(op.expect ? { expect: op.expect } : {}),
});

/** Siguiente número de orden para la sesión. */
export const nextSeq = (ops: QueuedOp[]) => ops.reduce((m, o) => Math.max(m, o.seq), 0) + 1;

/** Operaciones de un usuario y sesión, en orden. */
export function opsFor(ops: QueuedOp[], userId: string, sessionId: string): QueuedOp[] {
  return ops.filter((o) => o.userId === userId && o.sessionId === sessionId).sort((a, b) => a.seq - b.seq);
}

/** Lote a enviar: pendientes (o que se quedaron "enviando" tras una recarga), en orden. */
export function nextBatch(ops: QueuedOp[]): QueuedOp[] {
  return [...ops].filter((o) => o.status === "pending" || o.status === "sending").sort((a, b) => a.seq - b.seq);
}

/**
 * Aplica la respuesta del servidor: aplicadas y duplicadas se eliminan (ya
 * están en el servidor); conflictos y rechazos quedan con su motivo; "retry"
 * y "skipped" siguen pendientes (en orden) para el próximo intento.
 */
export function applyResults(ops: QueuedOp[], results: OpResult[]): QueuedOp[] {
  const byId = new Map(results.map((r) => [r.opId, r]));
  return ops.flatMap((o) => {
    const r = byId.get(o.opId);
    if (!r) return [o.status === "sending" ? { ...o, status: "pending" as const } : o];
    switch (r.outcome) {
      case "applied":
      case "duplicate":
        return [];
      case "conflict":
        return [{ ...o, status: "conflict" as const, error: r.message ?? "Conflicto con el servidor." }];
      case "rejected":
        return [{ ...o, status: "rejected" as const, error: r.message ?? "El servidor rechazó el dato." }];
      case "retry":
        return [{ ...o, status: "pending" as const, attempts: o.attempts + 1, error: r.message ?? null }];
      default:
        return [{ ...o, status: "pending" as const }];
    }
  });
}

/** Error de red o de servidor no disponible: la operación debe quedar pendiente. */
export function isTemporaryError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true; // fetch sin red
  const msg = error instanceof Error ? error.message : String(error);
  return /fetch|network|Failed to|ECONN|timeout|503|502|504/i.test(msg);
}

export type SyncState = "online" | "offline" | "saved-locally" | "syncing" | "synced" | "attention";

export const SYNC_LABEL: Record<SyncState, string> = {
  online: "En línea",
  offline: "Sin conexión",
  "saved-locally": "Guardado localmente",
  syncing: "Sincronizando",
  synced: "Guardado",
  attention: "Revisa los datos sin enviar",
};

/** Estado breve para la pantalla de ejecución. */
export function syncState(ops: QueuedOp[], online: boolean, syncing: boolean, everSynced: boolean): SyncState {
  if (ops.some((o) => o.status === "conflict" || o.status === "rejected")) return "attention";
  const pending = ops.filter((o) => o.status === "pending" || o.status === "sending").length;
  if (!online) return pending > 0 ? "saved-locally" : "offline";
  if (syncing) return "syncing";
  if (pending > 0) return "saved-locally";
  return everSynced ? "synced" : "online";
}

export const pendingCount = (ops: QueuedOp[]) => ops.filter((o) => o.status === "pending" || o.status === "sending").length;
export const problemOps = (ops: QueuedOp[]) => ops.filter((o) => o.status === "conflict" || o.status === "rejected");

export type DisplayedSet = LoggedSet & { clientOpId: string | null; local: OpStatus | null };

/**
 * Series a mostrar: las del servidor + las locales aún no confirmadas (una
 * serie registrada sin conexión nunca se oculta). Las locales ganan porque son
 * lo último que hizo el atleta.
 */
export function mergeSets(server: (LoggedSet & { clientOpId: string | null })[], ops: QueuedOp[]): Map<string, DisplayedSet> {
  const map = new Map<string, DisplayedSet>(server.map((s) => [slotKey(s), { ...s, local: null }]));
  for (const o of [...ops].sort((a, b) => a.seq - b.seq)) {
    if (o.kind !== "logSet" || !o.position || !o.preview) continue;
    map.set(slotKey(o.position), { ...o.position, ...o.preview, clientOpId: o.opId, local: o.status });
  }
  return map;
}

/** Estado de pausa visible: el del servidor + pausas/reanudaciones locales pendientes. */
export function foldPauses(base: { pausedAt: Date | null; pausedSeconds: number }, ops: QueuedOp[]): { pausedAt: Date | null; pausedSeconds: number } {
  let { pausedAt, pausedSeconds } = base;
  for (const o of [...ops].sort((a, b) => a.seq - b.seq)) {
    if (o.status === "rejected" || o.status === "conflict") continue;
    const at = new Date(o.createdAt);
    if (o.kind === "pause" && !pausedAt) pausedAt = at;
    else if (o.kind === "resume" && pausedAt) {
      pausedSeconds += Math.max(0, Math.round((at.getTime() - pausedAt.getTime()) / 1000));
      pausedAt = null;
    }
  }
  return { pausedAt, pausedSeconds };
}

/* ---------- Descanso (persistido con timestamps) ---------- */

export interface RestState {
  startedAt: string;
  seconds: number;
  nextIndex: number;
}

/** Segundos que faltan del descanso (0 si ya terminó), calculado desde la hora de inicio. */
export function restRemaining(rest: RestState, now: Date): number {
  const elapsed = Math.floor((now.getTime() - new Date(rest.startedAt).getTime()) / 1000);
  return Math.max(0, rest.seconds - Math.max(0, elapsed));
}

/* ---------- Migración del esquema local ---------- */

/**
 * Convierte un registro guardado con un esquema anterior al actual. Versión 0
 * (prototipo sin "v"): usaba `id` y `ts` en lugar de `opId` y `createdAt`.
 * Devuelve null si el registro no es reconocible (se descarta).
 */
export function migrateOp(raw: unknown): QueuedOp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v === QUEUE_SCHEMA_VERSION) return typeof r.opId === "string" && typeof r.userId === "string" ? (r as unknown as QueuedOp) : null;
  if (r.v === undefined && typeof r.id === "string" && typeof r.userId === "string" && typeof r.sessionId === "string") {
    const kind = r.kind as OpKind;
    if (!["logSet", "pause", "resume", "finish"].includes(kind)) return null;
    return {
      v: QUEUE_SCHEMA_VERSION,
      opId: r.id,
      userId: r.userId,
      sessionId: r.sessionId,
      seq: typeof r.seq === "number" ? r.seq : 0,
      kind,
      createdAt: typeof r.ts === "string" ? r.ts : new Date(0).toISOString(),
      status: "pending",
      attempts: 0,
      error: null,
      ...(r.position ? { position: r.position as SetPosition } : {}),
      ...(r.input ? { input: r.input as SetLogInput } : {}),
      expect: (r.expect as SetExpectation | undefined) ?? { kind: "new" },
    };
  }
  return null;
}
