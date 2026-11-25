"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { saveAthleteSportsInfo } from "@/app/coach/atletas/actions";
import { hasErrors, validateSportsInfo, type FieldErrors, type SportsInfoInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { SportsInfoFields } from "@/components/athlete/sports-info-fields";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";

/**
 * El coach edita la información deportiva de su atleta (misma validación que
 * el atleta). Con la relación en pausa se muestra en solo lectura.
 */
export function AthleteSportsForm({ athleteId, initial, editable }: { athleteId: string; initial: SportsInfoInput; editable: boolean }) {
  const [values, setValues] = useState<SportsInfoInput>(initial);
  const [savedRaceDate, setSavedRaceDate] = useState(initial.raceDate);
  const [errors, setErrors] = useState<FieldErrors<keyof SportsInfoInput>>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const toast = useToast();

  function patch(changes: Partial<SportsInfoInput>) {
    setValues((prev) => ({ ...prev, ...changes }));
    if (phase === "saved" || phase === "error") setPhase("idle");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSportsInfo(values, { today: todayKey(APP_TIME_ZONE), savedRaceDate });
    setErrors(found);
    if (hasErrors(found)) return;
    setPhase("saving");
    const result = await saveAthleteSportsInfo(athleteId, values);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      setPhase("error");
      toast.show({ tone: "error", title: "No se guardaron los cambios", description: result.message ?? "Revisa los campos marcados." });
      return;
    }
    setSavedRaceDate(values.raceDate);
    setPhase("saved");
    toast.show({ tone: "success", title: "Información deportiva actualizada" });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SportsInfoFields values={values} errors={errors} onChange={patch} audience="coach" disabled={!editable} />
      {editable && (
        <StickyActions>
          <p aria-live="polite" className="flex items-center justify-center gap-1.5 text-sm text-positive sm:mr-auto">
            {phase === "error" && <span className="text-danger">No se guardó. Los datos siguen aquí.</span>}
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
      )}
    </form>
  );
}
