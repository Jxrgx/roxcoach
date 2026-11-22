import type { BlockInput, TemplateInput } from "@/lib/validations";
import {
  loadForDisplay,
  loadToKg,
  parseDuration,
  type TargetTypeValue,
  type WeightUnit,
  type WorkoutIntensityValue,
} from "@/lib/workouts/rules";
import { formatClock } from "@/lib/utils/format";

/**
 * Conversión entre el formulario del constructor (texto, unidad del coach) y
 * los datos que se guardan (números, kg, segundos). Funciones puras; se
 * asume que la entrada ya pasó validateTemplate.
 */

export interface BlockExerciseWrite {
  exerciseId: string;
  sets: number;
  targetType: TargetTypeValue;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  loadKg: number | null;
  restSeconds: number | null;
  notes: string | null;
}

export interface TemplateWriteData {
  name: string;
  focus: string | null;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: { name: string; notes: string | null; exercises: BlockExerciseWrite[] }[];
}

export function toTemplateWriteData(input: TemplateInput, unit: WeightUnit): TemplateWriteData {
  return {
    name: input.name.trim(),
    focus: input.focus.trim() || null,
    intensity: input.intensity as WorkoutIntensityValue,
    estimatedMinutes: input.estimatedMinutes.trim() ? Number(input.estimatedMinutes.trim()) : null,
    blocks: input.blocks.map((b) => ({
      name: b.name.trim(),
      notes: b.notes.trim() || null,
      exercises: b.exercises.map((e) => {
        const targetType = e.targetType as TargetTypeValue;
        const load = e.load.trim() ? Number(e.load.trim().replace(",", ".")) : null;
        return {
          exerciseId: e.exerciseId,
          sets: Number(e.sets.trim()),
          targetType,
          reps: targetType === "reps" ? Number(e.target.trim()) : null,
          distanceMeters: targetType === "distance" ? Number(e.target.trim()) : null,
          durationSeconds: targetType === "time" ? parseDuration(e.target) : null,
          loadKg: load === null ? null : loadToKg(load, unit),
          restSeconds: e.rest.trim() ? parseDuration(e.rest) : null,
          notes: e.notes.trim() || null,
        };
      }),
    })),
  };
}

/** Datos guardados → formulario (para editar), en la unidad del coach. */
export interface StoredTemplateForForm {
  name: string;
  focus: string;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: {
    name: string;
    notes: string;
    exercises: (BlockExerciseWrite & { id: string })[];
  }[];
}

let keySeq = 0;
/** Clave local única para listas de React. */
export function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function toTemplateInput(t: StoredTemplateForForm, unit: WeightUnit): TemplateInput {
  return {
    name: t.name,
    focus: t.focus,
    intensity: t.intensity,
    estimatedMinutes: t.estimatedMinutes === null ? "" : String(t.estimatedMinutes),
    blocks: t.blocks.map<BlockInput>((b) => ({
      key: newKey("b"),
      name: b.name,
      notes: b.notes,
      exercises: b.exercises.map((e) => ({
        key: newKey("e"),
        exerciseId: e.exerciseId,
        sets: String(e.sets),
        targetType: e.targetType,
        target:
          e.targetType === "reps" ? String(e.reps ?? "") : e.targetType === "distance" ? String(e.distanceMeters ?? "") : formatClock(e.durationSeconds ?? 0),
        load: e.loadKg === null ? "" : String(loadForDisplay(e.loadKg, unit)),
        rest: e.restSeconds === null ? "" : formatClock(e.restSeconds),
        notes: e.notes ?? "",
      })),
    })),
  };
}

/** Valores iniciales al agregar un ejercicio (según su categoría). */
export function defaultExerciseInput(exerciseId: string, category: string): TemplateInput["blocks"][number]["exercises"][number] {
  const isRun = category === "carrera";
  return {
    key: newKey("e"),
    exerciseId,
    sets: isRun ? "1" : "3",
    targetType: isRun ? "distance" : "reps",
    target: isRun ? "1000" : "10",
    load: "",
    rest: "",
    notes: "",
  };
}

/** Información de cada ejercicio para mostrar en el constructor y la vista previa. */
export interface ExerciseInfo {
  name: string;
  category: string;
  archived: boolean;
}

/**
 * Formulario (aunque esté incompleto) → datos de vista previa. Los valores no
 * válidos se muestran tal cual se escribieron para que el coach los vea.
 */
export function inputToPreview(
  input: TemplateInput,
  unit: WeightUnit,
  info: ReadonlyMap<string, ExerciseInfo>,
): {
  name: string;
  focus: string;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: { key: string; name: string; notes: string; exercises: { key: string; name: string; prescription: string; notes: string; archived: boolean }[] }[];
} {
  const minutes = /^\d+$/.test(input.estimatedMinutes.trim()) ? Number(input.estimatedMinutes.trim()) : null;
  return {
    name: input.name.trim(),
    focus: input.focus.trim(),
    intensity: (["baja", "media", "alta"].includes(input.intensity) ? input.intensity : "media") as WorkoutIntensityValue,
    estimatedMinutes: minutes,
    blocks: input.blocks.map((b, i) => ({
      key: b.key,
      name: b.name.trim() || `Bloque ${i + 1}`,
      notes: b.notes.trim(),
      exercises: b.exercises.map((e) => {
        const ex = info.get(e.exerciseId);
        const sets = /^\d+$/.test(e.sets.trim()) ? e.sets.trim() : "?";
        const target =
          e.targetType === "reps" ? `${e.target.trim() || "?"} reps` : e.targetType === "distance" ? `${e.target.trim() || "?"} m` : e.target.trim() || "?";
        const parts = [`${sets} × ${target}`];
        if (e.load.trim()) parts.push(`${e.load.trim()} ${unit}`);
        if (e.rest.trim()) {
          const rest = parseDuration(e.rest);
          parts.push(`descanso ${rest !== null ? formatClock(rest) : e.rest.trim()}`);
        }
        return { key: e.key, name: ex?.name ?? "Ejercicio", prescription: parts.join(" · "), notes: e.notes.trim(), archived: ex?.archived ?? false };
      }),
    })),
  };
}
