"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { EQUIPMENT_OPTIONS, HYROX_DIVISIONS, WEEKDAYS, type FieldErrors, type SportsInfoInput } from "@/lib/validations";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

export function FormSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
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
export function ToggleChip({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={cn("relative", disabled && "pointer-events-none opacity-60")}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
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

interface SportsInfoFieldsProps {
  values: SportsInfoInput;
  errors: FieldErrors<keyof SportsInfoInput>;
  /** Recibe solo los campos que cambiaron. */
  onChange: (patch: Partial<SportsInfoInput>) => void;
  /** Encabezado de la primera sección (p. ej. para incluir el nombre). */
  competitionExtra?: ReactNode;
  /** Texto en tercera persona cuando edita el coach. */
  audience?: "athlete" | "coach";
  disabled?: boolean;
}

/**
 * Información deportiva compartida por el perfil del atleta y el detalle del
 * atleta en el panel del coach (misma validación: validateSportsInfo).
 */
export function SportsInfoFields({ values, errors, onChange, competitionExtra, audience = "athlete", disabled }: SportsInfoFieldsProps) {
  const toggle = (key: "availableDays" | "equipment", item: string) => {
    const list = values[key];
    onChange({ [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item] });
  };
  const coach = audience === "coach";

  return (
    <>
      <FormSection id="datos" title="Datos de competencia">
        {competitionExtra}
        <Select
          label="División HYROX"
          value={values.division}
          onChange={(e) => onChange({ division: e.target.value })}
          error={errors.division}
          disabled={disabled}
        >
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
          onChange={(e) => onChange({ raceDate: e.target.value })}
          error={errors.raceDate}
          optional
          disabled={disabled}
        />
      </FormSection>

      <FormSection
        id="dias"
        title="Días disponibles"
        description={coach ? "Días en que el atleta puede entrenar." : "Tu coach programará según estos días."}
      >
        <fieldset>
          <legend className="sr-only">Días disponibles para entrenar</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <ToggleChip key={d} label={d} checked={values.availableDays.includes(d)} onChange={() => toggle("availableDays", d)} disabled={disabled} />
            ))}
          </div>
          {errors.availableDays && <p role="alert" className="mt-1.5 text-sm text-danger">{errors.availableDays}</p>}
        </fieldset>
      </FormSection>

      <FormSection
        id="equipo"
        title="Equipo disponible"
        description={coach ? "Equipo con el que cuenta el atleta." : "Así tu coach sabe qué sustituir si falta algo."}
      >
        <fieldset>
          <legend className="sr-only">Equipo disponible</legend>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <ToggleChip key={item} label={item} checked={values.equipment.includes(item)} onChange={() => toggle("equipment", item)} disabled={disabled} />
            ))}
          </div>
          {errors.equipment && <p role="alert" className="mt-1.5 text-sm text-danger">{errors.equipment}</p>}
        </fieldset>
      </FormSection>
    </>
  );
}
