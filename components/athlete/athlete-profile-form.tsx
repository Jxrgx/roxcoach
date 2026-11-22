"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { AthleteProfileDTO } from "@/lib/db/profiles";
import { hasErrors, validateAthleteProfile, type AthleteProfileInput, type FieldErrors } from "@/lib/validations";
import { saveAthleteProfile } from "@/app/atleta/perfil/actions";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { SportsInfoFields } from "@/components/athlete/sports-info-fields";
import { FormSection } from "@/components/ui/form-controls";

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

  function patch(changes: Partial<AthleteProfileInput>) {
    setValues((prev) => ({ ...prev, ...changes }));
    if (phase === "saved" || phase === "error") setPhase("idle");
  }

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
      <SportsInfoFields
        values={values}
        errors={errors}
        onChange={patch}
        competitionExtra={
          <Input label="Nombre" value={values.name} onChange={(e) => update("name", e.target.value)} error={errors.name} autoComplete="name" />
        }
      />

      <FormSection id="preferencias" title="Preferencias">
        <Select label="Unidades de peso" value={values.weightUnit} onChange={(e) => update("weightUnit", e.target.value)} error={errors.weightUnit}>
          <option value="kg">Kilogramos (kg)</option>
          <option value="lb">Libras (lb)</option>
        </Select>
      </FormSection>

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
