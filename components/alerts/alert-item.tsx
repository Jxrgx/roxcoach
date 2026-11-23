import Link from "next/link";
import { ChevronRight, Info, ShieldAlert, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { alertHref, isPendingAlert, MEDICAL_DISCLAIMER, PRIORITY_LABEL, type AlertPriority } from "@/lib/alerts/rules";
import type { AlertDTO } from "@/lib/db/alerts";
import { formatKeyShort, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { MarkReadButton } from "@/components/alerts/mark-read-button";

const PRIORITY: Record<AlertPriority, { tone: BadgeTone; icon: typeof Info; accent: string }> = {
  1: { tone: "danger", icon: ShieldAlert, accent: "border-l-danger" },
  2: { tone: "warning", icon: AlertTriangle, accent: "border-l-warning" },
  3: { tone: "neutral", icon: Clock, accent: "border-l-line" },
  4: { tone: "info", icon: Info, accent: "border-l-electric" },
};

/** Prioridad con icono + texto + etiqueta accesible (el color solo apoya). */
export function AlertPriorityBadge({ priority }: { priority: AlertPriority }) {
  const { tone, icon: Icon } = PRIORITY[priority];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden />}>
      <span className="sr-only">Prioridad: </span>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

/** Un aviso: prioridad, título, atleta, fecha, descripción y enlace; "Marcar como leído" si aplica. */
export function AlertItem({ alert, compact = false }: { alert: AlertDTO; compact?: boolean }) {
  const href = alertHref(alert);
  const pending = isPendingAlert(alert);
  const resolved = alert.resolvedAt !== null;
  const day = formatKeyShort(todayKey(APP_TIME_ZONE, alert.eventAt));
  return (
    <article
      aria-labelledby={`aviso-${alert.id}`}
      className={cn("rounded-2xl border border-l-4 border-line bg-surface p-4", PRIORITY[alert.priority].accent, !pending && "opacity-80")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <AlertPriorityBadge priority={alert.priority} />
        {resolved ? (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <CheckCircle2 aria-hidden className="size-4 text-positive" />
            Resuelto
          </span>
        ) : (
          alert.readAt !== null && <span className="text-sm text-muted">Leído</span>
        )}
        <span className="ml-auto text-sm text-muted tabular-nums">{day}</span>
      </div>
      <h3 id={`aviso-${alert.id}`} className="mt-2 font-semibold text-ink">
        {alert.title}
      </h3>
      <p className="text-sm text-ink">{alert.athleteName}</p>
      {!compact && <p className="mt-1 text-sm text-muted">{alert.description}</p>}
      {alert.kind === "molestia" && <p className="mt-1 text-sm text-muted italic">{MEDICAL_DISCLAIMER}</p>}
      {resolved && alert.kind === "no_iniciada" && <p className="mt-1 text-sm text-muted">Ya no requiere atención: la sesión se comenzó, se canceló o se retiró al atleta.</p>}
      <div className="mt-2 -mx-2 flex flex-wrap items-center justify-between gap-x-2">
        {href ? (
          <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-electric hover:underline" aria-label={`Ver detalle: ${alert.title} de ${alert.athleteName}`}>
            Ver detalle
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className="text-sm text-muted">El registro de origen ya no está disponible.</span>
        )}
        {pending && <MarkReadButton id={alert.id} title={`${alert.title} de ${alert.athleteName}`} />}
      </div>
    </article>
  );
}
