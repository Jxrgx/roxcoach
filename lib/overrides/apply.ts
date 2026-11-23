import type { SessionSnapshotV1, SnapshotBlock, SnapshotExercise } from "@/lib/scheduling/snapshot";
import { formatPrescription, formatSetTarget, loadForDisplay, loadToKg, parseDuration, type TargetTypeValue, type WeightUnit } from "@/lib/workouts/rules";
import { formatClock } from "@/lib/utils/format";

/**
 * Personalización por atleta (funciones puras).
 * El snapshot de la sesión NUNCA se modifica: `applyOverrides` devuelve un
 * plan efectivo nuevo con la versión del atleta, y conserva el original de
 * cada ejercicio como referencia (plan original vs. ajuste vs. realizado).
 */

/** Un ajuste ya validado (lo que se guarda en assignment_overrides). */
export interface OverrideRow {
  blockIndex: number;
  exerciseIndex: number;
  skipped: boolean;
  sets: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  loadKg: number | null;
  removeLoad: boolean;
  restSeconds: number | null;
  note: string | null;
  replacement: { exerciseId: string | null; name: string; category: string; equipment: string[] } | null;
}

/** Ejercicio del plan efectivo: los valores del atleta + el original. */
export interface EffectiveExercise extends SnapshotExercise {
  /** Tiene algún ajuste (valor, sustitución, nota u omisión). */
  adapted: boolean;
  skipped: boolean;
  replaced: boolean;
  /** Nota del coach para este atleta. */
  athleteNote: string | null;
  original: SnapshotExercise;
}

export interface EffectiveBlock extends Omit<SnapshotBlock, "exercises"> {
  exercises: EffectiveExercise[];
}

export interface EffectivePlan extends Omit<SessionSnapshotV1, "blocks"> {
  blocks: EffectiveBlock[];
  /** Hay al menos un ajuste para este atleta. */
  personalized: boolean;
}

const positionKey = (b: number, e: number) => `${b}.${e}`;

/** Aplica los ajustes de UNA asignación sobre una copia del snapshot. */
export function applyOverrides(snapshot: SessionSnapshotV1, overrides: OverrideRow[]): EffectivePlan {
  const byPosition = new Map(overrides.map((o) => [positionKey(o.blockIndex, o.exerciseIndex), o]));
  let personalized = false;
  const blocks = snapshot.blocks.map((b, bi) => ({
    ...b,
    exercises: b.exercises.map((ex, ei): EffectiveExercise => {
      const original = structuredClone(ex);
      const o = byPosition.get(positionKey(bi, ei));
      if (!o) return { ...structuredClone(ex), adapted: false, skipped: false, replaced: false, athleteNote: null, original };
      personalized = true;
      return {
        ...structuredClone(ex),
        exerciseId: o.replacement ? (o.replacement.exerciseId ?? ex.exerciseId) : ex.exerciseId,
        name: o.replacement?.name ?? ex.name,
        category: o.replacement?.category ?? ex.category,
        equipment: o.replacement ? [...o.replacement.equipment] : [...ex.equipment],
        sets: o.sets ?? ex.sets,
        // El tipo de objetivo no cambia: solo se ajusta su valor.
        reps: ex.targetType === "reps" ? (o.reps ?? ex.reps) : ex.reps,
        distanceMeters: ex.targetType === "distance" ? (o.distanceMeters ?? ex.distanceMeters) : ex.distanceMeters,
        durationSeconds: ex.targetType === "time" ? (o.durationSeconds ?? ex.durationSeconds) : ex.durationSeconds,
        loadKg: o.removeLoad ? null : (o.loadKg ?? ex.loadKg),
        restSeconds: o.restSeconds ?? ex.restSeconds,
        adapted: true,
        skipped: o.skipped,
        replaced: o.replacement !== null,
        athleteNote: o.note,
        original,
      };
    }),
  }));
  return { ...snapshot, blocks, personalized };
}

export interface OverrideChange {
  label: string;
  from: string;
  to: string;
}

/** Cambios legibles de un ejercicio (para el resumen antes de guardar y los resultados). */
export function describeChanges(e: EffectiveExercise, unit: WeightUnit): OverrideChange[] {
  if (!e.adapted) return [];
  const o = e.original;
  const changes: OverrideChange[] = [];
  if (e.skipped) changes.push({ label: "Ejercicio", from: o.name, to: "Ejercicio omitido" });
  if (e.replaced) changes.push({ label: "Sustitución", from: o.name, to: e.name });
  if (e.sets !== o.sets) changes.push({ label: "Series", from: String(o.sets), to: String(e.sets) });
  const target = (x: SnapshotExercise) => formatSetTarget({ ...x, loadKg: null }, unit);
  if (target(e) !== target(o)) changes.push({ label: "Objetivo", from: target(o), to: target(e) });
  const load = (kg: number | null) => (kg === null ? "Sin carga" : `${loadForDisplay(kg, unit).toLocaleString("es-MX")} ${unit}`);
  if (e.loadKg !== o.loadKg) changes.push({ label: "Carga", from: load(o.loadKg), to: load(e.loadKg) });
  const rest = (s: number | null) => (s ? formatClock(s) : "Sin descanso");
  if (e.restSeconds !== o.restSeconds) changes.push({ label: "Descanso", from: rest(o.restSeconds), to: rest(e.restSeconds) });
  if (e.athleteNote) changes.push({ label: "Nota", from: "—", to: e.athleteNote });
  return changes;
}

