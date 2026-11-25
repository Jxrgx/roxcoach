import Link from "next/link";
import { ArrowLeft, Lock, PauseCircle } from "lucide-react";
import type { ConversationSummaryDTO } from "@/lib/db/messages";
import { formatMessageTime, messagePreview, type MessageRelationStatus } from "@/lib/messages/rules";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/shared/avatar";
import { Badge } from "@/components/ui/badge";

function RelationBadge({ status }: { status: MessageRelationStatus }) {
  if (status === "active") return null;
  return status === "paused" ? (
    <Badge tone="neutral" icon={<PauseCircle aria-hidden />}>
      En pausa
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<Lock aria-hidden />}>
      Solo lectura
    </Badge>
  );
}

/** Conversaciones del coach: una por atleta, con último mensaje y no leídos (número + texto). */
export function ConversationList({
  conversations,
  selectedId,
  today,
}: {
  conversations: ConversationSummaryDTO[];
  selectedId: string | null;
  today: string;
}) {
  return (
    <ul aria-label="Conversaciones" className="flex flex-col gap-2">
      {conversations.map((c) => {
        const selected = selectedId === c.athleteId;
        return (
          <li key={c.athleteId}>
            <Link
              href={`/coach/mensajes?atleta=${c.athleteId}`}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition-colors hover:border-muted/50",
                selected ? "border-muted/50 bg-surface-2" : "border-line",
              )}
            >
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-ink">{c.name}</span>
                  {c.last && (
                    <time dateTime={c.last.createdAt} className="shrink-0 text-xs text-muted">
                      {formatMessageTime(c.last.createdAt, today, APP_TIME_ZONE)}
                    </time>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">
                  {c.last ? `${c.last.mine ? "Tú: " : ""}${messagePreview(c.last.body)}` : "Sin mensajes todavía"}
                </span>
                {c.status !== "active" && (
                  <span className="mt-1.5 block">
                    <RelationBadge status={c.status} />
                  </span>
                )}
              </span>
              {c.unread > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-electric px-1.5 text-xs font-bold text-bg tabular-nums">
                  {c.unread}
                  <span className="sr-only"> {c.unread === 1 ? "mensaje sin leer" : "mensajes sin leer"}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Encabezado de la conversación: en mobile, volver a la lista. */
export function CoachThreadHeader({ name, status }: { name: string; status: MessageRelationStatus }) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line p-2 pr-4">
      <Link
        href="/coach/mensajes"
        className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-muted hover:text-ink lg:hidden"
      >
        <ArrowLeft aria-hidden className="size-5" />
        Conversaciones
      </Link>
      <h2 className="ml-auto flex items-center gap-2 font-semibold text-ink lg:ml-2">
        {name}
        <RelationBadge status={status} />
      </h2>
    </header>
  );
}
