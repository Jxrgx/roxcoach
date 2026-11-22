import Link from "next/link";
import { ChevronRight, Clock, Layers, Users } from "lucide-react";
import type { Intensity as Level, SessionStatus as Status } from "@/lib/types/domain";
import { formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { SessionStatus } from "@/components/workouts/session-status";
import { Intensity } from "@/components/workouts/intensity";

export interface WorkoutCardProps {
  name: string;
  /** Contexto temporal: "07:00", "Mañana · 07:00". */
  when?: string;
  durationMinutes: number;
  intensity: Level;
  blockCount: number;
  status?: Status;
  athleteCount?: number;
  href?: string;
  className?: string;
}

/** Resumen de una sesión de entrenamiento (planeado). */
export function WorkoutCard({
  name,
  when,
  durationMinutes,
  intensity,
  blockCount,
  status,
  athleteCount,
  href,
  className,
}: WorkoutCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {when && <p className="text-sm font-medium tabular-nums text-muted">{when}</p>}
          <h3 className="mt-0.5 font-semibold leading-snug text-ink">{name}</h3>
        </div>
        {status && <SessionStatus status={status} />}
      </div>
      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Duración</dt>
          <Clock aria-hidden className="size-4" />
          <dd className="tabular-nums text-ink">{formatDuration(durationMinutes)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Bloques</dt>
          <Layers aria-hidden className="size-4" />
          <dd className="text-ink">
            {blockCount} {blockCount === 1 ? "bloque" : "bloques"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Intensidad</dt>
          <dd>
            <Intensity level={intensity} />
          </dd>
        </div>
        {athleteCount !== undefined && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Atletas asignados</dt>
            <Users aria-hidden className="size-4" />
            <dd className="text-ink">
              {athleteCount} {athleteCount === 1 ? "atleta" : "atletas"}
            </dd>
          </div>
        )}
      </dl>
    </>
  );

  const base = "block rounded-2xl border border-line bg-surface p-4 shadow-card";

  if (href) {
    return (
      <Link href={href} className={cn(base, "group relative pr-10 transition-colors hover:border-muted/50", className)}>
        {body}
        <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
      </Link>
    );
  }
  return <article className={cn(base, className)}>{body}</article>;
}
