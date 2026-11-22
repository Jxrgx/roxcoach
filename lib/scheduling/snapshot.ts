import { formatPrescription, type TargetTypeValue, type WeightUnit, type WorkoutIntensityValue } from "@/lib/workouts/rules";

/**
 * Snapshot de una sesión programada: copia congelada de la plantilla al
 * programar. Es la fuente de verdad de lo PLANEADO para la sesión; editar o
 * archivar la plantilla después no lo cambia. Versionado para poder evolucionar.
 */

export interface SnapshotExercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string[];
  sets: number;
  targetType: TargetTypeValue;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  loadKg: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface SnapshotBlock {
  name: string;
  notes: string | null;
  exercises: SnapshotExercise[];
}

export interface SessionSnapshotV1 {
  version: 1;
  templateName: string;
  focus: string | null;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: SnapshotBlock[];
}

/** Datos mínimos de una plantilla para congelarla. */
export interface TemplateForSnapshot {
  name: string;
  focus: string;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: {
    name: string;
    notes: string;
    exercises: (Omit<SnapshotExercise, "name" | "category" | "equipment"> & { exerciseName: string; category: string; equipment: string[] })[];
  }[];
}

export function buildSnapshot(t: TemplateForSnapshot): SessionSnapshotV1 {
  return {
    version: 1,
    templateName: t.name,
    focus: t.focus || null,
    intensity: t.intensity,
    estimatedMinutes: t.estimatedMinutes,
    blocks: t.blocks.map((b) => ({
      name: b.name,
      notes: b.notes || null,
      exercises: b.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.exerciseName,
        category: e.category,
        equipment: [...e.equipment],
        sets: e.sets,
        targetType: e.targetType,
        reps: e.reps,
        distanceMeters: e.distanceMeters,
        durationSeconds: e.durationSeconds,
        loadKg: e.loadKg,
        restSeconds: e.restSeconds,
        notes: e.notes,
      })),
    })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Lee un snapshot guardado y lo valida en tiempo de ejecución (null si no es válido). */
export function parseSnapshot(value: unknown): SessionSnapshotV1 | null {
  if (!isObj(value) || value.version !== 1 || typeof value.templateName !== "string" || !Array.isArray(value.blocks)) return null;
  if (!["baja", "media", "alta"].includes(value.intensity as string) || !numOrNull(value.estimatedMinutes) || !strOrNull(value.focus)) return null;
  for (const b of value.blocks) {
    if (!isObj(b) || typeof b.name !== "string" || !strOrNull(b.notes) || !Array.isArray(b.exercises)) return null;
    for (const e of b.exercises) {
      if (
        !isObj(e) ||
        typeof e.exerciseId !== "string" ||
        typeof e.name !== "string" ||
        typeof e.category !== "string" ||
        !Array.isArray(e.equipment) ||
        typeof e.sets !== "number" ||
        !["reps", "distance", "time"].includes(e.targetType as string) ||
        !numOrNull(e.reps) ||
        !numOrNull(e.distanceMeters) ||
        !numOrNull(e.durationSeconds) ||
        !numOrNull(e.loadKg) ||
        !numOrNull(e.restSeconds) ||
        !strOrNull(e.notes)
      ) {
        return null;
      }
    }
  }
  return value as unknown as SessionSnapshotV1;
}

/** Equipo necesario para la sesión (sin repetidos, en orden de aparición). */
export function snapshotEquipment(s: SessionSnapshotV1): string[] {
  return [...new Set(s.blocks.flatMap((b) => b.exercises.flatMap((e) => e.equipment)))];
}

export function snapshotExerciseCount(s: SessionSnapshotV1): number {
  return s.blocks.reduce((n, b) => n + b.exercises.length, 0);
}

/** Snapshot → datos de TemplatePreview (prescripciones en la unidad indicada). */
export function snapshotToPreview(s: SessionSnapshotV1, title: string, unit: WeightUnit) {
  return {
    name: title,
    focus: s.focus ?? "",
    intensity: s.intensity,
    estimatedMinutes: s.estimatedMinutes,
    blocks: s.blocks.map((b, i) => ({
      key: `b${i}`,
      name: b.name,
      notes: b.notes ?? "",
      exercises: b.exercises.map((e, j) => ({
        key: `b${i}e${j}`,
        name: e.name,
        prescription: formatPrescription(e, unit),
        notes: e.notes ?? "",
      })),
    })),
  };
}
