/**
 * Registro seguro de eventos (servidor y navegador).
 *
 * - Niveles: error, warn, info.
 * - En producción se registra una línea JSON con contexto, nombre, código y
 *   un mensaje recortado y saneado. Nunca se registran argumentos, consultas,
 *   tokens, correos ni contenido del usuario (notas, molestias, resultados).
 *   Los errores de Prisma solo registran nombre y código: su mensaje incluye
 *   los valores de la consulta.
 * - En desarrollo se muestra el error completo para depurar.
 *
 * Punto único para conectar un servicio de monitoreo en el futuro (ver
 * docs/security.md → Observabilidad). No se envía nada fuera de la app.
 */

export type LogLevel = "error" | "warn" | "info";

export interface LogRecord {
  level: LogLevel;
  ctx: string;
  name?: string;
  code?: string;
  digest?: string;
  msg?: string;
}

const MAX_MSG = 160;

/** Quita datos sensibles de un texto libre. */
export function redact(text: string): string {
  return text
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@[^\s]*/gi, "[url]") // URL con credenciales (postgresql://user:pass@…)
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[jwt]")
    .replace(/\bsb_(?:secret|publishable)_[\w-]+/gi, "[key]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[token]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[token]");
}

function errorFields(error: unknown): Pick<LogRecord, "name" | "code" | "digest" | "msg"> {
  if (!(error instanceof Error)) return { name: typeof error };
  const e = error as Error & { code?: unknown; digest?: unknown };
  const out: Pick<LogRecord, "name" | "code" | "digest" | "msg"> = { name: e.name };
  if (typeof e.code === "string" && /^[\w.-]{1,32}$/.test(e.code)) out.code = e.code;
  if (typeof e.digest === "string" && /^[\w-]{1,64}$/.test(e.digest)) out.digest = e.digest;
  // Prisma incrusta la consulta y sus valores en el mensaje: no se registra.
  if (!e.name.startsWith("Prisma")) {
    const first = (e.message ?? "").split("\n").find((l) => l.trim() !== "") ?? "";
    if (first) out.msg = redact(first.trim()).slice(0, MAX_MSG);
  }
  return out;
}

/** Registro saneado (función pura; lo que se escribe en producción). */
export function toLogRecord(level: LogLevel, ctx: string, detail?: unknown): LogRecord {
  const safeCtx = /^[\w.:-]{1,64}$/.test(ctx) ? ctx : "app";
  if (detail === undefined) return { level, ctx: safeCtx };
  if (typeof detail === "string") return { level, ctx: safeCtx, msg: redact(detail).slice(0, MAX_MSG) };
  return { level, ctx: safeCtx, ...errorFields(detail) };
}

const isProduction = () => process.env.NODE_ENV === "production";

function write(level: LogLevel, ctx: string, detail?: unknown) {
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (isProduction()) sink(JSON.stringify(toLogRecord(level, ctx, detail)));
  else sink(`[${level}] ${ctx}`, ...(detail === undefined ? [] : [detail]));
}

/** Error inesperado: la operación falló. */
export const logError = (ctx: string, error: unknown) => write("error", ctx, error);
/** Algo anómalo, pero la app siguió funcionando (p. ej. un indicador que se degradó). */
export const logWarn = (ctx: string, detail?: unknown) => write("warn", ctx, detail);
/** Evento operativo relevante (arranque, configuración). Nunca datos de usuario. */
export const logInfo = (ctx: string, detail?: string) => write("info", ctx, detail);
