"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { inviteAthlete } from "@/app/coach/atletas/actions";
import { hasErrors, validateInvitation, type FieldErrors, type InvitationInput } from "@/lib/validations";
import { formatShortDate } from "@/lib/utils/format";
import { Modal } from "@/components/ui/modal";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CopyLink } from "@/components/shared/copy-link";

export interface CreatedLink {
  link: string;
  email: string;
  expiresAt: string;
}

/** Enlace recién creado o regenerado. Solo se muestra una vez (no se guarda en claro). */
export function InvitationLinkPanel({ created }: { created: CreatedLink }) {
  return (
    <div className="flex flex-col gap-4">
      <CopyLink link={created.link} />
      <div className="flex gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-electric" />
        <p className="text-muted">
          Solo funciona para <strong className="font-semibold text-ink">{created.email}</strong> y vence el{" "}
          <strong className="font-semibold text-ink">{formatShortDate(new Date(created.expiresAt))}</strong>. Por seguridad no
          podrás volver a ver este enlace; si lo pierdes, regénéralo.
        </p>
      </div>
    </div>
  );
}

const EMPTY: InvitationInput = { email: "", name: "" };

/** Botón "Invitar atleta" con su modal (formulario → enlace para compartir). */
export function InviteAthleteButton({ variant = "primary", fullWidth, className }: { variant?: ButtonVariant; fullWidth?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<InvitationInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<keyof InvitationInput>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setMessage(null);
    setCreated(null);
  }

  function close() {
    if (saving) return;
    setOpen(false);
    reset();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateInvitation(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    setMessage(null);
    const result = await inviteAthlete(values);
    setSaving(false);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      if (result.message) setMessage(result.message);
      return;
    }
    setCreated({ link: result.link, email: result.email, expiresAt: result.expiresAt });
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        fullWidth={fullWidth}
        className={className}
        icon={<UserPlus aria-hidden className="size-5" />}
        aria-haspopup="dialog"
      >
        Invitar atleta
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={created ? "Invitación lista" : "Invitar atleta"}
        description={created ? "Copia el enlace y compártelo con tu atleta (WhatsApp, correo…)." : "Crea un enlace personal para que tu atleta se una a tu equipo."}
        footer={
          created ? (
            <>
              <Button variant="ghost" onClick={reset} fullWidth className="sm:w-auto">
                Invitar a otro
              </Button>
              <Button variant="secondary" onClick={close} fullWidth className="sm:w-auto">
                Listo
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={saving} fullWidth className="sm:w-auto">
                Cancelar
              </Button>
              <Button type="submit" form="invite-athlete-form" loading={saving} loadingLabel="Creando…" fullWidth className="sm:w-auto">
                Crear invitación
              </Button>
            </>
          )
        }
      >
        {created ? (
          <InvitationLinkPanel created={created} />
        ) : (
          <form id="invite-athlete-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
            {message && (
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
                {message}
              </p>
            )}
            <Input
              label="Correo del atleta"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              error={errors.email}
              hint="Solo una cuenta con este correo podrá aceptar."
            />
            <Input
              label="Nombre"
              optional
              autoComplete="off"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              error={errors.name}
              hint="Te ayuda a reconocer la invitación en tu lista."
            />
          </form>
        )}
      </Modal>
    </>
  );
}
