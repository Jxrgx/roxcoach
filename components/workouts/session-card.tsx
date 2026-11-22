import Link from "next/link";
import { ChevronRight, Clock, Layers, Users, XCircle } from "lucide-react";
import type { WorkoutIntensityValue } from "@/lib/workouts/rules";
import { formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Intensity } from "@/components/workouts/intensity";
import { ExecutionStatusBadge } from "@/components/workouts/execution-status";
import type { ExecutionStatus } from "@/lib/execution/progress";

export interface SessionCardData {
  title: string;
  /** "Hoy · 07:00", "Mié 26 nov". */
  when: string;
  status: "programada" | "cancelada";
  estimatedMinutes: number | null;
  blockCount: number;
  intensity: WorkoutIntensityValue;
  /** Solo en la vista del coach. */
  athleteCount?: number;
  /** Solo en la vista del atleta: su propia ejecución. */
  execution?: ExecutionStatus;
}

/** Sesión programada (coach o atleta). Cancelada: icono + texto, no solo color. */
export function SessionCard({ session, href, highlight = false }: { session: SessionCardData; href: string; highlight?: boolean }) {
  const cancelled = session.status === "cancelada";
  return (
    <Link
      href={href}
      className={cn(
        "group relative block rounded-2xl border bg-surface p-4 pr-10 shadow-card transition-colors hover:border-muted/50",
        highlight ? "border-acid/50" : "border-line",
        cancelled && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums text-muted">{session.when}</p>
          <h3 className={cn("mt-0.5 font-semibold leading-snug text-ink", cancelled && "line-through decoration-muted")}>{session.title}</h3>
        </div>
        {cancelled && (
          <Badge tone="danger" icon={<XCircle aria-hidden />}>
            Cancelada
          </Badge>
        )}
        {session.execution && session.execution !== "sin_iniciar" && <ExecutionStatusBadge status={session.execution} />}
      </div>
      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Duración</dt>
          <Clock aria-hidden className="size-4" />
          <dd className="tabular-nums text-ink">{session.estimatedMinutes ? formatDuration(session.estimatedMinutes) : "Sin duración"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Bloques</dt>
          <Layers aria-hidden className="size-4" />
          <dd className="text-ink">
            {session.blockCount} {session.blockCount === 1 ? "bloque" : "bloques"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Intensidad</dt>
          <dd>
            <Intensity level={session.intensity} />
          </dd>
        </div>
        {session.athleteCount !== undefined && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Atletas asignados</dt>
            <Users aria-hidden className="size-4" />
            <dd className="text-ink">
              {session.athleteCount} {session.athleteCount === 1 ? "atleta" : "atletas"}
            </dd>
          </div>
        )}
      </dl>
      <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
    </Link>
  );
}
