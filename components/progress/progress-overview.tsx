import type { ReactNode } from "react";
import { Clock, Gauge } from "lucide-react";
import {
  adherence,
  averageRpe,
  completedInLastDays,
  exerciseProgress,
  inPeriod,
  PERIOD_LABEL,
  periodStart,
  recentDiscomforts,
  trainingTime,
  type Period,
  type ProgressRecord,
} from "@/lib/progress/metrics";
import { formatTotalTime, sessionsLabel } from "@/lib/progress/format";
import type { WeightUnit } from "@/lib/workouts/rules";
import { SectionHeader } from "@/components/ui/card";
import { AdherenceCard, DataNote, ExerciseTrends, INSUFFICIENT, PersonalRecords, RecentDiscomforts } from "@/components/progress/progress-parts";

/**
 * Progreso de UN atleta (lo usan el atleta y el coach), en el orden que
 * responde: ¿estoy cumpliendo? → ¿cómo evoluciono? → ¿hay algo que atender?
 * - Adherencia, tiempo, RPE y molestias: periodo elegido (fecha programada /
 *   fecha de la molestia).
 * - Completadas 7/30/90: fecha real de fin, en la zona de la app.
 * - Evolución y marcas: todo el historial (más datos comparables).
 */
export function ProgressOverview({
  records,
  period,
  today,
  unit,
  sessionHref,
  noCompletedState,
  adherenceTitle,
}: {
  records: ProgressRecord[];
  period: Period;
  today: string;
  unit: WeightUnit;
  sessionHref: (sessionId: string) => string;
  /** Qué mostrar en "Evolución" si aún no hay sesiones completadas. */
  noCompletedState: ReactNode;
  adherenceTitle?: string;
}) {
  const scoped = inPeriod(records, period, today);
  const summary = adherence(scoped, today);
  const time = trainingTime(scoped);
  const rpe = averageRpe(scoped);
  const discomforts = recentDiscomforts(records, periodStart(period, today));
  const exercises = exerciseProgress(records);
  const totalCompleted = adherence(records, today).completed;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <AdherenceCard summary={summary} period={period} title={adherenceTitle} />

        <section aria-labelledby="completadas-recientes" className="rounded-2xl border border-line bg-surface p-4">
          <h2 id="completadas-recientes" className="text-sm font-medium text-muted">
            Sesiones completadas (por fecha en que entrenaste)
          </h2>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[7, 30, 90].map((days) => (
              <div key={days} className="rounded-xl bg-surface-2 px-2 py-2.5">
                <dt className="text-sm text-muted">{days} días</dt>
                <dd className="text-2xl font-bold tabular-nums text-ink">{completedInLastDays(records, days, today)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              <Clock aria-hidden className="size-4" />
              Tiempo entrenado
            </dt>
            <dd>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-ink">{time.sessions > 0 ? formatTotalTime(time.totalSeconds) : INSUFFICIENT}</span>
              <DataNote period={PERIOD_LABEL[period]} sessions={time.sessions} insufficient={time.sessions === 0} />
              {time.discarded > 0 && (
                <span className="mt-1 block text-sm text-muted">
                  Se excluye{time.discarded === 1 ? "" : "n"} {sessionsLabel(time.discarded)} con duración no válida (más de 5 h).
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              <Gauge aria-hidden className="size-4" />
              RPE promedio
            </dt>
            <dd>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-ink">{rpe.value !== null ? rpe.value.toLocaleString("es-MX") : INSUFFICIENT}</span>
              <DataNote period={PERIOD_LABEL[period]} sessions={rpe.sessions} insufficient={rpe.sessions < 3} />
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="evolucion" className="flex flex-col gap-4">
        <SectionHeader id="evolucion" title="Evolución" />
        {totalCompleted === 0 ? (
          noCompletedState
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-base font-semibold text-ink">Marcas personales</h3>
              <PersonalRecords items={exercises} unit={unit} />
            </div>
            <div>
              <h3 className="mb-1 text-base font-semibold text-ink">Por ejercicio</h3>
              <p className="mb-3 text-sm text-muted">
                Mejor serie de cada sesión completada, todo el historial. Solo se compara el mismo ejercicio con el mismo tipo de objetivo.
              </p>
              <ExerciseTrends items={exercises} unit={unit} />
              <p className="mt-3 text-sm text-muted">
                El ritmo y el mejor tiempo en distancia no se muestran: las series de distancia registran los metros, no el tiempo.
              </p>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="atender" className="flex flex-col gap-3">
        <SectionHeader id="atender" title="Molestias reportadas" />
        {discomforts.length > 0 ? (
          <RecentDiscomforts items={discomforts} sessionHref={sessionHref} />
        ) : (
          <p className="text-sm text-muted">Sin molestias reportadas · {PERIOD_LABEL[period].toLowerCase()}.</p>
        )}
      </section>
    </div>
  );
}
