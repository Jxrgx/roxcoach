import { formatClock } from "@/lib/utils/format";
import { loadForDisplay, type TargetTypeValue, type WeightUnit } from "@/lib/workouts/rules";
import type { ActualSet } from "@/lib/execution/progress";

/** Resultado real legible: "48 m · 150 kg · RPE 8". */
export function formatActualSet(a: ActualSet, unit: WeightUnit = "kg"): string {
  const parts: string[] = [];
  if (a.actualReps !== null) parts.push(`${a.actualReps} reps`);
  if (a.actualDistanceMeters !== null) parts.push(`${a.actualDistanceMeters.toLocaleString("es-MX")} m`);
  if (a.actualDurationSeconds !== null) parts.push(formatClock(a.actualDurationSeconds));
  if (a.actualLoadKg !== null) parts.push(`${loadForDisplay(a.actualLoadKg, unit).toLocaleString("es-MX")} ${unit}`);
  if (a.rpe !== null) parts.push(`RPE ${a.rpe}`);
  return parts.join(" · ");
}

/** Valores iniciales del registro: lo ya realizado (corrección) o lo planeado. */
export function initialSetInput(
  planned: { targetType: TargetTypeValue; reps: number | null; distanceMeters: number | null; durationSeconds: number | null; loadKg: number | null },
  actual: ActualSet | null,
  unit: WeightUnit,
): { amount: string; load: string; rpe: string } {
  const amount = actual
    ? (planned.targetType === "reps" ? actual.actualReps : planned.targetType === "distance" ? actual.actualDistanceMeters : actual.actualDurationSeconds)
    : planned.targetType === "reps"
      ? planned.reps
      : planned.targetType === "distance"
        ? planned.distanceMeters
        : planned.durationSeconds;
  const loadKg = actual ? actual.actualLoadKg : planned.loadKg;
  return {
    amount: amount === null ? "" : planned.targetType === "time" ? formatClock(amount) : String(amount),
    load: loadKg === null ? "" : String(loadForDisplay(loadKg, unit)),
    rpe: actual?.rpe ? String(actual.rpe) : "",
  };
}
