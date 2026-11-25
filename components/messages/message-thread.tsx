"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Lock, MessageSquare, Send, WifiOff } from "lucide-react";
import type { MessageDTO, ThreadDTO } from "@/lib/db/messages";
import type { SendMessageInput, SendMessageResult } from "@/lib/messages/actions-shared";
import { formatMessageTime, MESSAGE_MAX_LENGTH, readOnlyReason, validateMessageBody } from "@/lib/messages/rules";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { useOnline } from "@/lib/utils/use-online";
import { cn } from "@/lib/utils/cn";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/** Cada cuánto se buscan mensajes nuevos mientras la pantalla está visible (no hay tiempo real). */
const REFRESH_MS = 30_000;

interface Attempt {
  clientId: string;
  body: string;
}

/**
 * Conversación uno a uno (coach o atleta). Nivel 1: escribir y enviar.
 *
 * - El texto nunca se pierde: se borra solo cuando el servidor confirma el envío.
 * - Sin conexión no se intenta enviar: se avisa y el texto se queda en pantalla.
 * - Reintentar el mismo texto reutiliza su clientId: el servidor no lo duplica.
 * - Los mensajes recibidos se marcan como leídos al verse la conversación.
 * - Se actualiza al volver a la pestaña, al recuperar conexión y cada 30 s.
 */
export function MessageThread({
  thread,
  viewer,
  today,
  onSend,
  onMarkRead,
  header,
}: {
  thread: ThreadDTO;
  viewer: "coach" | "athlete";
  /** Hoy en la zona de la app (fechas relativas deterministas). */
  today: string;
  onSend: (input: SendMessageInput) => Promise<SendMessageResult>;
  onMarkRead: () => Promise<void>;
  header?: ReactNode;
}) {
  const router = useRouter();
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  // Confirmados por el servidor pero aún no incluidos en `thread` (antes de que llegue la página nueva).
  const [confirmed, setConfirmed] = useState<MessageDTO[]>([]);
  const lastAttempt = useRef<Attempt | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const markedKey = useRef("");

  const serverIds = new Set(thread.messages.map((m) => m.clientId));
  const messages = [...thread.messages, ...confirmed.filter((m) => !serverIds.has(m.clientId))];
  const readOnly = readOnlyReason(thread.status, viewer);
  const counterpart = thread.counterpartName;

  // Al llegar mensajes nuevos, mostrar el último.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  // Marcar como leídos los recibidos sin leer (una vez por conjunto) mientras la pantalla está visible.
  const unreadIncoming = thread.messages.filter((m) => !m.mine && !m.readAt).map((m) => m.id);
  const unreadKey = unreadIncoming.join(",");
  useEffect(() => {
    if (!unreadKey || markedKey.current === unreadKey) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || markedKey.current === unreadKey) return;
      markedKey.current = unreadKey;
      void onMarkRead().catch(() => {
        markedKey.current = "";
      });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [unreadKey, onMarkRead]);

  // Actualización periódica (sin tiempo real): solo con la pantalla visible y conexión.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (sending || readOnly) return;
    const found = validateMessageBody(draft);
    if (found) {
      setError(found);
      return;
    }
    if (!navigator.onLine) {
      setError("Enviar un mensaje requiere conexión. Tu texto se queda aquí.");
      return;
    }
    const body = draft.trim();
    // Mismo texto que un intento fallido: mismo clientId (idempotente).
    const attempt = lastAttempt.current?.body === body ? lastAttempt.current : { clientId: crypto.randomUUID(), body };
    lastAttempt.current = attempt;
    setSending(true);
    setError(null);
    setStatus("Enviando mensaje…");
    try {
      const result = await onSend(attempt);
      if (!result.ok) {
        setError(result.message);
        setStatus("");
        return;
      }
      setConfirmed((list) => [...list, result.message]);
      setDraft("");
      lastAttempt.current = null;
      setStatus("Mensaje enviado.");
    } catch {
      setError("No se pudo enviar. Revisa tu conexión; tu mensaje sigue aquí.");
      setStatus("");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // En teclado físico, Ctrl/⌘ + Enter envía; Enter solo agrega una línea.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  const nearLimit = draft.length > MESSAGE_MAX_LENGTH - 200;

  return (
    <section aria-label={`Conversación con ${counterpart}`} className="flex flex-col rounded-2xl border border-line bg-surface">
      {header}

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <MessageSquare aria-hidden className="size-6 text-muted" />
          <p className="font-semibold text-ink">Todavía no hay mensajes</p>
          <p className="max-w-sm text-sm text-muted">
            {readOnly ? "Esta conversación no tiene historial." : `Escribe el primero para ${counterpart}.`}
          </p>
        </div>
      ) : (
        <ol ref={listRef} aria-label="Mensajes" className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto p-4 lg:max-h-[32rem]">
          {messages.map((m) => (
            <li
              key={m.clientId}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap",
                m.mine ? "self-end bg-surface-2 text-ink" : "self-start border border-line text-ink",
              )}
            >
              <span className="sr-only">{m.mine ? "Tú" : counterpart}: </span>
              {m.body}
              <span className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">
                <time dateTime={m.createdAt}>{formatMessageTime(m.createdAt, today, APP_TIME_ZONE)}</time>
                {m.mine && (
                  <>
                    <span aria-hidden>·</span>
                    {m.readAt ? (
                      <CheckCheck aria-hidden className="size-3.5 text-info" />
                    ) : (
                      <Check aria-hidden className="size-3.5" />
                    )}
                    <span>{m.readAt ? "Leído" : "Enviado"}</span>
                  </>
                )}
                {!m.mine && !m.readAt && <span className="font-semibold text-acid">· Nuevo</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {readOnly ? (
        <p role="note" className="flex items-start gap-2 border-t border-line p-4 text-sm text-muted">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {readOnly}
        </p>
      ) : (
        <form onSubmit={send} noValidate className="flex flex-col gap-2 border-t border-line p-3">
          {!online && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />
              Sin conexión. Enviar un mensaje requiere conexión; tu texto se queda aquí.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Textarea
                label={`Mensaje para ${counterpart}`}
                hideLabel
                rows={2}
                maxLength={MESSAGE_MAX_LENGTH}
                placeholder="Escribe un mensaje"
                value={draft}
                error={error ?? undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={onKeyDown}
                className="min-h-11 resize-y"
              />
            </div>
            <Button
              type="submit"
              loading={sending}
              loadingLabel="Enviando…"
              disabled={!draft.trim() || !online}
              icon={<Send aria-hidden className="size-4" />}
            >
              Enviar
            </Button>
          </div>
          {nearLimit && (
            <p className="text-right text-xs text-muted tabular-nums">
              {draft.length}/{MESSAGE_MAX_LENGTH}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
