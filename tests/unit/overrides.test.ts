import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  describeChanges,
  effectiveToPreview,
  formItemFor,
  overrideLock,
  validateOverrideForm,
  type OverrideFormItem,
  type OverrideRow,
  type ReplacementOption,
} from "@/lib/overrides/apply";
import { isValidPosition, setSlots, summarize, type LoggedSet } from "@/lib/execution/progress";
import { buildSnapshot } from "@/lib/scheduling/snapshot";
import { exerciseProgress, type ProgressRecord } from "@/lib/progress/metrics";

const SLED = "00000000-0000-4000-8000-000000000004";
const PULL = "00000000-0000-4000-8000-000000000005";
const WALL = "00000000-0000-4000-8000-000000000010";
const ROW = "00000000-0000-4000-8000-000000000007";

const SNAP = buildSnapshot({
  name: "Estaciones",
  focus: "",
  intensity: "alta",
  estimatedMinutes: 40,
  blocks: [
    {
      name: "Empuje",
      notes: "",
      exercises: [
        { exerciseId: SLED, exerciseName: "Sled Push", category: "estaciones", equipment: ["Trineo"], sets: 4, targetType: "distance", reps: null, distanceMeters: 12, durationSeconds: null, loadKg: 80, restSeconds: 90, notes: null },
        { exerciseId: WALL, exerciseName: "Wall Balls", category: "estaciones", equipment: ["Balón"], sets: 3, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: 6, restSeconds: null, notes: null },
      ],
    },
    {
      name: "Remo",
      notes: "",
      exercises: [{ exerciseId: ROW, exerciseName: "Remo", category: "estaciones", equipment: [], sets: 2, targetType: "time", reps: null, distanceMeters: null, durationSeconds: 120, loadKg: null, restSeconds: 60, notes: null }],
    },
  ],
});

const row = (over: Partial<OverrideRow> & Pick<OverrideRow, "blockIndex" | "exerciseIndex">): OverrideRow => ({
  skipped: false,
  sets: null,
  reps: null,
  distanceMeters: null,
  durationSeconds: null,
  loadKg: null,
  removeLoad: false,
  restSeconds: null,
  note: null,
  replacement: null,
  ...over,
});

const OPTIONS: ReplacementOption[] = [
  { id: PULL, name: "Sled Pull", category: "estaciones", equipment: ["Trineo", "Cuerda"] },
  { id: "11111111-1111-4111-8111-111111111111", name: "Sentadilla propia", category: "fuerza", equipment: [] },
];
const OPTION_MAP = new Map(OPTIONS.map((o) => [o.id, o]));

/** Formulario inicial (plan original) con cambios aplicados a algunos ejercicios. */
function form(changes: Record<string, Partial<OverrideFormItem>> = {}, unit: "kg" | "lb" = "kg"): OverrideFormItem[] {
  return SNAP.blocks.flatMap((b, bi) => b.exercises.map((ex, ei) => ({ ...formItemFor(ex, bi, ei, null, unit), ...(changes[`${bi}.${ei}`] ?? {}) })));
}

