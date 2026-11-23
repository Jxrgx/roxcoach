import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, StickyNote, XCircle } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findCoachSession, listAssignableAthletes } from "@/lib/db/sessions";
import { addDaysKey, formatKeyLong, mondayOf, todayKey } from "@/lib/scheduling/dates";
import { snapshotToPreview } from "@/lib/scheduling/snapshot";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { Badge } from "@/components/ui/badge";
import { TemplatePreview } from "@/components/workouts/template-preview";
import { SessionAthletes, SessionHeaderActions } from "@/components/coach/session-manage";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Sesión" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El detalle depende de la URL y de la sesión: todo llega detrás de Suspense con la forma de la pantalla. */
export default function CoachSessionPage(props: PageProps<"/coach/sesiones/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl">
          <DetailSkeleton label="Cargando sesión…" />
        </div>
      }
    >
      <CoachSessionContent {...props} />
    </Suspense>
  );
}

async function CoachSessionContent({ params, searchParams }: PageProps<"/coach/sesiones/[id]">) {
  const [{ id }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  // Una sesión de otro coach (o un id inválido) se ve igual que una inexistente.
  const session = UUID_RE.test(id) ? await findCoachSession(coach.id, id) : null;
  if (!session) notFound();

  const today = todayKey(APP_TIME_ZONE);
  const cancelled = session.status === "cancelada";
  const assignedIds = new Set(session.athletes.map((a) => a.athleteId));
  const assignable = cancelled ? [] : (await listAssignableAthletes(coach.id)).filter((a) => !assignedIds.has(a.athleteId));
  const weekLink = `/coach/calendario?semana=${mondayOf(session.date)}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={weekLink} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Calendario
      </Link>

      {query.creada === "1" && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-positive/30 bg-positive/10 p-3.5 text-sm text-ink">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-positive" />
          Sesión programada. Tus atletas ya la ven en su agenda.
        </p>
      )}

      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
            <CalendarDays aria-hidden className="size-4" />
            {formatKeyLong(session.date)}
            {session.startTime ? ` · ${session.startTime}` : ""}
            {cancelled && (
              <Badge tone="danger" icon={<XCircle aria-hidden />}>
                Cancelada
              </Badge>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{session.title}</h1>
          {session.snapshot.templateName && session.snapshot.templateName !== session.title && (
            <p className="mt-1 text-sm text-muted">Plantilla: {session.snapshot.templateName}</p>
          )}
        </div>
        {!cancelled && (
          <SessionHeaderActions
            sessionId={session.id}
            title={session.title}
            today={today}
            maxDate={addDaysKey(today, 366)}
            details={{ date: session.date < today ? today : session.date, time: session.startTime ?? "", title: session.title, notes: session.notes }}
          />
        )}
      </header>

      {/* Fuera de ScreenStates: componentes con estado local (modales). */}
      <div className="mb-6">
        <SessionAthletes sessionId={session.id} assigned={session.athletes} assignable={assignable} editable={!cancelled} />
      </div>

      <ScreenStates empty={{ title: "No encontramos esta sesión", description: "Recarga la página para intentarlo de nuevo." }} loadingLabel="Cargando sesión…">
        {session.notes && (
          <p className="mb-4 flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-sm whitespace-pre-line text-ink">
            <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              <span className="sr-only">Notas: </span>
              {session.notes}
            </span>
          </p>
        )}

        <section aria-labelledby="sesion-congelada">
          <h2 id="sesion-congelada" className="sr-only">
            Sesión congelada
          </h2>
          <p className="mb-3 text-sm text-muted">Así quedó la plantilla al programarla (los cambios posteriores en la plantilla no la afectan).</p>
          <TemplatePreview data={snapshotToPreview(session.snapshot, session.title, coach.weightUnit)} />
        </section>
      </ScreenStates>
    </div>
  );
}
