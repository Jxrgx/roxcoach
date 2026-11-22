import { CalendarClock } from "lucide-react";
import type { Athlete, AthleteStatus } from "@/lib/types/domain";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Avatar } from "@/components/shared/avatar";

const STATUS: Record<AthleteStatus, { label: string; tone: BadgeTone }> = {
  activo: { label: "Activo", tone: "positive" },
  pendiente: { label: "Con pendientes", tone: "warning" },
  en_pausa: { label: "En pausa", tone: "neutral" },
};

function adherenceTone(value: number) {
  if (value >= 80) return "positive" as const;
  if (value >= 60) return "warning" as const;
  return "danger" as const;
}

export function AthleteCard({ athlete }: { athlete: Athlete }) {
  const status = STATUS[athlete.status];
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={athlete.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-ink">{athlete.name}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">{athlete.division}</p>
        </div>
      </div>
      <ProgressBar
        className="mt-4"
        value={athlete.adherence}
        label="Adherencia (4 semanas)"
        showLabel
        size="sm"
        tone={adherenceTone(athlete.adherence)}
      />
      <p className="mt-3 flex items-start gap-1.5 text-sm">
        <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <span className="sr-only">Próxima sesión: </span>
        <span className={athlete.nextSessionLabel ? "text-ink" : "text-muted"}>
          {athlete.nextSessionLabel ?? "Sin sesiones asignadas"}
        </span>
      </p>
    </article>
  );
}
