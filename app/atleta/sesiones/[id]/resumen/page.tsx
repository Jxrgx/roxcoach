import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, ListChecks } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteExecution } from "@/lib/db/execution";
import { activeSeconds, summarize } from "@/lib/execution/progress";
import { formatKeyLong } from "@/lib/scheduling/dates";
import { formatClock } from "@/lib/utils/format";
import { DiscomfortList, ExecutionProgress, ExecutionResults } from "@/components/workouts/execution-results";
import { SessionFeedbackForm } from "@/components/athlete/session-feedback-form";
import { ReportDiscomfortButton } from "@/components/athlete/report-discomfort-button";
import { LocalLeftovers } from "@/components/athlete/local-leftovers";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Resumen" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El contenido depende de la sesión y de la URL: llega detrás de Suspense (fase 14). */
export default function SummaryPage({ params, searchParams }: PageProps<"/atleta/sesiones/[id]/resumen">) {
  return (
    <Suspense fallback={<DetailSkeleton label="Cargando resumen…" />}>
      <SummaryPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Resumen de una sesión finalizada: duración, series y planeado vs. realizado.
 * Nivel 1: enviar RPE general y comentario (lo único editable al terminar).
 */
async function SummaryPageContent({ params, searchParams }: { params: PageProps<"/atleta/sesiones/[id]/resumen">["params"]; searchParams: PageProps<"/atleta/sesiones/[id]/resumen">["searchParams"] }) {
  const [{ id }, query, athlete] = await Promise.all([params, searchParams, requireAthlete()]);
  const execution = UUID_RE.test(id) ? await findAthleteExecution(athlete.id, id) : null;
  if (!execution) notFound();
  if (!execution.log) redirect(`/atleta/sesiones/${id}`);
  if (execution.log.status !== "completada") redirect(`/atleta/sesiones/${id}/ejecutar`);

  const { log } = execution;
  const summary = summarize(execution.snapshot, execution.sets);
  const seconds = activeSeconds(log, log.finishedAt ?? new Date(0));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href={`/atleta/sesiones/${id}`} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Detalle de la sesión
      </Link>

      <header>
        {query.finalizada === "1" && (
          <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-positive/30 bg-positive/10 p-3.5 text-sm text-ink">
            <CheckCircle2 aria-hidden className="size-4 shrink-0 text-positive" />
            ¡Entrenamiento terminado! Tus resultados ya los ve tu coach.
          </p>
        )}
        <p className="text-sm font-medium text-muted">{formatKeyLong(execution.date)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Resumen: {execution.title}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              <Clock aria-hidden className="size-4" />
              Tiempo activo
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{formatClock(seconds)}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              <ListChecks aria-hidden className="size-4" />
              Series
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {summary.done}/{summary.total}
            </dd>
          </div>
        </dl>
      </header>

      <LocalLeftovers userId={athlete.id} sessionId={id} snapshot={execution.snapshot} unit={athlete.weightUnit} />

      <SessionFeedbackForm sessionId={id} initial={{ rpe: log.rpe ? String(log.rpe) : "", comment: log.comment ?? "" }} />

      <section aria-labelledby="molestias" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="molestias" className="text-lg font-semibold text-ink">
            Molestias
          </h2>
          <ReportDiscomfortButton sessionId={id} />
        </div>
        {execution.discomforts.length > 0 ? (
          <DiscomfortList items={execution.discomforts} />
        ) : (
          <p className="text-sm text-muted">No reportaste molestias en esta sesión.</p>
        )}
      </section>

      <section aria-labelledby="resultados" className="flex flex-col gap-3">
        <h2 id="resultados" className="text-lg font-semibold text-ink">
          Planeado vs. realizado
        </h2>
        <ExecutionProgress summary={summary} />
        <ExecutionResults summary={summary} unit={athlete.weightUnit} pendingLabel="No realizada" />
      </section>
    </div>
  );
}
