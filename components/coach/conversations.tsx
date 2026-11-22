"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Send } from "lucide-react";
import type { Conversation } from "@/lib/mock/coach";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/shared/avatar";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Lista de conversaciones + hilo. En mobile se muestra una vista a la vez;
 * desde tablet ancha, ambas lado a lado.
 */
export function Conversations({ conversations }: { conversations: Conversation[] }) {
  const [threads, setThreads] = useState(conversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const active = threads.find((c) => c.id === activeId) ?? null;
  // En desktop siempre hay una conversación seleccionada.
  const shown = active ?? threads[0] ?? null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !shown) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 500));
    setThreads((list) =>
      list.map((c) =>
        c.id === shown.id
          ? { ...c, messages: [...c.messages, { id: `local-${c.messages.length + 1}`, from: "coach", text, time: "Ahora" }] }
          : c,
      ),
    );
    setDraft("");
    setSending(false);
    toast.show({ tone: "success", title: "Mensaje enviado", description: "Vista previa: no se envía a nadie todavía." });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <ul aria-label="Conversaciones" className={cn("flex flex-col gap-2", active && "hidden lg:flex")}>
        {threads.map((c) => {
          const last = c.messages.at(-1);
          const selected = shown?.id === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                  selected ? "lg:border-muted/50 lg:bg-surface-2" : "",
                  "border-line bg-surface hover:border-muted/50",
                )}
              >
                <Avatar name={c.athleteName} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{c.athleteName}</span>
                    <span className="shrink-0 text-xs text-muted">{last?.time}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted">{last?.text}</span>
                </span>
                {c.unread > 0 && (
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-electric px-1.5 text-xs font-bold text-bg">
                    {c.unread}
                    <span className="sr-only"> sin leer</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {shown && (
        <section
          aria-label={`Conversación con ${shown.athleteName}`}
          className={cn("flex min-h-[28rem] flex-col rounded-2xl border border-line bg-surface", !active && "hidden lg:flex")}
        >
          <header className="flex items-center gap-2 border-b border-line p-2 pr-4">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-muted hover:text-ink lg:hidden"
            >
              <ArrowLeft aria-hidden className="size-5" />
              Conversaciones
            </button>
            <h2 className="ml-auto font-semibold text-ink lg:ml-2">{shown.athleteName}</h2>
          </header>
          <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
            {shown.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                  m.from === "coach" ? "self-end bg-surface-2 text-ink" : "self-start border border-line text-ink",
                )}
              >
                <span className="sr-only">{m.from === "coach" ? "Tú" : shown.athleteName}: </span>
                {m.text}
                <span className="mt-1 block text-right text-xs text-muted">{m.time}</span>
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
            <div className="flex-1">
              <Textarea
                label={`Mensaje para ${shown.athleteName}`}
                hideLabel
                rows={1}
                placeholder="Escribe un mensaje"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-11 resize-none"
              />
            </div>
            <Button type="submit" loading={sending} loadingLabel="Enviando…" disabled={!draft.trim()} icon={<Send aria-hidden className="size-4" />}>
              Enviar
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
