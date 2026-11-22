import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Dumbbell, UserX } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";
import { viewInvitation } from "@/lib/db/invitations";
import { maskEmail, type AcceptBlock } from "@/lib/invitations/rules";
import { AuthLayout } from "@/components/shared/auth-layout";
import { AcceptInvitationButton } from "@/components/shared/accept-invitation-button";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { StateMessage, type StateTone } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "Invitación",
  // El enlace contiene un token: no indexar ni enviarlo como referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const BLOCKED: Record<AcceptBlock, { title: string; description: string; tone: StateTone; icon: ReactNode }> = {
  invalid: { title: "Invitación no válida", description: "Revisa que el enlace esté completo o pide uno nuevo a tu coach.", tone: "danger", icon: <AlertTriangle /> },
  expired: { title: "Esta invitación venció", description: "Pide a tu coach que regenere el enlace.", tone: "warning", icon: <Clock /> },
  cancelled: { title: "Esta invitación fue cancelada", description: "Si crees que es un error, pide a tu coach una invitación nueva.", tone: "warning", icon: <UserX /> },
  "already-accepted": { title: "Esta invitación ya se utilizó", description: "Cada enlace sirve una sola vez. Si necesitas unirte, pide uno nuevo a tu coach.", tone: "neutral", icon: <CheckCircle2 /> },
  "not-athlete": { title: "Esta invitación es para atletas", description: "Estás usando una cuenta de coach. Cierra sesión y entra con la cuenta del atleta invitado.", tone: "info", icon: <UserX /> },
  "email-mismatch": { title: "Esta invitación es para otro correo", description: "", tone: "info", icon: <UserX /> },
  "has-other-coach": { title: "Ya entrenas con otro coach", description: "Por ahora solo puedes tener un coach. Pide a tu coach actual que te desvincule para aceptar esta invitación.", tone: "info", icon: <Dumbbell /> },
};

function Footer() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center font-medium text-electric hover:underline">
      Ir a RoxCoach
    </Link>
  );
}

async function InvitationContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const profile = await getCurrentProfile();
  const view = await viewInvitation(token, profile ? { id: profile.id, role: profile.role, email: profile.email } : null);

  if (!view) {
    const b = BLOCKED.invalid;
    return (
      <AuthLayout title="Invitación" description="Únete al equipo de tu coach en RoxCoach." footer={<Footer />}>
        <StateMessage role="alert" tone={b.tone} icon={b.icon} title={b.title} description={b.description} />
      </AuthLayout>
    );
  }

  const gym = view.gymName ? ` · ${view.gymName}` : "";
  const title = `${view.coachName} te invita a entrenar`;
  const description = `Únete a su equipo en RoxCoach${gym}.`;
  const { decision } = view;

  if (decision.type === "blocked") {
    const b = BLOCKED[decision.reason];
    const desc =
      decision.reason === "email-mismatch"
        ? `Fue enviada a ${maskEmail(view.email)}. Cierra sesión y entra con esa cuenta.`
        : b.description;
    return (
      <AuthLayout title={title} description={description} footer={<Footer />}>
        <StateMessage
          role="alert"
          tone={b.tone}
          icon={b.icon}
          title={b.title}
          description={desc}
          action={decision.reason === "email-mismatch" || decision.reason === "not-athlete" ? <SignOutButton /> : undefined}
        />
      </AuthLayout>
    );
  }

  if (decision.type === "accepted") {
    return (
      <AuthLayout title={title} description={description} footer={<Footer />}>
        <StateMessage
          tone="info"
          icon={<CheckCircle2 />}
          title={`Ya formas parte del equipo de ${view.coachName}`}
          action={<ButtonLink href="/atleta/inicio">Ir a mi inicio</ButtonLink>}
        />
      </AuthLayout>
    );
  }

  const next = `/invitacion/${token}`;
  return (
    <AuthLayout title={title} description={description} footer={<Footer />}>
      <p className="mb-5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-muted">
        Invitación para <strong className="font-semibold text-ink">{maskEmail(view.email)}</strong>
        {view.name ? ` (${view.name})` : ""}. Al unirte, tu coach podrá ver tu información deportiva y programar tus entrenamientos.
      </p>
      {decision.type === "can-accept" ? (
        <AcceptInvitationButton token={token} coachName={view.coachName} />
      ) : (
        <div className="flex flex-col gap-3">
          <ButtonLink href={`/registro?rol=athlete&next=${encodeURIComponent(next)}`} size="lg" fullWidth>
            Crear cuenta de atleta
          </ButtonLink>
          <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg" variant="secondary" fullWidth>
            Ya tengo cuenta
          </ButtonLink>
          <p className="text-center text-sm text-muted">Usa el correo al que llegó esta invitación.</p>
        </div>
      )}
    </AuthLayout>
  );
}

export default function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <Suspense
      fallback={
        <AuthLayout title="Invitación" description="Únete al equipo de tu coach en RoxCoach." footer={null}>
          <LoadingState label="Cargando invitación…" rows={1} />
        </AuthLayout>
      }
    >
      <InvitationContent params={params} />
    </Suspense>
  );
}
