import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { requireCoach } from "@/lib/auth/session";
import { listCoachAthletes } from "@/lib/db/athletes";
import { listOpenInvitations } from "@/lib/db/invitations";
import { daysLeft } from "@/lib/invitations/rules";
import { APP_TIME_ZONE, formatShortDate } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { AthleteRoster } from "@/components/coach/athlete-roster";
import type { OpenInvitationItem, RosterItem } from "@/lib/athletes/roster";
import { InviteAthleteButton } from "@/components/coach/invite-athlete";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Atletas" };

function expiresLabel(state: string, expiresAt: Date, now: Date): string {
  if (state === "expired") return "Venció. Regenera el enlace para volver a invitar.";
  const days = daysLeft(expiresAt, now);
  return days <= 1 ? "Vence hoy" : `Vence en ${days} días`;
}

/** Datos de la pantalla, una vez por petición (los comparten el resumen y la lista). */
const loadRoster = cache(async () => {
  const coach = await requireCoach();
  const [athletes, invitations] = await Promise.all([listCoachAthletes(coach.id), listOpenInvitations(coach.id)]);
  const now = new Date();

  const roster: RosterItem[] = athletes.map((a) => ({
    athleteId: a.athleteId,
    name: a.name,
    email: a.email,
    division: a.division,
    status: a.status,
    joinedLabel: `En tu equipo desde ${formatShortDate(new Date(a.joinedAt), APP_TIME_ZONE)}`,
  }));
  const openInvitations: OpenInvitationItem[] = invitations
    .filter((i): i is typeof i & { state: "pending" | "expired" } => i.state === "pending" || i.state === "expired")
    .map((i) => ({ id: i.id, email: i.email, name: i.name, state: i.state, expiresLabel: expiresLabel(i.state, new Date(i.expiresAt), now) }));
  const active = athletes.filter((a) => a.status === "active").length;
  return { roster, openInvitations, active };
});

/** La estructura (título y acción) aparece al instante; el resumen y la lista llegan con los datos. */
export default function AthletesPage() {
  return (
    <>
      <PageHeader
        title="Atletas"
        description={
          <Suspense fallback={<InlineSkeleton />}>
            <RosterSummary />
          </Suspense>
        }
        action={<InviteAthleteButton fullWidth className="sm:w-auto" />}
      />
      <Suspense fallback={<ContentSkeleton label="Cargando atletas…" variant="cards" />}>
        <RosterContent />
      </Suspense>
    </>
  );
}

async function RosterSummary() {
  const { roster, openInvitations, active } = await loadRoster();
  if (roster.length === 0) return <>Invita a tus atletas con un enlace personal.</>;
  const pending = openInvitations.length;
  return (
    <>
      {active} {active === 1 ? "atleta activo" : "atletas activos"}
      {pending ? ` · ${pending} ${pending === 1 ? "invitación pendiente" : "invitaciones pendientes"}` : ""}.
    </>
  );
}

async function RosterContent() {
  const { roster, openInvitations } = await loadRoster();
  return (
    <ScreenStates
      empty={{
        title: "Todavía no tienes atletas registrados",
        description: "Invita a tu primer atleta con un enlace personal.",
        action: <InviteAthleteButton />,
      }}
      loadingLabel="Cargando atletas…"
      loadingVariant="cards"
    >
      <AthleteRoster athletes={roster} invitations={openInvitations} />
    </ScreenStates>
  );
}
