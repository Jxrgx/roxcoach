import type { MessageDTO, SendResult } from "@/lib/db/messages";
import { validateMessageBody } from "@/lib/messages/rules";

/**
 * Piezas comunes de las acciones de mensajes del coach y del atleta: validación
 * de la entrada y textos de error. Sin acceso a datos (eso vive en lib/db/messages).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

export interface SendMessageInput {
  clientId: string;
  body: string;
}

export type SendMessageResult = { ok: true; message: MessageDTO } | { ok: false; message: string; field?: string };

export const SEND_GENERIC_ERROR = "No se pudo enviar. Revisa tu conexión; tu mensaje sigue aquí.";

/** Valida la forma de la entrada (llega del cliente: no se confía en sus tipos). */
export function parseSendInput(input: unknown): { ok: true; value: SendMessageInput } | { ok: false; message: string; field?: string } {
  if (!input || typeof input !== "object") return { ok: false, message: SEND_GENERIC_ERROR };
  const { clientId, body } = input as Record<string, unknown>;
  if (!isUuid(clientId) || typeof body !== "string") return { ok: false, message: SEND_GENERIC_ERROR };
  const error = validateMessageBody(body);
  if (error) return { ok: false, message: error, field: "body" };
  return { ok: true, value: { clientId, body: body.trim() } };
}

export function sendFailure(result: Exclude<SendResult, { ok: true }>): SendMessageResult {
  const message = {
    "not-found": "Esta conversación ya no está disponible.",
    "read-only": "La relación no está activa: no se pueden enviar mensajes.",
    conflict: SEND_GENERIC_ERROR,
  }[result.reason];
  return { ok: false, message };
}
