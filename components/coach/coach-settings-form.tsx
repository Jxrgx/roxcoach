"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import type { CoachProfileDTO } from "@/lib/db/profiles";
import { saveCoachSettings } from "@/app/coach/configuracion/actions";
import { hasErrors, validateCoachSettings, type CoachSettingsInput, type FieldErrors } from "@/lib/validations";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { SignOutButton } from "@/components/shared/sign-out-button";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id}>
      <h2 id={id} className="text-base font-semibold text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

export function CoachSettingsForm({ coach }: { coach: CoachProfileDTO }) {
  const [values, setValues] = useState<CoachSettingsInput & { weightUnit: string; distanceUnit: string }>({
    name: coach.name,
    gym: coach.gymName,
    weightUnit: coach.weightUnit,
    distanceUnit: coach.distanceUnit,
  });
  const [errors, setErrors] = useState<FieldErrors<keyof CoachSettingsInput>>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const update = (key: keyof typeof values) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (phase === "saved" || phase === "error") setPhase("idle");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateCoachSettings(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setPhase("saving");
    const result = await saveCoachSettings(values);
    if (!result.ok) {
      // Conserva lo capturado y muestra los errores del servidor.
      if (result.errors) setErrors(result.errors);
      setPhase("error");
      toast.show({ tone: "error", title: "No se guardaron los cambios", description: result.message ?? "Revisa los campos marcados." });
      return;
    }
    setPhase("saved");
    toast.show({ tone: "success", title: "Cambios guardados" });
  }

  async function deleteAccount() {
    setDeleting(true);
    await new Promise((r) => setTimeout(r, 800));
    setDeleting(false);
    setConfirmDelete(false);
    toast.show({ tone: "info", title: "Aún no disponible", description: "La eliminación de cuenta llegará en un módulo posterior. No se eliminó nada." });
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section id="perfil" title="Perfil del coach">
            <Input label="Nombre" value={values.name} onChange={(e) => update("name")(e.target.value)} error={errors.name} autoComplete="name" />
            <Input label="Correo" type="email" value={coach.email} disabled hint="Es el correo con el que inicias sesión." />
          </Section>

          <Section id="gimnasio" title="Gimnasio">
            <Input label="Nombre del gimnasio" value={values.gym} onChange={(e) => update("gym")(e.target.value)} error={errors.gym} autoComplete="organization" />
          </Section>

          <Section id="unidades" title="Unidades" description="Se usan al programar cargas y distancias.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Peso" value={values.weightUnit} onChange={(e) => update("weightUnit")(e.target.value)}>
                <option value="kg">Kilogramos (kg)</option>
                <option value="lb">Libras (lb)</option>
              </Select>
              <Select label="Distancia" value={values.distanceUnit} onChange={(e) => update("distanceUnit")(e.target.value)}>
                <option value="km">Kilómetros (km)</option>
                <option value="mi">Millas (mi)</option>
              </Select>
            </div>
          </Section>

          <Section id="visual" title="Preferencias visuales">
            <Select label="Tema" value="oscuro" disabled hint="RoxCoach usa tema oscuro. Las animaciones se reducen si tu sistema lo pide.">
              <option value="oscuro">Oscuro</option>
            </Select>
          </Section>
        </div>

        <StickyActions>
          <p aria-live="polite" className="flex items-center justify-center gap-1.5 text-sm text-positive sm:mr-auto">
            {phase === "error" && <span className="text-danger">No se guardó. Tus datos siguen aquí.</span>}
            {phase === "saved" && (
              <>
                <CheckCircle2 aria-hidden className="size-4" /> Guardado
              </>
            )}
          </p>
          <Button type="submit" size="lg" loading={phase === "saving"} fullWidth className="sm:w-auto">
            Guardar cambios
          </Button>
        </StickyActions>
      </form>

      <section aria-labelledby="cuenta" className="mt-8">
        <Card>
          <h2 id="cuenta" className="text-base font-semibold text-ink">
            Cuenta
          </h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SignOutButton className="w-full sm:w-auto" />
            <Button variant="danger" onClick={() => setConfirmDelete(true)} fullWidth className="sm:w-auto">
              Eliminar cuenta
            </Button>
          </div>
        </Card>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        onConfirm={deleteAccount}
        loading={deleting}
        title="¿Eliminar tu cuenta?"
        description="Se borrarán tus plantillas, sesiones y el acceso de tus atletas. Esta acción no se puede deshacer."
        confirmLabel="Sí, eliminar cuenta"
      />
    </>
  );
}
