"use client";

import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { mockTemplates } from "@/lib/mock/workouts";
import { hasErrors, validateNewSession, type FieldErrors, type NewSessionInput } from "@/lib/validations";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const Ctx = createContext<(() => void) | null>(null);

const EMPTY: NewSessionInput = { name: "", templateId: "", date: "" };

/**
 * Modal de "Nueva sesión" accesible desde cualquier pantalla del coach.
 * Vista previa: valida y simula el guardado; no persiste datos todavía.
 */
export function NewSessionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<NewSessionInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<keyof NewSessionInput>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const close = () => {
    if (saving) return;
    setOpen(false);
    setErrors({});
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateNewSession(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    setSaving(false);
    setOpen(false);
    setValues(EMPTY);
    toast.show({
      tone: "success",
      title: "Sesión creada",
      description: "Vista previa: los datos aún no se guardan en el servidor.",
    });
  }

  const update = (key: keyof NewSessionInput) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Ctx value={() => setOpen(true)}>
      {children}
      <Modal
        open={open}
        onClose={close}
        title="Nueva sesión"
        description="Parte de una plantilla para programar más rápido."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={saving} fullWidth className="sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" form="new-session-form" loading={saving} fullWidth className="sm:w-auto">
              Crear sesión
            </Button>
          </>
        }
      >
        <form id="new-session-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Input
            label="Nombre de la sesión"
            placeholder="Ej. Engine + Sled Push"
            value={values.name}
            onChange={(e) => update("name")(e.target.value)}
            error={errors.name}
            autoComplete="off"
          />
          <Select
            label="Plantilla"
            value={values.templateId}
            onChange={(e) => update("templateId")(e.target.value)}
            error={errors.templateId}
          >
            <option value="">Elige una opción</option>
            <option value="blank">Sesión en blanco</option>
            {mockTemplates
              .filter((t) => t.status === "publicada")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
          <Input
            label="Fecha"
            type="date"
            value={values.date}
            onChange={(e) => update("date")(e.target.value)}
            error={errors.date}
          />
          <p className="text-sm text-muted">Podrás asignar atletas después de crearla.</p>
        </form>
      </Modal>
    </Ctx>
  );
}

export function useNewSession() {
  const open = useContext(Ctx);
  if (!open) throw new Error("useNewSession debe usarse dentro de <NewSessionProvider>.");
  return open;
}

/** Botón de acción principal del coach. */
export function NewSessionButton({
  fullWidth,
  className,
  variant = "primary",
}: {
  fullWidth?: boolean;
  className?: string;
  /** "secondary" para el CTA global de la barra lateral, que no compite con la acción de la página. */
  variant?: "primary" | "secondary";
}) {
  const open = useNewSession();
  return (
    <Button
      onClick={open}
      variant={variant}
      fullWidth={fullWidth}
      className={className}
      icon={<Plus aria-hidden className="size-5" />}
    >
      Nueva sesión
    </Button>
  );
}
