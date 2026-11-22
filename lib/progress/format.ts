import { formatClock } from "@/lib/utils/format";
import { loadForDisplay, type WeightUnit } from "@/lib/workouts/rules";
import type { MetricKind } from "@/lib/progress/metrics";

/** Valor de una métrica en la unidad del usuario: "152 kg", "20 reps", "1 km", "01:30". */
export function formatMetric(kind: MetricKind, value: number, unit: WeightUnit): string {
  if (kind === "load") return `${loadForDisplay(value, unit).toLocaleString("es-MX")} ${unit}`;
  if (kind === "reps") return `${value.toLocaleString("es-MX")} reps`;
  if (kind === "distance") return value >= 1000 && value % 100 === 0 ? `${(value / 1000).toLocaleString("es-MX")} km` : `${value.toLocaleString("es-MX")} m`;
  return formatClock(value);
}

/** Cambio con signo: "+10 kg", "−2 reps", "Sin cambio". */
export function formatChange(kind: MetricKind, change: number, unit: WeightUnit): string {
  if (change === 0) return "Sin cambio";
  const sign = change > 0 ? "+" : "−";
  return `${sign}${formatMetric(kind, Math.abs(change), unit)}`;
}

/** "3 h 05 min", "45 min". */
export function formatTotalTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export const sessionsLabel = (n: number) => `${n} ${n === 1 ? "sesión" : "sesiones"}`;
