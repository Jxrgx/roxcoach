import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Clock, Gauge, ListChecks, MessageSquare } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findAthleteExecutionForCoach } from "@/lib/db/execution";
import { activeSeconds, summarize, type ExecutionStatus } from "@/lib/execution/progress";
import { formatKeyLong } from "@/lib/scheduling/dates";
import { formatClock } from "@/lib/utils/format";
import { EmptyState } from "@/components/ui/empty-state";
import { ExecutionStatusBadge } from "@/components/workouts/execution-status";
import { DiscomfortList, ExecutionProgress, ExecutionResults } from "@/components/workouts/execution-results";

export const metadata: Metadata = { title: "Resultados" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resultados de un atleta en una sesión del coach (solo lectura).
 * Primero lo que pide atención (molestias), luego RPE y comentario, y al
 * final el detalle planeado vs. realizado por bloque.
 */
export default async function AthleteResultsPage({ params }: PageProps<"/coach/sesiones/[id]/atletas/[athleteId]">) {
  const [{ id, athleteId }, coach] = await Promise.all([params, requireCoach()]);
  const execution = UUID_RE.test(id) && UUID_RE.test(athleteId) ? await findAthleteExecutionForCoach(coach.id, id, athleteId) : null;
  if (!execution) notFound();
  await connection();

  const { log } = execution;
  const status: ExecutionStatus = log?.status ?? "sin_iniciar";
  const summary = summarize(execution.snapshot, execution.sets);
  const seconds = log ? activeSeconds(log, new Date()) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href={`/coach/sesiones/${id}`} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {execution.title}
      </Link>

      <header>
        <p className="text-sm font-medium text-muted">{formatKeyLong(execution.date)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{execution.athleteName}</h1>
        <div className="mt-2">
          <ExecutionStatusBadge status={status} />
        </div>
      </header>

      {!log ? (
        <EmptyState title="Todavía no comienza esta sesión" description="Cuando el atleta la comience, aquí verás sus series, RPE y comentarios." />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
              <dt className="flex items-start gap-1.5 text-sm leading-snug text-muted">
                <Clock aria-hidden className="mt-0.5 hidden size-4 shrink-0 sm:block" />
                Tiempo activo
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-ink sm:text-2xl">{formatClock(seconds)}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
              <dt className="flex items-start gap-1.5 text-sm leading-snug text-muted">
                <ListChecks aria-hidden className="mt-0.5 hidden size-4 shrink-0 sm:block" />
                Series
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-ink sm:text-2xl">
                {summary.done}/{summary.total}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
              <dt className="flex items-start gap-1.5 text-sm leading-snug text-muted">
                <Gauge aria-hidden className="mt-0.5 hidden size-4 shrink-0 sm:block" />
                RPE
              </dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-ink sm:text-2xl">{log.rpe ?? "—"}</dd>
            </div>
          </dl>

          {execution.discomforts.length > 0 && (
            <section aria-labelledby="molestias" className="flex flex-col gap-2">
              <h2 id="molestias" className="text-lg font-semibold text-ink">
                Molestias reportadas
              </h2>
              <DiscomfortList items={execution.discomforts} />
            </section>
          )}

          <section aria-labelledby="comentario">
            <h2 id="comentario" className="mb-2 text-lg font-semibold text-ink">
              Comentario
            </h2>
            {log.comment ? (
              <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-sm whitespace-pre-line text-ink">
                <MessageSquare aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                {log.comment}
              </p>
            ) : (
              <p className="text-sm text-muted">{status === "completada" ? "Sin comentario." : "El atleta podrá dejar un comentario al finalizar."}</p>
            )}
          </section>

          <section aria-labelledby="resultados" className="flex flex-col gap-3">
            <h2 id="resultados" className="text-lg font-semibold text-ink">
              Planeado vs. realizado
            </h2>
            <ExecutionProgress summary={summary} />
            <ExecutionResults summary={summary} unit={coach.weightUnit} pendingLabel={status === "completada" ? "No realizada" : "Pendiente"} />
          </section>
        </>
      )}
    </div>
  );
}
