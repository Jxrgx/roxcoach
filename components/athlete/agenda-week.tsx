import { CalendarDays } from "lucide-react";
import type { AthleteSessionDTO } from "@/lib/db/sessions";
import type { WeekDayKey } from "@/lib/scheduling/dates";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionCard } from "@/components/workouts/session-card";

/**
 * Agenda semanal del atleta: tira resumen (no interactiva) + lista por día.
 * Los días sin sesión se muestran como "Sin sesión" (descanso o libre); si
 * toda la semana está vacía se muestra un único mensaje en lugar de siete.
 */
export function AgendaWeek({
  days,
  sessions,
}: {
  days: WeekDayKey[];
  sessions: AthleteSessionDTO[];
}) {
  const byDay = (key: string) => sessions.filter((s) => s.date === key);

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Resumen de la semana" className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const items = byDay(d.key);
          const scheduled = items.filter(
            (s) => s.status === "programada",
          ).length;
          return (
            <li
              key={d.key}
              aria-current={d.isToday ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border py-2",
                d.isToday
                  ? "border-acid/60 bg-surface-2"
                  : "border-transparent",
              )}
            >
              <span
                className={cn(
                  "text-[11px]",
                  d.isToday ? "font-semibold text-acid" : "text-muted",
                )}
              >
                {d.label}
              </span>
              <span className="text-base font-bold tabular-nums text-ink">
                {d.dayOfMonth}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  scheduled ? "bg-acid" : "bg-line",
                )}
              />
              <span className="sr-only">
                {scheduled
                  ? `${scheduled} ${scheduled === 1 ? "sesión" : "sesiones"}`
                  : "sin sesión"}
              </span>
            </li>
          );
        })}
      </ol>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No hay sesiones esta semana"
          description="Cuando tu coach te asigne entrenamientos para estos días, aparecerán aquí."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {days.map((d) => {
            const items = byDay(d.key);
            return (
              <li key={d.key} aria-label={`${d.label} ${d.dayOfMonth}`}>
                <h3
                  className={cn(
                    "mb-2 text-sm font-medium",
                    d.isToday ? "text-acid" : "text-muted",
                  )}
                >
                  {d.isToday ? "Hoy" : d.label} {d.dayOfMonth}
                </h3>
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
                    Sin sesión
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((s) => (
                      <li key={s.id}>
                        <SessionCard
                          href={`/atleta/sesiones/${s.id}`}
                          highlight={d.isToday && s.status === "programada"}
                          session={{
                            title: s.title,
                            when: s.startTime ?? "Sin hora",
                            status: s.status,
                            estimatedMinutes: s.estimatedMinutes,
                            blockCount: s.blockCount,
                            intensity: s.intensity,
                            execution: s.execution,
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
  );
}
