"use client";

import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import type { SessionSummaryDTO } from "@/lib/db/sessions";
import type { WeekDayKey } from "@/lib/scheduling/dates";
import { cn } from "@/lib/utils/cn";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionCard } from "@/components/workouts/session-card";

type Filter = "todas" | "programada" | "cancelada";

export function filterSessionsByStatus<T extends { status: "programada" | "cancelada" }>(sessions: T[], filter: Filter): T[] {
  return filter === "todas" ? sessions : sessions.filter((s) => s.status === filter);
}

/** Semana del coach: un bloque por día (apilado en mobile, fila por día desde tablet). */
export function CalendarWeek({ days, sessions }: { days: WeekDayKey[]; sessions: SessionSummaryDTO[] }) {
  const [filter, setFilter] = useState<Filter>("todas");
  const visible = filterSessionsByStatus(sessions, filter);

  return (
    <div>
      <Tabs
        label="Filtrar sesiones por estado"
        panelId="semana"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "todas", label: "Todas", count: sessions.length },
          { value: "programada", label: "Programadas", count: filterSessionsByStatus(sessions, "programada").length },
          { value: "cancelada", label: "Canceladas", count: filterSessionsByStatus(sessions, "cancelada").length },
        ]}
      />
      <div id="semana" role="tabpanel" className="mt-5">
        {visible.length === 0 && filter !== "todas" ? (
          <EmptyState icon={<CalendarX2 />} title="No hay sesiones con este filtro" description="Prueba con otro estado o revisa otra semana." />
        ) : (
          <ol className="flex flex-col gap-3">
            {days.map((day) => {
              const items = visible.filter((s) => s.date === day.key);
              return (
                <li
                  key={day.key}
                  aria-current={day.isToday ? "date" : undefined}
                  className={cn("rounded-2xl border bg-surface p-3 md:flex md:gap-4 md:p-4", day.isToday ? "border-acid/50" : "border-line")}
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
                    <ul className="mt-2 grid min-w-0 flex-1 grid-cols-1 gap-2 md:mt-0 xl:grid-cols-2">
                      {items.map((s) => (
                        <li key={s.id} className="min-w-0">
                          <SessionCard
                            href={`/coach/sesiones/${s.id}`}
                            session={{
                              title: s.title,
                              when: s.startTime ?? "Sin hora",
                              status: s.status,
                              estimatedMinutes: s.estimatedMinutes,
                              blockCount: s.blockCount,
                              intensity: s.intensity,
                              athleteCount: s.athleteCount,
                            }}
                          />
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
