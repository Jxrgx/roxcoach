import type { OpKind, SetExpectation, WireOp } from "@/lib/offline/queue";

/**
 * Reglas del servidor para operaciones de la cola (funciones puras). No
 * confían en nada del cliente: forma, hora y escritura se validan aquí.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: OpKind[] = ["logSet", "pause", "resume", "finish"];
/** Tamaño máximo de un lote. */
export const MAX_BATCH = 100;

/** Valida la forma de una operación recibida. null = válida; si no, el motivo. */
export function invalidOpReason(op: unknown): string | null {
  if (!op || typeof op !== "object") return "Operación inválida.";
  const o = op as Partial<WireOp> & Record<string, unknown>;
  if (typeof o.opId !== "string" || !UUID_RE.test(o.opId)) return "Operación sin identificador válido.";
  if (!KINDS.includes(o.kind as OpKind)) return "Tipo de operación desconocido.";
  if (typeof o.clientAt !== "string" || Number.isNaN(Date.parse(o.clientAt))) return "Hora de la operación inválida.";
  if (o.kind === "logSet") {
    const p = o.position;
    if (!p || ![p.blockIndex, p.exerciseIndex, p.setNumber].every((n) => Number.isInteger(n) && n >= 0 && n < 10_000)) return "La serie no existe en esta sesión.";
    const i = o.input;
    if (!i || typeof i.amount !== "string" || typeof i.load !== "string" || typeof i.rpe !== "string") return "Faltan los datos de la serie.";
    if (i.amount.length > 20 || i.load.length > 20 || i.rpe.length > 4) return "Datos de la serie demasiado largos.";
    const e = o.expect as SetExpectation | undefined;
    if (!e || (e.kind !== "new" && !(e.kind === "correct" && (e.opId === null || (typeof e.opId === "string" && UUID_RE.test(e.opId)))))) return "Operación de serie incompleta.";
  }
  return null;
}

/**
 * Hora de una acción hecha en el dispositivo, acotada: nunca antes de `min`
 * (p. ej. el inicio o la pausa abierta) ni después de la hora del servidor.
 */
export function clampClientTime(clientAt: string, bounds: { min: Date; max: Date }): Date {
  const t = new Date(clientAt).getTime();
  const lo = bounds.min.getTime();
  const hi = Math.max(lo, bounds.max.getTime());
  return new Date(Math.min(hi, Math.max(lo, Number.isFinite(t) ? t : hi)));
}

export type SetWriteDecision = "write" | "duplicate" | "conflict-existing" | "conflict-changed";

/**
 * ¿Se puede escribir la serie? Nunca se sobrescribe automáticamente un
 * resultado que el atleta no vio: una serie "nueva" exige la posición vacía; una
 * corrección exige que la serie siga siendo la que el atleta corrigió.
 * Si la serie ya la escribió ESTA misma operación (otra petición la procesó en
 * paralelo, p. ej. al recargar justo al volver la red), es un duplicado, no un conflicto.
 */
export function decideSetWrite(existing: { clientOpId: string | null } | null, expect: SetExpectation, opId?: string): SetWriteDecision {
  if (existing && opId && existing.clientOpId === opId) return "duplicate";
  if (expect.kind === "new") return existing ? "conflict-existing" : "write";
  if (!existing) return "conflict-changed";
  return existing.clientOpId === expect.opId ? "write" : "conflict-changed";
}

export const CONFLICT_MESSAGE = {
  finished: "La sesión ya había finalizado cuando se envió este dato. Se conserva en este dispositivo.",
  existing: "Esta serie ya tenía un resultado en el servidor (quizá desde otro dispositivo). No se sobrescribió.",
  changed: "La serie cambió en el servidor después de que la corregiste. No se sobrescribió.",
} as const;
