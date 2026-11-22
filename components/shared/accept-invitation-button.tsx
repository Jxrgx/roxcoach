"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { acceptInvitationAction } from "@/app/invitacion/[token]/actions";
import { Button } from "@/components/ui/button";

const REASON_MESSAGES: Record<string, string> = {
  expired: "La invitación venció. Pide a tu coach un enlace nuevo.",
  cancelled: "Tu coach canceló esta invitación.",
  "already-accepted": "Esta invitación ya fue utilizada.",
  "email-mismatch": "Esta invitación es para otro correo.",
  "has-other-coach": "Ya entrenas con otro coach.",
  "not-athlete": "Esta invitación es para cuentas de atleta.",
  invalid: "La invitación no es válida.",
  error: "No pudimos aceptar la invitación. Revisa tu conexión e inténtalo de nuevo.",
};

/** Acción principal de la invitación: aceptar y unirse al equipo. */
export function AcceptInvitationButton({ token, coachName }: { token: string; coachName: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
          {message}
        </p>
      )}
      <Button
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Uniéndote…"
        icon={<Check aria-hidden className="size-5" />}
        onClick={() =>
          startTransition(async () => {
            // Si se acepta, la acción redirige al perfil y no regresa.
            const result = await acceptInvitationAction(token);
            setMessage(REASON_MESSAGES[result.reason] ?? REASON_MESSAGES.error!);
          })
        }
      >
        Unirme al equipo de {coachName}
      </Button>
    </div>
  );
}
