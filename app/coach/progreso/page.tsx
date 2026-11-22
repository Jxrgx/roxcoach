import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, PauseCircle, TrendingDown } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listCoachProgressAthletes, listCoachProgressRecords } from "@/lib/db/progress";
import { coachOverview, parsePeriod, parseStatusFilter, percent, PERIOD_LABEL, type AthleteProgressRow, type Period } from "@/lib/progress/metrics";
import { formatKeyShort, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AdherenceCard } from "@/components/progress/progress-parts";
import { ProgressFilters } from "@/components/progress/progress-filters";

export const metadata: Metadata = { title: "Progreso" };

function AthleteRow({ row, period }: { row: AthleteProgressRow; period: Period }) {
  const a = row.adherence;
  return (
    <li>
      <Link
        href={`/coach/progreso/${row.athleteId}?periodo=${period}`}
        className="group relative block rounded-2xl border border-line bg-surface p-4 pr-10 hover:border-muted/50"
        aria-label={`Ver progreso de ${row.name}`}
      >
        <div className="flex flex-col items-start gap-1.5">
          <p className="font-semibold break-words text-ink">{row.name}</p>
          <span className="flex flex-wrap gap-1.5">
            {row.relationStatus === "paused" && (
              <Badge tone="neutral" icon={<PauseCircle aria-hidden />}>
                En pausa
              </Badge>
            )}
            {row.low && (
              <Badge tone="warning" icon={<TrendingDown aria-hidden />}>
                Baja adherencia
              </Badge>
            )}
            {row.discomforts > 0 && (
              <Badge tone="warning" icon={<AlertTriangle aria-hidden />}>
                {row.discomforts === 1 ? "1 molestia" : `${row.discomforts} molestias`}
              </Badge>
            )}
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">
            {a.rate === null ? "Sin sesiones vencidas" : `${a.completed} de ${a.due} completadas`}
            {!a.sufficient && a.rate !== null ? " · datos insuficientes" : ""}
          </span>
          <span className="text-lg font-bold tabular-nums text-ink">{a.rate === null ? "—" : `${percent(a.rate)}%`}</span>
        </div>
        {a.rate !== null && <ProgressBar className="mt-1.5" value={percent(a.rate)} label={`Adherencia de ${row.name}`} size="sm" tone={row.low ? "warning" : "info"} />}
        <p className="mt-2 text-sm text-muted">{row.lastCompletedDay ? `Última sesión completada: ${formatKeyShort(row.lastCompletedDay)}` : "Aún no completa sesiones"}</p>
        <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
      </Link>
    </li>
  );
}

/**
 * Progreso del equipo: solo atletas que hoy pertenecen al coach (activos y en
 * pausa) y solo sesiones programadas por él. Filtros por periodo, atleta y estado.
 */
export default async function CoachProgressPage({ searchParams }: PageProps<"/coach/progreso">) {
  const [coach, query] = await Promise.all([requireCoach(), searchParams]);
  const period = parsePeriod(query.periodo);
  const status = parseStatusFilter(query.estado);
  const today = todayKey(APP_TIME_ZONE);

  const athletes = await listCoachProgressAthletes(coach.id);
  // El atleta del filtro se acepta solo si es del coach (no se confía en la URL).
  const requested = typeof query.atleta === "string" ? query.atleta : "";
  const athleteId = athletes.some((a) => a.athleteId === requested) ? requested : "";
  const scope = athleteId ? athletes.filter((a) => a.athleteId === athleteId) : athletes;
  const records = await listCoachProgressRecords(
    coach.id,
    scope.map((a) => a.athleteId),
  );
  const overview = coachOverview(
    scope.map((a) => ({ ...a, records: records.get(a.athleteId) ?? [] })),
    period,
    today,
    status,
  );

  return (
    <>
      <PageHeader title="Progreso" description="Adherencia y evolución de tus atletas con sus sesiones reales." />
      <ScreenStates
        empty={{ title: "Aún no hay resultados registrados", description: "Cuando tus atletas completen sesiones, verás aquí su progreso." }}
        loadingLabel="Cargando progreso…"
        loadingVariant="cards"
      >
        {athletes.length === 0 ? (
          <EmptyState
            title="Todavía no tienes atletas"
            description="El progreso se calcula con las sesiones que programas y tus atletas completan."
            action={<ButtonLink href="/coach/atletas">Ir a Atletas</ButtonLink>}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <ProgressFilters athletes={athletes} period={period} athleteId={athleteId} status={status} />

            <AdherenceCard summary={overview.group} period={period} title={athleteId ? "Adherencia" : "Adherencia del grupo"} />

            {(overview.lowCount > 0 || overview.discomfortCount > 0) && (
              <section aria-labelledby="atencion" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
                <h2 id="atencion" className="flex items-center gap-2 font-semibold text-ink">
                  <AlertTriangle aria-hidden className="size-4 text-warning" />
                  Requieren atención
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {overview.lowCount > 0 && (
                    <li>
                      <Link className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:underline" href={`/coach/progreso?periodo=${period}&estado=baja`}>
                        {overview.lowCount === 1 ? "1 atleta" : `${overview.lowCount} atletas`} con baja adherencia (menos de 70%)
                      </Link>
                    </li>
                  )}
                  {overview.discomfortCount > 0 && (
                    <li>
                      <Link className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:underline" href={`/coach/progreso?periodo=${period}&estado=molestias`}>
                        {overview.discomfortCount === 1 ? "1 atleta" : `${overview.discomfortCount} atletas`} con molestias · {PERIOD_LABEL[period].toLowerCase()}
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            )}

            <section aria-labelledby="por-atleta">
              <SectionHeader id="por-atleta" title="Por atleta" />
              {overview.rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Ningún atleta coincide con los filtros.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {overview.rows.map((row) => (
                    <AthleteRow key={row.athleteId} row={row} period={period} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </ScreenStates>
    </>
  );
}
