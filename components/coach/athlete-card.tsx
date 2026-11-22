import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { AthleteStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
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

export interface AthleteCardData {
  name: string;
  division: string;
  status: AthleteStatus;
  /** Métricas de entrenamiento: se muestran solo si existen. */
  adherence?: number;
  nextSessionLabel?: string | null;
}

/**
 * Tarjeta de atleta. Con `href` toda la tarjeta es un enlace al detalle.
 * `meta` agrega información secundaria (p. ej. correo o fecha de alta).
 */
export function AthleteCard({ athlete, href, meta }: { athlete: AthleteCardData; href?: string; meta?: ReactNode }) {
  const status = STATUS[athlete.status];
  const body = (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={athlete.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-ink">{athlete.name}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">{athlete.division || "División sin definir"}</p>
        </div>
      </div>
      {athlete.adherence !== undefined && (
        <ProgressBar
          className="mt-4"
          value={athlete.adherence}
          label="Adherencia (4 semanas)"
          showLabel
          size="sm"
          tone={adherenceTone(athlete.adherence)}
        />
      )}
      {athlete.nextSessionLabel !== undefined && (
        <p className="mt-3 flex items-start gap-1.5 text-sm">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <span className="sr-only">Próxima sesión: </span>
          <span className={athlete.nextSessionLabel ? "text-ink" : "text-muted"}>
            {athlete.nextSessionLabel ?? "Sin sesiones asignadas"}
          </span>
        </p>
      )}
      {meta && <div className="mt-3 text-sm text-muted">{meta}</div>}
    </>
  );

  const base = "block rounded-2xl border border-line bg-surface p-4 shadow-card";
  if (href) {
    return (
      <Link href={href} className={cn(base, "group relative pr-10 transition-colors hover:border-muted/50")}>
        {body}
        <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
      </Link>
    );
  }
  return <article className={base}>{body}</article>;
}
