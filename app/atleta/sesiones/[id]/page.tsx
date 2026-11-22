import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteSession } from "@/lib/db/sessions";
import { mondayOf } from "@/lib/scheduling/dates";
import { ScreenStates } from "@/components/shared/screen-states";
import { AthleteSessionDetail } from "@/components/athlete/athlete-session-detail";

export const metadata: Metadata = { title: "Sesión" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detalle de una sesión asignada (solo si el atleta tiene una asignación vigente). */
export default async function AthleteSessionPage({ params }: PageProps<"/atleta/sesiones/[id]">) {
  const [{ id }, athlete] = await Promise.all([params, requireAthlete()]);
  const session = UUID_RE.test(id) ? await findAthleteSession(athlete.id, id) : null;
  if (!session) notFound();

  return (
    <>
      <Link href={`/atleta/agenda?semana=${mondayOf(session.date)}`} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Agenda
      </Link>
      <ScreenStates
        empty={{ title: "No encontramos esta sesión", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando sesión…"
      >
        <AthleteSessionDetail session={session} unit={athlete.weightUnit} />
      </ScreenStates>
    </>
  );
}
