"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import { formatClock } from "@/lib/utils/format";
import { formatSetTarget, parseDuration, type TargetTypeValue, type WeightUnit } from "@/lib/workouts/rules";
import { initialSetInput } from "@/lib/execution/format";
import type { ActualSet } from "@/lib/execution/progress";
import { AMOUNT_LABEL, validateSetLog, type FieldErrors, type SetLogInput, type SetLogValue } from "@/lib/validations";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { RpePicker } from "@/components/athlete/rpe-picker";

export interface PlannedSetTarget {
  targetType: TargetTypeValue;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  loadKg: number | null;
}

export type SaveSetResult = { ok: true } | { ok: false; message: string };

interface SetLoggerProps {
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  /** Lo planeado (del snapshot): solo se muestra, nunca se modifica. */
  planned: PlannedSetTarget;
  unit: WeightUnit;
  /** Resultado ya registrado, para corregirlo. */
  initial?: ActualSet | null;
  /** Recibe lo validado y lo capturado (el servidor vuelve a validar). */
  onSave: (value: SetLogValue, input: SetLogInput) => Promise<SaveSetResult>;
  submitLabel?: string;
  /** Durante la ejecución: el botón queda fijo sobre la navegación inferior en mobile. */
  stickySubmit?: boolean;
}

function Stepper({
  label,
  unit,
  value,
  onChange,
  step,
  error,
  time = false,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  error?: string;
  /** Captura mm:ss; los botones suman o restan segundos. */
  time?: boolean;
}) {
  const id = useId();
  const current = time ? (parseDuration(value) ?? 0) : Number(value.replace(",", "."));
  const safe = Number.isFinite(current) ? current : 0;
  const bump = (delta: number) => {
    const next = Math.max(0, Math.round((safe + delta) * 100) / 100);
    onChange(time ? formatClock(next) : String(next));
  };
  const stepText = time ? `${step} segundos` : `${step} ${unit}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} <span className="font-normal text-muted">({unit})</span>
      </label>
      <div className="flex items-center gap-2">
        <IconButton label={`Restar ${stepText}`} icon={<Minus />} variant="secondary" onClick={() => bump(-step)} className="size-12" />
        <input
          id={id}
          inputMode={time ? "numeric" : "decimal"}
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
        <IconButton label={`Sumar ${stepText}`} icon={<Plus />} variant="secondary" onClick={() => bump(step)} className="size-12" />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const AMOUNT_UNIT: Record<TargetTypeValue, string> = { reps: "reps", distance: "m", time: "mm:ss" };
const AMOUNT_STEP: Record<TargetTypeValue, number> = { reps: 1, distance: 5, time: 5 };

/**
 * Registro de una serie. Lo planeado se muestra aparte y nunca se modifica;
 * el atleta confirma o ajusta lo realizado (prellenado con el plan). RPE opcional.
 */
export function SetLogger({ exerciseName, setNumber, totalSets, planned, unit, initial = null, onSave, submitLabel = "Completar serie", stickySubmit = false }: SetLoggerProps) {
  const [values, setValues] = useState<SetLogInput>(() => initialSetInput(planned, initial, unit));
  const [errors, setErrors] = useState<FieldErrors<keyof SetLogInput>>({});
  const [phase, setPhase] = useState<"editing" | "saving" | "saved" | "error">("editing");
  const [errorMessage, setErrorMessage] = useState("");
  const showLoad = planned.loadKg !== null || (initial?.actualLoadKg ?? null) !== null;

  const set = (key: keyof SetLogInput) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (phase === "saved" || phase === "error") setPhase("editing");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateSetLog(values, planned, unit);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPhase("saving");
    try {
      const saved = await onSave(result.value, values);
      if (saved.ok) setPhase("saved");
      else {
        setErrorMessage(saved.message);
        setPhase("error");
      }
    } catch {
      // Conserva lo capturado para reintentar sin perder datos.
      setErrorMessage("No se pudo guardar. Tus datos siguen aquí; intenta de nuevo.");
      setPhase("error");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label={`Registrar serie ${setNumber} de ${exerciseName}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-ink">{exerciseName}</h2>
        <p className="text-sm font-semibold tabular-nums text-acid">
          Serie {setNumber} de {totalSets}
        </p>
      </div>

      {/* Planeado: solo lectura, visualmente separado de lo realizado. */}
      <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
        <p className="text-sm font-medium text-muted">Planeado</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{formatSetTarget(planned, unit)}</p>
      </div>

      <p className="mt-5 text-sm font-medium text-muted">Realizado</p>
      <div className="mt-2 flex flex-col gap-4">
        <Stepper
          label={`${AMOUNT_LABEL[planned.targetType]} real`}
          unit={AMOUNT_UNIT[planned.targetType]}
          step={AMOUNT_STEP[planned.targetType]}
          time={planned.targetType === "time"}
          value={values.amount}
          onChange={set("amount")}
          error={errors.amount}
        />
        {showLoad && <Stepper label="Carga real" unit={unit} step={unit === "lb" ? 5 : 2.5} value={values.load} onChange={set("load")} error={errors.load} />}
        <RpePicker legend="Esfuerzo de la serie (RPE)" value={values.rpe} onChange={set("rpe")} error={errors.rpe} />
      </div>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm">
        {phase === "saved" && (
          <p className="flex items-center gap-1.5 text-positive">
            <CheckCircle2 aria-hidden className="size-4" /> Serie guardada.
          </p>
        )}
        {phase === "error" && <p className="text-danger">{errorMessage}</p>}
      </div>

      <div
        className={cn(
          "mt-2",
          stickySubmit &&
            "sticky bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+0.5rem)] z-10 -mx-1 rounded-2xl bg-surface/95 px-1 py-1 backdrop-blur md:static md:bg-transparent md:p-0 md:backdrop-blur-none",
        )}
      >
        <Button type="submit" size="lg" fullWidth loading={phase === "saving"} loadingLabel="Guardando serie…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