/* ---------- Formulario del coach ---------- */

/** Lo que el coach captura por ejercicio (texto de los campos). */
export interface OverrideFormItem {
  blockIndex: number;
  exerciseIndex: number;
  skipped: boolean;
  sets: string;
  /** Repeticiones, metros o tiempo según el objetivo original. */
  target: string;
  /** En la unidad del coach. */
  load: string;
  removeLoad: boolean;
  rest: string;
  note: string;
  /** "" = sin sustitución. */
  replacementId: string;
}

export interface ReplacementOption {
  id: string;
  name: string;
  category: string;
  equipment: string[];
}

const intOrNull = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw.trim() === "" ? null : Number.NaN);
const decimalOrNull = (raw: string) => {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

const targetOf = (ex: SnapshotExercise, t: TargetTypeValue) => (t === "reps" ? ex.reps : t === "distance" ? ex.distanceMeters : ex.durationSeconds);

/** Valores iniciales del formulario: el ajuste guardado o, si no hay, el plan original. */
export function formItemFor(ex: SnapshotExercise, blockIndex: number, exerciseIndex: number, row: OverrideRow | null, unit: WeightUnit): OverrideFormItem {
  const target = row ? (ex.targetType === "reps" ? row.reps : ex.targetType === "distance" ? row.distanceMeters : row.durationSeconds) : null;
  const shownTarget = target ?? targetOf(ex, ex.targetType);
  const loadKg = row?.removeLoad ? null : (row?.loadKg ?? ex.loadKg);
  return {
    blockIndex,
    exerciseIndex,
    skipped: row?.skipped ?? false,
    sets: String(row?.sets ?? ex.sets),
    target: shownTarget === null ? "" : ex.targetType === "time" ? formatClock(shownTarget) : String(shownTarget),
    load: loadKg === null ? "" : String(loadForDisplay(loadKg, unit)),
    removeLoad: row?.removeLoad ?? false,
    rest: row?.restSeconds != null ? formatClock(row.restSeconds) : ex.restSeconds ? formatClock(ex.restSeconds) : "",
    note: row?.note ?? "",
    replacementId: row?.replacement?.exerciseId ?? "",
  };
}

export type OverrideFieldErrors = Record<string, string>;

/**
 * Valida el formulario contra el snapshot y los reemplazos autorizados.
 * Un valor igual al original NO se guarda como ajuste (así "personalizada"
 * significa que realmente cambió algo). Un ejercicio sin cambios no genera fila
 * (equivale a "Restaurar original").
 */
export function validateOverrideForm(
  items: OverrideFormItem[],
  snapshot: SessionSnapshotV1,
  unit: WeightUnit,
  replacements: ReadonlyMap<string, ReplacementOption>,
): { ok: true; rows: OverrideRow[] } | { ok: false; errors: OverrideFieldErrors } {
  const errors: OverrideFieldErrors = {};
  const rows: OverrideRow[] = [];
  const seen = new Set<string>();
  const maxLoad = unit === "lb" ? 1100 : 500;

  for (const it of items) {
    const key = positionKey(it.blockIndex, it.exerciseIndex);
    const ex = snapshot.blocks[it.blockIndex]?.exercises[it.exerciseIndex];
    if (!ex || seen.has(key)) {
      errors[`${key}.item`] = "Este ejercicio no existe en la sesión.";
      continue;
    }
    seen.add(key);

    const sets = intOrNull(it.sets);
    if (sets === null || Number.isNaN(sets) || sets < 1 || sets > 50) errors[`${key}.sets`] = "Entre 1 y 50 series.";

    let target: number | null = null;
    if (ex.targetType === "time") {
      target = it.target.trim() === "" ? null : parseDuration(it.target);
      if (target === null || target < 1 || target > 36000) errors[`${key}.target`] = "Tiempo en mm:ss (por ejemplo 1:30).";
    } else {
      target = intOrNull(it.target);
      const max = ex.targetType === "reps" ? 1000 : 100000;
      if (target === null || Number.isNaN(target) || target < 1 || target > max)
        errors[`${key}.target`] = ex.targetType === "reps" ? "Entre 1 y 1000 repeticiones." : "Distancia en metros (1 a 100 000).";
    }

    let loadKg: number | null = null;
    if (!it.removeLoad && it.load.trim() !== "") {
      const load = decimalOrNull(it.load);
      if (load === null || Number.isNaN(load) || load <= 0 || load > maxLoad) errors[`${key}.load`] = `Carga entre 0 y ${maxLoad} ${unit}.`;
      else loadKg = Math.min(500, loadToKg(load, unit));
    }

    let rest: number | null = null;
    if (it.rest.trim() !== "") {
      rest = parseDuration(it.rest);
      if (rest === null || rest > 3600) errors[`${key}.rest`] = "Descanso en segundos o mm:ss (máx. 60:00).";
    }

    const note = it.note.trim();
    if (note.length > 140) errors[`${key}.note`] = "Máximo 140 caracteres.";

    let replacement: OverrideRow["replacement"] = null;
    if (it.replacementId !== "" && it.replacementId !== ex.exerciseId) {
      const r = replacements.get(it.replacementId);
      if (!r) errors[`${key}.replacementId`] = "Elige un ejercicio disponible de tu biblioteca.";
      else replacement = { exerciseId: r.id, name: r.name, category: r.category, equipment: [...r.equipment] };
    }

    if (Object.keys(errors).some((k) => k.startsWith(`${key}.`))) continue;

    // Solo lo que difiere del original.
    const originalLoadDisplay = ex.loadKg === null ? null : loadForDisplay(ex.loadKg, unit);
    const sameLoad = loadKg !== null && originalLoadDisplay !== null && loadForDisplay(loadKg, unit) === originalLoadDisplay;
    const row: OverrideRow = {
      blockIndex: it.blockIndex,
      exerciseIndex: it.exerciseIndex,
      skipped: it.skipped,
      sets: sets === ex.sets ? null : sets,
      reps: ex.targetType === "reps" && target !== ex.reps ? target : null,
      distanceMeters: ex.targetType === "distance" && target !== ex.distanceMeters ? target : null,
      durationSeconds: ex.targetType === "time" && target !== ex.durationSeconds ? target : null,
      loadKg: it.removeLoad || loadKg === null || sameLoad ? null : loadKg,
      // Vaciar la carga de un ejercicio que la tenía también es "sin carga".
      removeLoad: ex.loadKg !== null && (it.removeLoad || loadKg === null),
      restSeconds: rest === (ex.restSeconds ?? null) ? null : rest,
      note: note || null,
      replacement,
    };
    const changed =
      row.skipped || row.removeLoad || row.replacement !== null || row.note !== null ||
      [row.sets, row.reps, row.distanceMeters, row.durationSeconds, row.loadKg, row.restSeconds].some((v) => v !== null);
    if (changed) rows.push(row);
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rows };
}

/* ---------- Bloqueos ---------- */

export type OverrideLock = "editable" | "started" | "cancelled" | "withdrawn" | "inactive";

export const LOCK_MESSAGE: Record<Exclude<OverrideLock, "editable">, string> = {
  started: "El atleta ya comenzó la sesión: la personalización está bloqueada.",
  cancelled: "La sesión está cancelada: no se puede personalizar.",
  withdrawn: "El atleta ya no está asignado a esta sesión.",
  inactive: "El atleta está en pausa en tu equipo: reactívalo para personalizar.",
};

/** ¿Se puede editar la personalización de esta asignación? */
export function overrideLock(state: {
  sessionStatus: "programada" | "cancelada";
  assignmentStatus: "asignada" | "retirada";
  started: boolean;
  relationActive: boolean;
}): OverrideLock {
  if (state.started) return "started";
  if (state.sessionStatus === "cancelada") return "cancelled";
  if (state.assignmentStatus === "retirada") return "withdrawn";
  if (!state.relationActive) return "inactive";
  return "editable";
}

/** Vista previa de la versión del atleta (lo que verá en su app). */
export function effectiveToPreview(plan: EffectivePlan, title: string, unit: WeightUnit) {
  return {
    name: title,
    focus: plan.focus ?? "",
    intensity: plan.intensity,
    estimatedMinutes: plan.estimatedMinutes,
    blocks: plan.blocks.map((b, i) => ({
      key: `b${i}`,
      name: b.name,
      notes: b.notes ?? "",
      exercises: b.exercises.map((e, j) => ({
        key: `b${i}e${j}`,
        name: e.skipped ? `${e.name} (omitido)` : e.name,
        prescription: e.skipped ? "Ejercicio omitido para este atleta" : formatPrescription(e, unit),
        notes: [e.replaced ? `Sustituye a ${e.original.name}` : "", e.athleteNote ?? "", e.notes ?? ""].filter(Boolean).join(" · "),
      })),
    })),
  };
}
