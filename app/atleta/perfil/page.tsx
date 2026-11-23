import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteCoach } from "@/lib/db/athletes";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { Avatar } from "@/components/shared/avatar";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { AthleteProfileForm } from "@/components/athlete/athlete-profile-form";
import { CoachRelationCard } from "@/components/athlete/coach-relation-card";

export const metadata: Metadata = { title: "Perfil" };

export default async function AthleteProfilePage({ searchParams }: PageProps<"/atleta/perfil">) {
  const athlete = await requireAthlete();
  const [coach, query] = await Promise.all([findAthleteCoach(athlete.id), searchParams]);
  const welcome = query.bienvenida === "1" && coach !== null;

  return (
    <>
      <PageHeader title="Perfil" description="Mantén tus datos al día para que tu coach programe mejor." />

      {welcome && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-positive/30 bg-positive/10 p-4">
          <PartyPopper aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" />
          <div>
            <p className="font-semibold text-ink">Ya estás en el equipo de {coach.coachName}</p>
            <p className="mt-0.5 text-sm text-muted">Completa tu información deportiva para que pueda programar tus entrenamientos.</p>
          </div>
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <Avatar name={athlete.name} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{athlete.name}</p>
          <p className="truncate text-sm text-muted">{athlete.division || athlete.email}</p>
        </div>
      </div>

      <div className="mb-5">
        <CoachRelationCard coach={coach ? { coachName: coach.coachName, gymName: coach.gymName, status: coach.status } : null} />
      </div>

      <ScreenStates
        empty={{ title: "No encontramos tu perfil", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando perfil…"
      >
        <AthleteProfileForm profile={athlete} />
      </ScreenStates>
      <div className="mt-8 flex justify-center">
        <SignOutButton variant="ghost" userId={athlete.id} />
      </div>
    </>
  );
}
