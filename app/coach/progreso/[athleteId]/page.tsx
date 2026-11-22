import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, PauseCircle } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listCoachProgressAthletes, listCoachProgressRecords } from "@/lib/db/progress";
import { summarize } from "@/lib/execution/progress";
import { finishedDay, parsePeriod, type Period } from "@/lib/progress/metrics";
import { formatKeyShort, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodTabs } from "@/components/progress/progress-parts";
import { ProgressOverview } from "@/components/progress/progress-overview";

export const metadata: Metadata = { title: "Progreso del atleta" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Progreso de un atleta del coach: solo si hoy le pertenece (activo o en
 * pausa) y solo con sesiones que programó este coach.
 */
export default async function CoachAthleteProgressPage({ params, searchParams }: PageProps<"/coach/progreso/[athleteId]">) {
  const [{ athleteId }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  const athlete = UUID_RE.test(athleteId) ? (await listCoachProgressAthletes(coach.id)).find((a) => a.athleteId === athleteId) : undefined;
  if (!athlete) notFound();

  const period = parsePeriod(query.periodo);
  const today = todayKey(APP_TIME_ZONE);
  const records = (await listCoachProgressRecords(coach.id, [athlete.athleteId])).get(athlete.athleteId) ?? [];
  const completed = records
    .map((r) => ({ r, day: finishedDay(r) }))
    .filter((x): x is { r: (typeof records)[number]; day: string } => x.day !== null)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 10);
  const hrefFor = (p: Period) => `/coach/progreso/${athlete.athleteId}?periodo=${p}`;
  const resultsHref = (sessionId: string) => `/coach/sesiones/${sessionId}/atletas/${athlete.athleteId}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href={`/coach/progreso?periodo=${period}`} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Progreso del equipo
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{athlete.name}</h1>
        {athlete.relationStatus === "paused" && (
          <div className="mt-2">
            <Badge tone="neutral" icon={<PauseCircle aria-hidden />}>
              En pausa
            </Badge>
          </div>
        )}
        <p className="mt-1 text-sm text-muted">Solo sesiones que tú programaste.</p>
      </header>

      <ScreenStates
        empty={{ title: "Sin sesiones asignadas", description: "Programa una sesión para este atleta para empezar a medir su progreso." }}
        loadingLabel="Cargando progreso…"
        loadingVariant="cards"
      >
        {records.length === 0 ? (
          <EmptyState title="Sin sesiones asignadas" description="Cuando le programes sesiones y las complete, aquí verás su adherencia, marcas y molestias." />
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <PeriodTabs value={period} hrefFor={hrefFor} />
              <ProgressOverview
                records={records}
                period={period}
                today={today}
                unit={coach.weightUnit}
                sessionHref={resultsHref}
                noCompletedState={<p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Aún no completa sesiones contigo.</p>}
              />
            </div>

            {completed.length > 0 && (
              <section aria-labelledby="planeado-realizado">
                <SectionHeader id="planeado-realizado" title="Planeado vs. realizado" />
                <p className="-mt-1 mb-3 text-sm text-muted">Últimas sesiones completadas. Abre una para ver cada serie frente a lo planeado.</p>
                <ul className="flex flex-col gap-2">
                  {completed.map(({ r, day }) => {
                    const s = summarize(r.snapshot, r.sets);
                    return (
                      <li key={r.sessionId}>
                        <Link
                          href={resultsHref(r.sessionId)}
                          className="group relative flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface p-4 pr-10 hover:border-muted/50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-ink">{r.title}</span>
                            <span className="block text-sm text-muted">
                              {formatKeyShort(day)}
                              {r.log?.rpe ? ` · RPE ${r.log.rpe}` : ""}
                              {r.discomforts.length > 0 ? ` · ${r.discomforts.length === 1 ? "1 molestia" : `${r.discomforts.length} molestias`}` : ""}
                            </span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-ink">
                            {s.done}/{s.total} series
                          </span>
                          <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </ScreenStates>
    </div>
  );
}