describe("aplicar ajustes sobre el snapshot", () => {
  it("cambia carga, series, objetivo y descanso solo del ejercicio ajustado", () => {
    const plan = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, loadKg: 60, sets: 3, distanceMeters: 10, restSeconds: 120 })]);
    const sled = plan.blocks[0]!.exercises[0]!;
    expect(sled).toMatchObject({ loadKg: 60, sets: 3, distanceMeters: 10, restSeconds: 120, adapted: true, skipped: false, replaced: false });
    expect(sled.original).toMatchObject({ loadKg: 80, sets: 4, distanceMeters: 12 });
    expect(plan.blocks[0]!.exercises[1]!).toMatchObject({ adapted: false, loadKg: 6, sets: 3 });
    expect(plan.personalized).toBe(true);
  });

  it("preserva el snapshot original (no lo muta)", () => {
    const before = structuredClone(SNAP);
    applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, loadKg: 60, skipped: true, replacement: { exerciseId: PULL, name: "Sled Pull", category: "estaciones", equipment: [] } })]);
    validateOverrideForm(form({ "0.0": { load: "50" } }), SNAP, "kg", OPTION_MAP);
    expect(SNAP).toEqual(before);
  });

  it("sin ajustes = plan original; restaurar es quitar la fila", () => {
    const plan = applyOverrides(SNAP, []);
    expect(plan.personalized).toBe(false);
    expect(plan.blocks[0]!.exercises[0]!).toMatchObject({ loadKg: 80, sets: 4, adapted: false });
    const restored = validateOverrideForm(form(), SNAP, "kg", OPTION_MAP);
    expect(restored).toEqual({ ok: true, rows: [] });
  });

  it("sustitución: cambia el ejercicio y conserva el original como referencia", () => {
    const plan = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, replacement: { exerciseId: PULL, name: "Sled Pull", category: "estaciones", equipment: ["Trineo"] }, note: "Molestia en hombro" })]);
    const e = plan.blocks[0]!.exercises[0]!;
    expect(e).toMatchObject({ exerciseId: PULL, name: "Sled Pull", replaced: true, athleteNote: "Molestia en hombro", targetType: "distance", distanceMeters: 12 });
    expect(e.original).toMatchObject({ exerciseId: SLED, name: "Sled Push" });
    expect(describeChanges(e, "kg")).toContainEqual({ label: "Sustitución", from: "Sled Push", to: "Sled Pull" });
  });

  it("sin carga y vista previa del atleta", () => {
    const plan = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 1, removeLoad: true }), row({ blockIndex: 1, exerciseIndex: 0, skipped: true })]);
    expect(plan.blocks[0]!.exercises[1]!.loadKg).toBeNull();
    const preview = effectiveToPreview(plan, "Sesión", "kg");
    expect(preview.blocks[1]!.exercises[0]!.prescription).toBe("Ejercicio omitido para este atleta");
    expect(preview.blocks[0]!.exercises[1]!.prescription).toBe("3 × 20 reps");
  });
});

describe("validación del formulario", () => {
  it("convierte unidades: la carga en lb se guarda en kg", () => {
    const r = validateOverrideForm(form({ "0.0": { load: "132.3" } }, "lb"), SNAP, "lb", OPTION_MAP);
    expect(r.ok && r.rows[0]!.loadKg).toBeCloseTo(60, 0);
  });

  it("solo guarda lo que difiere del original", () => {
    const r = validateOverrideForm(form({ "0.0": { load: "80", sets: "4", note: "Empuja corto" } }), SNAP, "kg", OPTION_MAP);
    expect(r).toEqual({ ok: true, rows: [row({ blockIndex: 0, exerciseIndex: 0, note: "Empuja corto" })] });
  });

  it("límites de series, repeticiones, distancia, tiempo, carga y descanso", () => {
    const bad = validateOverrideForm(
      form({ "0.0": { sets: "51", target: "0", load: "501", rest: "61:00" }, "0.1": { target: "1001" }, "1.0": { target: "abc" } }),
      SNAP,
      "kg",
      OPTION_MAP,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(["0.0.load", "0.0.rest", "0.0.sets", "0.0.target", "0.1.target", "1.0.target"]);
    }
  });

  it("valores incompatibles: el objetivo es del mismo tipo que el original", () => {
    // Remo es por tiempo: "120" se lee como 120 s, no como metros ni reps.
    const r = validateOverrideForm(form({ "1.0": { target: "1:30" } }), SNAP, "kg", OPTION_MAP);
    expect(r.ok && r.rows[0]).toMatchObject({ durationSeconds: 90, reps: null, distanceMeters: null });
  });

  it("una personalización por elemento: posiciones repetidas o inexistentes se rechazan", () => {
    const items = form();
    const dup = validateOverrideForm([...items, { ...items[0]!, load: "70" }], SNAP, "kg", OPTION_MAP);
    expect(!dup.ok && dup.errors["0.0.item"]).toBeTruthy();
    const ghost = validateOverrideForm([{ ...items[0]!, blockIndex: 9 }], SNAP, "kg", OPTION_MAP);
    expect(!ghost.ok && ghost.errors["9.0.item"]).toBeTruthy();
  });

  it("aislamiento entre coaches: un reemplazo fuera de la biblioteca autorizada se rechaza", () => {
    const foreign = validateOverrideForm(form({ "0.0": { replacementId: "22222222-2222-4222-8222-222222222222" } }), SNAP, "kg", OPTION_MAP);
    expect(!foreign.ok && foreign.errors["0.0.replacementId"]).toBeTruthy();
    const own = validateOverrideForm(form({ "0.0": { replacementId: PULL } }), SNAP, "kg", OPTION_MAP);
    // Nombre, categoría y equipo salen de la biblioteca del servidor, no del cliente.
    expect(own.ok && own.rows[0]!.replacement).toEqual({ exerciseId: PULL, name: "Sled Pull", category: "estaciones", equipment: ["Trineo", "Cuerda"] });
  });

  it("aislamiento entre atletas: los ajustes de A no tocan el plan de B", () => {
    const a = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, loadKg: 60 })]);
    const b = applyOverrides(SNAP, []);
    expect(a.blocks[0]!.exercises[0]!.loadKg).toBe(60);
    expect(b.blocks[0]!.exercises[0]!.loadKg).toBe(80);
  });
});

