import type { Metadata } from "next";
import { requireAthlete } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { Avatar } from "@/components/shared/avatar";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { AthleteProfileForm } from "@/components/athlete/athlete-profile-form";

export const metadata: Metadata = { title: "Perfil" };

export default async function AthleteProfilePage() {
  const athlete = await requireAthlete();
  return (
    <>
      <PageHeader title="Perfil" description="Mantén tus datos al día para que tu coach programe mejor." />
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={athlete.name} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{athlete.name}</p>
          <p className="truncate text-sm text-muted">{athlete.division || athlete.email}</p>
        </div>
      </div>
      <ScreenStates
        empty={{ title: "No encontramos tu perfil", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando perfil…"
      >
        <AthleteProfileForm profile={athlete} />
      </ScreenStates>
      <div className="mt-8 flex justify-center">
        <SignOutButton variant="ghost" />
      </div>
    </>
  );
}
