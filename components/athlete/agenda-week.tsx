"use client";

import { useMemo } from "react";
import type { ScheduledSession, SessionStatus as Status } from "@/lib/types/domain";
import { getWeek, type WeekDay } from "@/lib/utils/format";
import { useToday } from "@/lib/utils/use-today";
import { cn } from "@/lib/utils/cn";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/card";
import { SessionStatus } from "@/components/workouts/session-status";
import { WorkoutCard } from "@/components/workouts/workout-card";

const DOT: Record<Status, string> = {
  programada: "bg-muted",
  en_curso: "bg-acid",
  completada: "bg-positive",
  omitida: "bg-danger",
  descanso: "bg-electric",
};

const DOT_LABEL: Record<Status, string> = {
  programada: "programada",
  en_curso: "en curso",
  completada: "completada",
  omitida: "no realizada",
  descanso: "descanso",
};

function DayRow({ day, session }: { day: WeekDay; session: ScheduledSession | undefined }) {
  const label = `${day.isToday ? "Hoy" : day.label} ${day.dayOfMonth}`;
  if (!session || session.status === "descanso") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="font-medium text-ink">Día de descanso</p>
        </div>
        <SessionStatus status="descanso" />
      </div>
    );
  }
  return (
    <WorkoutCard
      name={session.name}
      when={`${label} · ${session.time}`}
      durationMinutes={session.durationMinutes}
      intensity={session.intensity}
      blockCount={session.blockCount}
      status={day.isToday && session.status === "programada" ? undefined : session.status}
      href={day.isToday ? "/atleta/sesiones" : undefined}
      className={day.isToday ? "border-acid/50" : undefined}
    />
  );
}

/** Agenda semanal: tira resumen (no interactiva) + lista por día. */
export function AgendaWeek({ plan }: { plan: ScheduledSession[] }) {
  const today = useToday();
  const week = useMemo(() => (today ? getWeek(today) : []), [today]);

  if (!today) return <LoadingState label="Cargando tu semana…" rows={4} />;

  const sessionFor = (d: WeekDay) => plan.find((s) => s.dayOffset === d.offset);
  const upcoming = week.filter((d) => d.offset >= 0);
  const past = week.filter((d) => d.offset < 0);

  return (
    <div className="flex flex-col gap-8">
      <ol aria-label="Resumen de la semana" className="grid grid-cols-7 gap-1">
        {week.map((d) => {
          const s = sessionFor(d);
          const status: Status = s?.status ?? "descanso";
          return (
            <li
              key={d.offset}
              aria-current={d.isToday ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border py-2",
                d.isToday ? "border-acid/60 bg-surface-2" : "border-transparent",
              )}
            >
              <span className={cn("text-[11px]", d.isToday ? "font-semibold text-acid" : "text-muted")}>{d.label}</span>
              <span className="text-base font-bold tabular-nums text-ink">{d.dayOfMonth}</span>
              <span aria-hidden className={cn("size-1.5 rounded-full", DOT[status])} />
              <span className="sr-only">{DOT_LABEL[status]}</span>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="proximas">
        <SectionHeader id="proximas" title="Próximas" />
        <ul className="flex flex-col gap-3">
          {upcoming.map((d) => (
            <li key={d.offset}>
              <DayRow day={d} session={sessionFor(d)} />
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 && (
        <section aria-labelledby="realizadas">
          <SectionHeader id="realizadas" title="Esta semana" />
          <ul className="flex flex-col gap-3">
            {past.map((d) => (
              <li key={d.offset}>
                <DayRow day={d} session={sessionFor(d)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
