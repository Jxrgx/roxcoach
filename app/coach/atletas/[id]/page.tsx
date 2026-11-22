import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, PauseCircle } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findCoachAthlete } from "@/lib/db/athletes";
import { coachCanEditAthlete } from "@/lib/invitations/rules";
import { APP_TIME_ZONE, formatShortDate } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { Avatar } from "@/components/shared/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RelationActions } from "@/components/coach/relation-actions";
import { AthleteSportsForm } from "@/components/coach/athlete-sports-form";

export const metadata: Metadata = { title: "Atleta" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CoachAthleteDetailPage({ params }: PageProps<"/coach/atletas/[id]">) {
  const { id } = await params;
  const coach = await requireCoach();
  // Un atleta ajeno (o un id inválido) se ve exactamente igual que uno inexistente.
  const athlete = UUID_RE.test(id) ? await findCoachAthlete(coach.id, id) : null;
  if (!athlete) notFound();

  const paused = athlete.status === "paused";
  const editable = coachCanEditAthlete(athlete.status);

  return (
    <>
      <Link href="/coach/atletas" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Atletas
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Avatar name={athlete.name} size="sm" />
            <Badge tone={paused ? "neutral" : "positive"}>{paused ? "En pausa" : "Activo"}</Badge>
          </span>
        }
        title={athlete.name}
        description={`${athlete.division || "División sin definir"} · En tu equipo desde ${formatShortDate(new Date(athlete.joinedAt), APP_TIME_ZONE)}`}
        action={<RelationActions athleteId={athlete.athleteId} athleteName={athlete.name} status={athlete.status} />}
      />

      <ScreenStates
        empty={{ title: "No encontramos la información de este atleta", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando atleta…"
      >
        {paused && (
          <div role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-ink">
            <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
            <p>
              La relación está en pausa
              {athlete.pausedAt ? ` desde el ${formatShortDate(new Date(athlete.pausedAt), APP_TIME_ZONE)}` : ""}. Reactívala para
              editar su información.
            </p>
          </div>
        )}

        <Card className="mb-4">
          <h2 className="text-base font-semibold text-ink">Contacto</h2>
          <a
            href={`mailto:${athlete.email}`}
            className="mt-2 inline-flex min-h-11 items-center gap-2 break-all text-electric hover:underline"
          >
            <Mail aria-hidden className="size-4 shrink-0" />
            {athlete.email}
          </a>
        </Card>

        <AthleteSportsForm
          athleteId={athlete.athleteId}
          editable={editable}
          initial={{
            division: athlete.division,
            raceDate: athlete.raceDate,
            availableDays: athlete.availableDays,
            equipment: athlete.equipment,
          }}
        />
      </ScreenStates>
    </>
  );
}
