"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import type { AthleteProfileDTO } from "@/lib/db/profiles";
import {
  EQUIPMENT_OPTIONS,
  HYROX_DIVISIONS,
  WEEKDAYS,
  hasErrors,
  validateAthleteProfile,
  type AthleteProfileInput,
  type FieldErrors,
} from "@/lib/validations";
import { saveAthleteProfile } from "@/app/atleta/perfil/actions";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";

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

/** Opción seleccionable tipo "chip" con área táctil de 44 px y estado no solo por color. */
function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="relative">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-sm transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-electric",
          checked ? "border-electric bg-electric/15 font-semibold text-ink" : "border-line bg-surface-2 text-muted",
        )}
      >
        {checked && <Check aria-hidden className="size-4" />}
        {label}
      </span>
    </label>
  );
}

export function AthleteProfileForm({ profile }: { profile: AthleteProfileDTO }) {
  const [values, setValues] = useState<AthleteProfileInput>({
    name: profile.name,
    division: profile.division,
    raceDate: profile.raceDate,
    availableDays: profile.availableDays,
    equipment: profile.equipment,
    weightUnit: profile.weightUnit,
  });
  const [errors, setErrors] = useState<FieldErrors<keyof AthleteProfileInput>>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const toast = useToast();

  function update<K extends keyof AthleteProfileInput>(key: K, value: AthleteProfileInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (phase === "saved" || phase === "error") setPhase("idle");
  }

  const toggle = (key: "availableDays" | "equipment", item: string) => {
    const list = values[key];
    update(key, list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateAthleteProfile(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setPhase("saving");
    const result = await saveAthleteProfile(values);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      setPhase("error");
      toast.show({ tone: "error", title: "No se guardó tu perfil", description: result.message ?? "Revisa los campos marcados." });
      return;
    }
    setPhase("saved");
    toast.show({ tone: "success", title: "Perfil actualizado" });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Section id="datos" title="Datos de competencia">
        <Input label="Nombre" value={values.name} onChange={(e) => update("name", e.target.value)} error={errors.name} autoComplete="name" />
        <Select label="División HYROX" value={values.division} onChange={(e) => update("division", e.target.value)} error={errors.division}>
          <option value="">Sin definir</option>
          {HYROX_DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Input
          label="Fecha de competencia"
          type="date"
          value={values.raceDate}
          onChange={(e) => update("raceDate", e.target.value)}
          error={errors.raceDate}
          optional
        />
      </Section>

      <Section id="dias" title="Días disponibles" description="Tu coach programará según estos días.">
        <fieldset>
          <legend className="sr-only">Días disponibles para entrenar</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <ToggleChip key={d} label={d} checked={values.availableDays.includes(d)} onChange={() => toggle("availableDays", d)} />
            ))}
          </div>
          {errors.availableDays && <p role="alert" className="mt-1.5 text-sm text-danger">{errors.availableDays}</p>}
        </fieldset>
      </Section>

      <Section id="equipo" title="Equipo disponible" description="Así tu coach sabe qué sustituir si falta algo.">
        <fieldset>
          <legend className="sr-only">Equipo disponible</legend>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <ToggleChip key={item} label={item} checked={values.equipment.includes(item)} onChange={() => toggle("equipment", item)} />
            ))}
          </div>
          {errors.equipment && <p role="alert" className="mt-1.5 text-sm text-danger">{errors.equipment}</p>}
        </fieldset>
      </Section>

      <Section id="preferencias" title="Preferencias">
        <Select label="Unidades de peso" value={values.weightUnit} onChange={(e) => update("weightUnit", e.target.value)} error={errors.weightUnit}>
          <option value="kg">Kilogramos (kg)</option>
          <option value="lb">Libras (lb)</option>
        </Select>
      </Section>

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
  );
}
