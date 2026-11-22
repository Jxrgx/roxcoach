"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import type { PlannedSet } from "@/lib/types/domain";
import { validateSetResult, type SetResult, type SetResultInput, type FieldErrors } from "@/lib/validations";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

interface SetLoggerProps {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  planned: PlannedSet;
  /** Persiste el resultado real. En esta fase lo resuelve el llamador (mock). */
  onSave: (result: SetResult) => Promise<void>;
}

function Stepper({
  label,
  unit,
  value,
  onChange,
  step,
  error,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  error?: string;
}) {
  const id = useId();
  const n = Number(value.replace(",", "."));
  const safe = Number.isFinite(n) ? n : 0;
  const bump = (delta: number) => onChange(String(Math.max(0, Math.round((safe + delta) * 100) / 100)));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} <span className="font-normal text-muted">({unit})</span>
      </label>
      <div className="flex items-center gap-2">
        <IconButton label={`Restar ${step} ${unit}`} icon={<Minus />} variant="secondary" onClick={() => bump(-step)} className="size-12" />
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "min-h-12 w-full min-w-0 rounded-xl border bg-surface px-3 text-center text-2xl font-bold tabular-nums text-ink",
            error ? "border-danger" : "border-line",
          )}
        />
        <IconButton label={`Sumar ${step} ${unit}`} icon={<Plus />} variant="secondary" onClick={() => bump(step)} className="size-12" />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Registro de una serie. Lo planeado se muestra aparte y nunca se modifica;
 * el atleta solo confirma o ajusta lo realizado. RPE opcional.
 */
export function SetLogger({ exerciseName, setNumber, totalSets, planned, onSave }: SetLoggerProps) {
  const usesDistance = planned.distanceMeters !== undefined;
  const amountLabel = usesDistance ? "Distancia" : "Repeticiones";
  const requiresLoad = planned.loadKg !== undefined;

  const [values, setValues] = useState<SetResultInput>({
    load: planned.loadKg !== undefined ? String(planned.loadKg) : "",
    amount: String(usesDistance ? planned.distanceMeters : (planned.reps ?? "")),
    rpe: "",
  });
  const [errors, setErrors] = useState<FieldErrors<keyof SetResultInput>>({});
  const [phase, setPhase] = useState<"editing" | "saving" | "saved" | "error">("editing");
  const rpeName = useId();

  const set = (key: keyof SetResultInput) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (phase === "saved" || phase === "error") setPhase("editing");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateSetResult(values, { requiresLoad, amountLabel });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPhase("saving");
    try {
      await onSave(result.value);
      setPhase("saved");
    } catch {
      // Conserva lo capturado para reintentar sin perder datos.
      setPhase("error");
    }
  }

  const plannedParts = [
    planned.loadKg !== undefined && `${planned.loadKg} kg`,
    planned.distanceMeters !== undefined && `${planned.distanceMeters} m`,
    planned.reps !== undefined && `${planned.reps} reps`,
  ].filter(Boolean);

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-surface p-5" aria-label={`Registrar serie ${setNumber} de ${exerciseName}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">{exerciseName}</h3>
        <p className="text-sm font-semibold tabular-nums text-acid">
          Serie {setNumber} de {totalSets}
        </p>
      </div>

      {/* Planeado: solo lectura, visualmente separado de lo realizado. */}
      <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Planeado</p>
        <p className="mt-0.5 font-semibold tabular-nums text-ink">{plannedParts.join(" · ")}</p>
      </div>

      <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Realizado</p>
      <div className="mt-2 flex flex-col gap-4">
        {requiresLoad && <Stepper label="Carga real" unit="kg" step={2.5} value={values.load} onChange={set("load")} error={errors.load} />}
        <Stepper
          label={`${amountLabel} real`}
          unit={usesDistance ? "m" : "reps"}
          step={usesDistance ? 5 : 1}
          value={values.amount}
          onChange={set("amount")}
          error={errors.amount}
        />
        <fieldset>
          <legend className="text-sm font-medium text-ink">
            Esfuerzo percibido (RPE) <span className="font-normal text-muted">(opcional)</span>
          </legend>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((v) => (
              <label key={v} className="relative">
                <input
                  type="radio"
                  name={rpeName}
                  value={v}
                  checked={values.rpe === v}
                  onChange={() => set("rpe")(v)}
                  onClick={() => values.rpe === v && set("rpe")("")}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 font-semibold tabular-nums text-ink peer-checked:border-electric peer-checked:bg-electric/15 peer-focus-visible:outline-2 peer-focus-visible:outline-electric">
                  {v}
                </span>
              </label>
            ))}
          </div>
          {errors.rpe && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {errors.rpe}
            </p>
          )}
        </fieldset>
      </div>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm">
        {phase === "saved" && (
          <p className="flex items-center gap-1.5 text-positive">
            <CheckCircle2 aria-hidden className="size-4" /> Serie guardada.
          </p>
        )}
        {phase === "error" && <p className="text-danger">No se pudo guardar. Tus datos siguen aquí; intenta de nuevo.</p>}
      </div>

      <Button type="submit" size="lg" fullWidth className="mt-2" loading={phase === "saving"} loadingLabel="Guardando serie…">
        {phase === "saved" ? "Guardar cambios" : "Guardar serie"}
      </Button>
    </form>
  );
}
