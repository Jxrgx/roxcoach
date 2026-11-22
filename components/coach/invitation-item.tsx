"use client";

import { useState } from "react";
import { Clock, Mail, RefreshCw, XCircle } from "lucide-react";
import { cancelInvitationAction, regenerateInvitationLink } from "@/app/coach/atletas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { InvitationLinkPanel, type CreatedLink } from "@/components/coach/invite-athlete";
import type { OpenInvitationItem } from "@/lib/athletes/roster";

/** Invitación abierta con acciones: regenerar enlace y cancelar (con confirmación). */
export function InvitationItem({ invitation }: { invitation: OpenInvitationItem }) {
  const [busy, setBusy] = useState<"regenerate" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const toast = useToast();
  const expired = invitation.state === "expired";

  async function regenerate() {
    setBusy("regenerate");
    const result = await regenerateInvitationLink(invitation.id);
    setBusy(null);
    if (!result.ok) {
      toast.show({ tone: "error", title: "No se regeneró el enlace", description: result.message });
      return;
    }
    setCreated({ link: result.link, email: result.email, expiresAt: result.expiresAt });
  }

  async function cancel() {
    setBusy("cancel");
    const result = await cancelInvitationAction(invitation.id);
    setBusy(null);
    setConfirmCancel(false);
    toast.show(
      result.ok
        ? { tone: "success", title: "Invitación cancelada", description: "El enlace ya no funciona." }
        : { tone: "error", title: "No se canceló la invitación", description: result.message },
    );
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted">
          <Mail className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold break-all text-ink">{invitation.name || invitation.email}</h3>
            <Badge tone={expired ? "danger" : "warning"} icon={expired ? <XCircle aria-hidden /> : <Clock aria-hidden />}>
              {expired ? "Expirada" : "Pendiente"}
            </Badge>
          </div>
          {invitation.name && <p className="mt-0.5 text-sm break-all text-muted">{invitation.email}</p>}
          <p className="mt-0.5 text-sm text-muted">{invitation.expiresLabel}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          onClick={() => setConfirmCancel(true)}
          disabled={busy !== null}
          fullWidth
          className="sm:w-auto"
          aria-label={`Cancelar invitación de ${invitation.email}`}
        >
          Cancelar
        </Button>
        <Button
          variant="secondary"
          onClick={regenerate}
          loading={busy === "regenerate"}
          loadingLabel="Generando…"
          disabled={busy !== null}
          icon={<RefreshCw aria-hidden className="size-4" />}
          fullWidth
          className="sm:w-auto"
          aria-label={`Regenerar enlace de ${invitation.email}`}
        >
          Regenerar enlace
        </Button>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => busy === null && setConfirmCancel(false)}
        onConfirm={cancel}
        loading={busy === "cancel"}
        title="¿Cancelar invitación?"
        description={`El enlace enviado a ${invitation.email} dejará de funcionar. Podrás invitarlo de nuevo después.`}
        confirmLabel="Sí, cancelar invitación"
        cancelLabel="Volver"
      />
      <Modal
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Nuevo enlace listo"
        description="El enlace anterior ya no funciona. Comparte este en su lugar."
        footer={
          <Button variant="secondary" onClick={() => setCreated(null)} fullWidth className="sm:w-auto">
            Listo
          </Button>
        }
      >
        {created && <InvitationLinkPanel created={created} />}
      </Modal>
    </article>
  );
}
