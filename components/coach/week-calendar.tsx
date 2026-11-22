"use client";

import { useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import type { ScheduledSession, SessionStatus as Status } from "@/lib/types/domain";
import { getWeek } from "@/lib/utils/format";
import { useToday } from "@/lib/utils/use-today";
import { cn } from "@/lib/utils/cn";
import { Tabs } from "@/components/ui/tabs";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionStatus } from "@/components/workouts/session-status";
import { Intensity } from "@/components/workouts/intensity";

type Filter = "todas" | "pendientes" | "completadas" | "omitidas";

const MATCH: Record<Filter, (s: Status) => boolean> = {
  todas: () => true,
  pendientes: (s) => s === "programada" || s === "en_curso",
  completadas: (s) => s === "completada",
  omitidas: (s) => s === "omitida",
};

export function filterSessions(sessions: ScheduledSession[], filter: Filter) {
  return sessions.filter((s) => MATCH[filter](s.status));
}

/** Semana actual (lun–dom) con sesiones del equipo. Apilada en mobile, 7 columnas en desktop. */
export function WeekCalendar({ sessions }: { sessions: ScheduledSession[] }) {
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("todas");

  const week = useMemo(() => (today ? getWeek(today) : []), [today]);
  const inWeek = useMemo(
    () => sessions.filter((s) => week.some((d) => d.offset === s.dayOffset)),
    [sessions, week],
  );
  const visible = filterSessions(inWeek, filter);

  if (!today) return <LoadingState label="Cargando semana…" rows={4} />;

  const tabs = [
    { value: "todas" as const, label: "Todas", count: inWeek.length },
    { value: "pendientes" as const, label: "Pendientes", count: filterSessions(inWeek, "pendientes").length },
    { value: "completadas" as const, label: "Completadas", count: filterSessions(inWeek, "completadas").length },
    { value: "omitidas" as const, label: "No realizadas", count: filterSessions(inWeek, "omitidas").length },
  ];

  return (
    <div>
      <Tabs items={tabs} value={filter} onChange={setFilter} label="Filtrar sesiones por estado" panelId="semana" />

      <div id="semana" role="tabpanel" className="mt-5">
        {visible.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 />}
            title="No hay sesiones con este filtro"
            description="Prueba con otro estado o revisa la semana completa."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {week.map((day) => {
              const items = visible
                .filter((s) => s.dayOffset === day.offset)
                .sort((a, b) => a.time.localeCompare(b.time));
              return (
                <li
                  key={day.offset}
                  aria-current={day.isToday ? "date" : undefined}
                  className={cn(
                    "rounded-2xl border bg-surface p-3 md:flex md:gap-4 md:p-4",
                    day.isToday ? "border-acid/50" : "border-line",
                  )}
                >
                  <h3 className="flex items-baseline gap-2 md:w-20 md:shrink-0 md:flex-col md:gap-0">
                    <span className={cn("text-sm font-medium", day.isToday ? "text-acid" : "text-muted")}>
                      {day.label}
                      {day.isToday && " · Hoy"}
                    </span>
                    <span className="text-lg font-bold tabular-nums text-ink">{day.dayOfMonth}</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="mt-2 text-sm text-muted md:mt-0 md:self-center">Sin sesiones</p>
                  ) : (
                    <ul className="mt-2 grid grid-cols-1 min-w-0 flex-1 gap-2 md:mt-0 xl:grid-cols-2">
                      {items.map((s) => (
                        <li key={s.id} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3">
                          <p className="text-xs tabular-nums text-muted">{s.time}</p>
                          <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">{s.name}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <SessionStatus status={s.status} />
                            <Intensity level={s.intensity} className="text-xs" />
                            <span className="text-xs text-muted">
                              {s.athleteIds.length} {s.athleteIds.length === 1 ? "atleta" : "atletas"}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
