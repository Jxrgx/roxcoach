import { formatClock, normalizeSearch } from "@/lib/utils/format";

/**
 * Constructor de plantillas: catálogos, unidades, formato de prescripciones,
 * reordenamiento y requisitos para publicar (funciones puras).
 */

export const WORKOUT_INTENSITIES = ["baja", "media", "alta"] as const;
export type WorkoutIntensityValue = (typeof WORKOUT_INTENSITIES)[number];

export const TEMPLATE_STATUSES = ["borrador", "publicada", "archivada"] as const;
export type TemplateStatusValue = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_STATUS_LABEL: Record<TemplateStatusValue, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  archivada: "Archivada",
};

export const TARGET_TYPES = ["reps", "distance", "time"] as const;
export type TargetTypeValue = (typeof TARGET_TYPES)[number];

export const TARGET_LABEL: Record<TargetTypeValue, string> = {
  reps: "Repeticiones",
  distance: "Distancia (m)",
  time: "Tiempo (mm:ss)",
};

export const MAX_BLOCKS = 20;
export const MAX_EXERCISES_PER_BLOCK = 30;

/* ---------- Unidades (la carga se guarda en kg) ---------- */

export type WeightUnit = "kg" | "lb";
const LB_PER_KG = 2.2046226218;

/** Carga guardada (kg) → número a mostrar en la unidad del coach (1 decimal). */
export function loadForDisplay(loadKg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? loadKg * LB_PER_KG : loadKg;
  return Math.round(value * 10) / 10;
}

/** Número capturado en la unidad del coach → kg (2 decimales). */
export function loadToKg(value: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? value / LB_PER_KG : value;
  return Math.round(kg * 100) / 100;
}

/* ---------- Tiempo ---------- */

/**
 * "1:30" → 90, "90" → 90, "01:00:00" → 3600. null si no es válido.
 * Acepta segundos solos o mm:ss / h:mm:ss.
 */
export function parseDuration(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [a = 0, b = 0, c = 0] = nums;
  if (parts.length === 2) return b < 60 ? a * 60 + b : null;
  return b < 60 && c < 60 ? a * 3600 + b * 60 + c : null;
}

/* ---------- Prescripción legible ---------- */

export interface PrescriptionData {
  sets: number;
  targetType: TargetTypeValue;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  loadKg: number | null;
  restSeconds: number | null;
}

function formatDistance(m: number): string {
  return m >= 1000 && m % 100 === 0 ? `${(m / 1000).toLocaleString("es-MX")} km` : `${m.toLocaleString("es-MX")} m`;
}

/** "4 × 1 km · descanso 1:30", "3 × 10 reps · 24 kg", "2 × 1:00". */
export function formatPrescription(p: PrescriptionData, unit: WeightUnit = "kg"): string {
  const target =
    p.targetType === "reps"
      ? `${p.reps ?? 0} reps`
      : p.targetType === "distance"
        ? formatDistance(p.distanceMeters ?? 0)
        : formatClock(p.durationSeconds ?? 0);
  const parts = [`${p.sets} × ${target}`];
  if (p.loadKg !== null) parts.push(`${loadForDisplay(p.loadKg, unit).toLocaleString("es-MX")} ${unit}`);
  if (p.restSeconds) parts.push(`descanso ${formatClock(p.restSeconds)}`);
  return parts.join(" · ");
}

/* ---------- Orden ---------- */

/** Mueve un elemento `delta` posiciones (devuelve un arreglo nuevo). */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

/* ---------- Publicación ---------- */

export interface PublishCheckInput {
  estimatedMinutes: number | null;
  blocks: { name: string; exerciseCount: number }[];
}

/** Lo que le falta a una plantilla para poder publicarse (vacío = lista). */
export function publishProblems(t: PublishCheckInput): string[] {
  const problems: string[] = [];
  if (t.estimatedMinutes === null) problems.push("Indica la duración estimada.");
  if (t.blocks.length === 0) problems.push("Agrega al menos un bloque.");
  t.blocks.forEach((b, i) => {
    if (b.exerciseCount === 0) problems.push(`El bloque ${i + 1}${b.name ? ` (${b.name})` : ""} no tiene ejercicios.`);
  });
  return problems;
}

/** Transiciones de estado desde el detalle. */
export function canPublish(status: TemplateStatusValue): boolean {
  return status === "borrador";
}
export function canUnpublish(status: TemplateStatusValue): boolean {
  return status === "publicada";
}
export function canArchive(status: TemplateStatusValue): boolean {
  return status !== "archivada";
}
export function canEditTemplate(status: TemplateStatusValue): boolean {
  return status !== "archivada";
}

/* ---------- Lista ---------- */

export type TemplateFilter = "activas" | "publicada" | "borrador" | "archivada";

/** "activas" = todo menos archivadas. Busca por nombre o enfoque, sin acentos. */
export function filterTemplates<T extends { name: string; focus: string; status: TemplateStatusValue }>(
  items: T[],
  query: string,
  filter: TemplateFilter,
): T[] {
  const q = normalizeSearch(query);
  return items.filter(
    (t) => (filter === "activas" ? t.status !== "archivada" : t.status === filter) && (q === "" || normalizeSearch(`${t.name} ${t.focus}`).includes(q)),
  );
}

