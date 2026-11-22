import { describe, expect, it } from "vitest";
import {
  activeSeconds,
  closedPauseSeconds,
  isValidPosition,
  nextPendingIndex,
  setSlots,
  slotKey,
  startAvailability,
  summarize,
  type LoggedSet,
} from "@/lib/execution/progress";
import { formatActualSet, initialSetInput } from "@/lib/execution/format";
import { buildSnapshot, type TemplateForSnapshot } from "@/lib/scheduling/snapshot";
import { formatSetTarget } from "@/lib/workouts/rules";

const TEMPLATE: TemplateForSnapshot = {
  name: "Engine",
  focus: "",
  intensity: "alta",
  estimatedMinutes: 40,
  blocks: [
    {
      name: "Running",
      notes: "",
      exercises: [
        { exerciseId: "e1", exerciseName: "Carrera 1 km", category: "carrera", equipment: [], sets: 2, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: 90, notes: null },
      ],
    },
    {
      name: "Estaciones",
      notes: "",
      exercises: [
        { exerciseId: "e2", exerciseName: "Sled Push", category: "estaciones", equipment: [], sets: 2, targetType: "distance", reps: null, distanceMeters: 50, durationSeconds: null, loadKg: 152, restSeconds: 120, notes: null },
        { exerciseId: "e3", exerciseName: "Wall Balls", category: "estaciones", equipment: [], sets: 1, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: 6, restSeconds: null, notes: null },
      ],
    },
  ],
};
const SNAP = buildSnapshot(TEMPLATE);

const logOf = (blockIndex: number, exerciseIndex: number, setNumber: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  blockIndex,
  exerciseIndex,
  setNumber,
  actualReps: null,
  actualDistanceMeters: 50,
  actualDurationSeconds: null,
  actualLoadKg: 150,
  rpe: null,
  ...extra,
});

describe("series de la sesión (desde el snapshot)", () => {
  it("ordena bloque → ejercicio → serie", () => {
    const slots = setSlots(SNAP);
    expect(slots.map(slotKey)).toEqual(["0.0.1", "0.0.2", "1.0.1", "1.0.2", "1.1.1"]);
    expect(slots[2]).toMatchObject({ blockName: "Estaciones", blockCount: 2, exercise: { name: "Sled Push", loadKg: 152 } });
  });

  it("valida posiciones contra el snapshot", () => {
    expect(isValidPosition(SNAP, { blockIndex: 1, exerciseIndex: 1, setNumber: 1 })).toBe(true);
    expect(isValidPosition(SNAP, { blockIndex: 1, exerciseIndex: 1, setNumber: 2 })).toBe(false);
    expect(isValidPosition(SNAP, { blockIndex: 2, exerciseIndex: 0, setNumber: 1 })).toBe(false);
    expect(isValidPosition(SNAP, { blockIndex: 0, exerciseIndex: 0, setNumber: 0 })).toBe(false);
  });

  it("encuentra la siguiente pendiente y vuelve a las anteriores que falten", () => {
    const slots = setSlots(SNAP);
    expect(nextPendingIndex(slots, new Set())).toBe(0);
    expect(nextPendingIndex(slots, new Set(["0.0.1", "0.0.2"]), 1)).toBe(2);
    // Después de la última, regresa a la primera pendiente (una saltada).
    expect(nextPendingIndex(slots, new Set(["0.0.2", "1.0.1", "1.0.2", "1.1.1"]), 5)).toBe(0);
    expect(nextPendingIndex(slots, new Set(slots.map(slotKey)))).toBe(-1);
  });
});

describe("tiempo activo", () => {
  const startedAt = new Date("2026-11-24T13:00:00Z");
  it("descuenta pausas cerradas y la pausa en curso", () => {
    const now = new Date("2026-11-24T13:20:00Z");
    expect(activeSeconds({ startedAt, pausedAt: null, pausedSeconds: 120, finishedAt: null }, now)).toBe(18 * 60);
    // En pausa desde 13:10: el reloj se detiene ahí.
    expect(activeSeconds({ startedAt, pausedAt: new Date("2026-11-24T13:10:00Z"), pausedSeconds: 0, finishedAt: null }, now)).toBe(600);
    // Terminada: cuenta hasta el fin, no hasta ahora.
    expect(activeSeconds({ startedAt, pausedAt: null, pausedSeconds: 60, finishedAt: new Date("2026-11-24T13:45:00Z") }, now)).toBe(44 * 60);
  });

  it("cierra la pausa abierta en segundos", () => {
    expect(closedPauseSeconds(new Date("2026-11-24T13:10:00Z"), new Date("2026-11-24T13:12:30Z"))).toBe(150);
    expect(closedPauseSeconds(null, new Date())).toBe(0);
  });
});

describe("comenzar", () => {
  const base = { sessionStatus: "programada" as const, date: "2026-11-24", today: "2026-11-24", execution: "sin_iniciar" as const };
  it("hoy o días anteriores; no futuras ni canceladas", () => {
    expect(startAvailability(base)).toBe("disponible");
    expect(startAvailability({ ...base, date: "2026-11-20" })).toBe("disponible");
    expect(startAvailability({ ...base, date: "2026-11-25" })).toBe("futura");
    expect(startAvailability({ ...base, sessionStatus: "cancelada" })).toBe("cancelada");
    expect(startAvailability({ ...base, execution: "en_curso" })).toBe("iniciada");
  });
});

describe("resumen planeado vs. realizado", () => {
  it("cuenta series por bloque y deja las faltantes sin resultado", () => {
    const summary = summarize(SNAP, [logOf(0, 0, 1, { actualDistanceMeters: 1000, actualLoadKg: null }), logOf(1, 0, 2)]);
    expect(summary).toMatchObject({ done: 2, total: 5 });
    expect(summary.blocks.map((b) => [b.name, b.done, b.total])).toEqual([
      ["Running", 1, 2],
      ["Estaciones", 1, 3],
    ]);
    const sled = summary.blocks[1]!.exercises[0]!;
    expect(sled.sets[0]!.actual).toBeNull();
    expect(sled.sets[1]!.actual).toMatchObject({ actualDistanceMeters: 50, actualLoadKg: 150 });
    // Lo planeado sigue intacto en el snapshot.
    expect(sled.exercise).toMatchObject({ distanceMeters: 50, loadKg: 152 });
  });
});

describe("formato de series", () => {
  it("muestra objetivo y resultado en la unidad elegida", () => {
    expect(formatSetTarget(SNAP.blocks[1]!.exercises[0]!, "kg")).toBe("50 m · 152 kg");
    expect(formatSetTarget(SNAP.blocks[1]!.exercises[0]!, "lb")).toBe("50 m · 335.1 lb");
    expect(formatActualSet(logOf(1, 0, 1, { rpe: 8 }), "kg")).toBe("50 m · 150 kg · RPE 8");
    expect(formatActualSet({ actualReps: null, actualDistanceMeters: null, actualDurationSeconds: 95, actualLoadKg: null, rpe: null })).toBe("01:35");
  });

  it("prellena con lo planeado o, al corregir, con lo realizado", () => {
    const sled = SNAP.blocks[1]!.exercises[0]!;
    expect(initialSetInput(sled, null, "kg")).toEqual({ amount: "50", load: "152", rpe: "" });
    expect(initialSetInput(sled, logOf(1, 0, 1, { actualDistanceMeters: 45, rpe: 9 }), "kg")).toEqual({ amount: "45", load: "150", rpe: "9" });
    expect(initialSetInput({ ...sled, targetType: "time", durationSeconds: 90, loadKg: null }, null, "kg").amount).toBe("01:30");
  });
});