describe("bloqueos", () => {
  const base = { sessionStatus: "programada" as const, assignmentStatus: "asignada" as const, started: false, relationActive: true };
  it("editable solo antes de iniciar, en sesión programada, asignación vigente y relación activa", () => {
    expect(overrideLock(base)).toBe("editable");
    expect(overrideLock({ ...base, started: true })).toBe("started");
    expect(overrideLock({ ...base, sessionStatus: "cancelada" })).toBe("cancelled");
    expect(overrideLock({ ...base, assignmentStatus: "retirada" })).toBe("withdrawn");
    expect(overrideLock({ ...base, relationActive: false })).toBe("inactive");
    // Iniciada tiene prioridad aunque además esté cancelada.
    expect(overrideLock({ ...base, started: true, sessionStatus: "cancelada" })).toBe("started");
  });
});

describe("ejecución y resultados con el plan personalizado", () => {
  const plan = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, sets: 2, loadKg: 60 }), row({ blockIndex: 0, exerciseIndex: 1, skipped: true })]);

  it("las series usan los valores personalizados y excluyen los omitidos", () => {
    const slots = setSlots(plan);
    expect(slots.map((s) => `${s.blockIndex}.${s.exerciseIndex}.${s.setNumber}`)).toEqual(["0.0.1", "0.0.2", "1.0.1", "1.0.2"]);
    expect(slots[0]!.exercise).toMatchObject({ loadKg: 60, sets: 2 });
    expect(isValidPosition(plan, { blockIndex: 0, exerciseIndex: 0, setNumber: 3 })).toBe(false); // el original tenía 4
    expect(isValidPosition(plan, { blockIndex: 0, exerciseIndex: 1, setNumber: 1 })).toBe(false); // omitido
  });

  it("planeado vs. realizado: total sin omitidos; los omitidos no son 'no realizadas'", () => {
    const logs: LoggedSet[] = [{ blockIndex: 0, exerciseIndex: 0, setNumber: 1, actualReps: null, actualDistanceMeters: 12, actualDurationSeconds: null, actualLoadKg: 60, rpe: 7 }];
    const s = summarize(plan, logs);
    expect(s).toMatchObject({ done: 1, total: 4 });
    const wall = s.blocks[0]!.exercises[1]!;
    expect(wall.skipped).toBe(true);
    expect(wall.sets).toEqual([]);
    expect(s.blocks[0]!.exercises[0]!.exercise).toMatchObject({ loadKg: 60 });
  });

  it("el progreso usa el ejercicio personalizado (sustitución) sin mezclarlo con el original", () => {
    const replaced = applyOverrides(SNAP, [row({ blockIndex: 0, exerciseIndex: 0, replacement: { exerciseId: PULL, name: "Sled Pull", category: "estaciones", equipment: [] } })]);
    const rec: ProgressRecord = {
      sessionId: "s1",
      title: "S",
      date: "2026-11-20",
      sessionStatus: "programada",
      assignmentStatus: "asignada",
      snapshot: replaced,
      log: { status: "completada", startedAt: new Date("2026-11-20T15:00:00Z"), finishedAt: new Date("2026-11-20T16:00:00Z"), pausedAt: null, pausedSeconds: 0, rpe: null },
      sets: [{ blockIndex: 0, exerciseIndex: 0, setNumber: 1, actualReps: null, actualDistanceMeters: 12, actualDurationSeconds: null, actualLoadKg: 90, rpe: null }],
      discomforts: [],
    };
    const items = exerciseProgress([rec]);
    expect(items.map((i) => i.name)).toEqual(["Sled Pull"]);
    expect(items[0]!.key).toBe(`${PULL}|distance`);
  });
});
