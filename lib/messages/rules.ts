/**
 * Reglas puras de la mensajería uno a uno atleta–coach (fase 16). Las usan la
 * interfaz (feedback inmediato) y el servidor (validación definitiva).
 */

export const MESSAGE_MAX_LENGTH = 2000;

/** Mensajes que se cargan por conversación (los más recientes). */
export const THREAD_PAGE_SIZE = 200;

export type MessageRelationStatus = "active" | "paused" | "removed";

/** Error del texto de un mensaje, o undefined si es válido. */
export function validateMessageBody(body: string): string | undefined {
  if (body.trim().length === 0) return "Escribe un mensaje.";
  if (body.length > MESSAGE_MAX_LENGTH) return `Usa máximo ${MESSAGE_MAX_LENGTH} caracteres.`;
  return undefined;
}

/** Solo se escribe con relación activa; en pausa o terminada el historial es de solo lectura. */
export function canSendMessages(status: MessageRelationStatus): boolean {
  return status === "active";
}

/** Por qué una conversación es de solo lectura (texto para quien la ve). */
export function readOnlyReason(status: MessageRelationStatus, viewer: "coach" | "athlete"): string | null {
  if (status === "active") return null;
  if (status === "paused")
    return viewer === "coach"
      ? "La relación con este atleta está en pausa. Puedes ver el historial, pero no enviar mensajes."
      : "Tu coach pausó tu plan. Puedes ver el historial, pero no enviar mensajes por ahora.";
  return viewer === "coach"
    ? "Este atleta ya no está en tu equipo. Solo puedes ver el historial."
    : "Ya no entrenas con este coach. Solo puedes ver el historial.";
}

const timeFormat = (timeZone: string) => new Intl.DateTimeFormat("es-MX", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
const dayKeyFormat = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

function previousDayKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Fecha y hora de un mensaje relativas a `today` (YYYY-MM-DD en la zona de la
 * app): "10:32", "Ayer · 10:32" o "23 nov · 10:32". Determinista (no usa la
 * hora del dispositivo), así servidor y cliente muestran lo mismo.
 */
export function formatMessageTime(iso: string, today: string, timeZone: string): string {
  const date = new Date(iso);
  const time = timeFormat(timeZone).format(date);
  const key = dayKeyFormat(timeZone).format(date);
  if (key === today) return time;
  if (key === previousDayKey(today)) return `Ayer · ${time}`;
  const day = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  })
    .format(date)
    .replace(".", "");
  return `${day} · ${time}`;
}

/** Vista previa de una línea para la lista de conversaciones. */
export function messagePreview(body: string, max = 80): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
