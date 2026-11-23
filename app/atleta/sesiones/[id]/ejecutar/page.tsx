import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteExecution } from "@/lib/db/execution";
import { ExecutionScreen } from "@/components/athlete/execution-screen";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Entrenando" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El contenido depende de la sesión y de la URL: llega detrás de Suspense (fase 14). */
export default function ExecutePage({ params }: PageProps<"/atleta/sesiones/[id]/ejecutar">) {
  return (
    <Suspense fallback={<DetailSkeleton label="Cargando entrenamiento…" />}>
      <ExecutePageContent params={params} />
    </Suspense>
  );
}

/**
 * Ejecución de una sesión comenzada. Sin comenzar → detalle (donde está
 * "Comenzar"); completada → resumen. El progreso vive en el servidor, así que
 * recargar o volver más tarde continúa donde se quedó.
 */
async function ExecutePageContent({ params }: { params: PageProps<"/atleta/sesiones/[id]/ejecutar">["params"] }) {
  const [{ id }, athlete] = await Promise.all([params, requireAthlete()]);
  const execution = UUID_RE.test(id) ? await findAthleteExecution(athlete.id, id) : null;
  if (!execution) notFound();
  if (!execution.log) redirect(`/atleta/sesiones/${id}`);
  if (execution.log.status === "completada") redirect(`/atleta/sesiones/${id}/resumen`);
  await connection();
  // Hora del servidor en esta petición (dinámica tras connection()).
  const serverNow = new Date().getTime();

  return (
    <>
      <Link href={`/atleta/sesiones/${id}`} className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Detalle de la sesión
      </Link>
      <ExecutionScreen
        sessionId={execution.sessionId}
        userId={athlete.id}
        title={execution.title}
        snapshot={execution.snapshot}
        unit={athlete.weightUnit}
        log={{ startedAt: execution.log.startedAt, pausedAt: execution.log.pausedAt, pausedSeconds: execution.log.pausedSeconds }}
        sets={execution.sets}
        serverNow={serverNow}
      />
    </>
  );
}
