import { describe, expect, it } from "vitest";
import {
  adherence,
  averageRpe,
  classify,
  coachOverview,
  completedInLastDays,
  exerciseProgress,
  finishedDay,
  inPeriod,
  isLowAdherence,
  parsePeriod,
  pendingAthletes,
  periodStart,
  recentDiscomforts,
  trainingTime,
  trendChange,
  type ProgressRecord,
  type ProgressSet,
} from "@/lib/progress/metrics";
import { formatChange, formatMetric, formatTotalTime } from "@/lib/progress/format";
import { buildSnapshot } from "@/lib/scheduling/snapshot";

const SLED = "00000000-0000-4000-8000-000000000004";
const WALL = "00000000-0000-4000-8000-000000000010";
const CUSTOM = "11111111-1111-4111-8111-111111111111";

const SNAP = buildSnapshot({
  name: "Engine",
  focus: "",
  intensity: "alta",
  estimatedMinutes: 45,
  blocks: [
    {
      name: "Estaciones",
      notes: "",
      exercises: [
        { exerciseId: SLED, exerciseName: "Sled Push", category: "estaciones", equipment: [], sets: 2, targetType: "distance", reps: null, distanceMeters: 50, durationSeconds: null, loadKg: 152, restSeconds: 60, notes: null },
        { exerciseId: WALL, exerciseName: "Wall Balls", category: "estaciones", equipment: [], sets: 1, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: null, restSeconds: null, notes: null },
        { exerciseId: CUSTOM, exerciseName: "Plancha", category: "movilidad", equipment: [], sets: 1, targetType: "time", reps: null, distanceMeters: null, durationSeconds: 60, loadKg: null, restSeconds: null, notes: null },
      ],
    },
  ],
});

const TODAY = "2026-11-24";

function set(exerciseIndex: number, setNumber: number, values: Partial<ProgressSet>): ProgressSet {
  return { blockIndex: 0, exerciseIndex, setNumber, actualReps: null, actualDistanceMeters: null, actualDurationSeconds: null, actualLoadKg: null, rpe: null, ...values };
}

let seq = 0;
function rec(date: string, opts: Partial<ProgressRecord> & { done?: string; started?: boolean; rpe?: number | null } = {}): ProgressRecord {
  const { done, started, rpe = null, ...rest } = opts;
  const finishedAt = done ? new Date(done) : null;
  const startedAt = finishedAt ? new Date(finishedAt.getTime() - 40 * 60_000) : new Date(`${date}T14:00:00Z`);
  return {
    sessionId: `s${++seq}`,
    title: `Sesión ${seq}`,
    date,
    sessionStatus: "programada",
    assignmentStatus: "asignada",
    snapshot: SNAP,
    log: done ? { status: "completada", startedAt, finishedAt, pausedAt: null, pausedSeconds: 0, rpe } : started ? { status: "en_curso", startedAt, finishedAt: null, pausedAt: null, pausedSeconds: 0, rpe: null } : null,
    sets: [],
    discomforts: [],
    ...rest,
  };
}

describe("clasificación de estados", () => {
  it("distingue completada, en curso, abandonada, no realizada y pendiente", () => {
    expect(classify(rec("2026-11-20", { done: "2026-11-20T15:00:00Z" }), TODAY)).toBe("completada");
    expect(classify(rec(TODAY, { started: true }), TODAY)).toBe("en_curso");
    expect(classify(rec("2026-11-22", { started: true }), TODAY)).toBe("abandonada");
    expect(classify(rec("2026-11-23"), TODAY)).toBe("no_realizada");
    expect(classify(rec(TODAY), TODAY)).toBe("pendiente");
    expect(classify(rec("2026-11-30"), TODAY)).toBe("pendiente");
  });

  it("excluye canceladas y retiradas, aunque estén completadas", () => {
    expect(classify(rec("2026-11-20", { done: "2026-11-20T15:00:00Z", sessionStatus: "cancelada" }), TODAY)).toBeNull();
    expect(classify(rec("2026-11-20", { assignmentStatus: "retirada" }), TODAY)).toBeNull();
  });
});

describe("adherencia", () => {
  it("completadas ÷ (completadas + no realizadas + abandonadas); hoy sin hacer no penaliza", () => {
    const records = [
      rec("2026-11-18", { done: "2026-11-18T15:00:00Z" }),
      rec("2026-11-19", { done: "2026-11-19T15:00:00Z" }),
      rec("2026-11-20", { done: "2026-11-20T15:00:00Z" }),
      rec("2026-11-21"), // no realizada
      rec("2026-11-22", { started: true }), // abandonada
      rec(TODAY), // pendiente
      rec(TODAY, { started: true }), // en curso
      rec("2026-11-20", { sessionStatus: "cancelada" }), // excluida
      rec("2026-11-20", { assignmentStatus: "retirada" }), // excluida
    ];
    const a = adherence(records, TODAY);
    expect(a).toMatchObject({ assigned: 7, started: 5, completed: 3, missed: 1, abandoned: 1, pending: 1, inProgress: 1, due: 5, sufficient: true });
    expect(a.rate).toBeCloseTo(0.6);
    expect(isLowAdherence(a)).toBe(true);
  });

  it("sin vencidas no hay porcentaje y con menos de 3 es insuficiente", () => {
    expect(adherence([rec(TODAY)], TODAY)).toMatchObject({ rate: null, due: 0, sufficient: false });
    const two = adherence([rec("2026-11-20"), rec("2026-11-21")], TODAY);
    expect(two).toMatchObject({ rate: 0, sufficient: false });
    expect(isLowAdherence(two)).toBe(false);
  });
});

describe("periodos y zona horaria America/Mexico_City", () => {
  it("7/30/90 días terminan hoy (inclusive) y 'todo' no tiene límite", () => {
    expect(periodStart("7", TODAY)).toBe("2026-11-18");
    expect(periodStart("30", TODAY)).toBe("2026-10-26");
    expect(periodStart("90", TODAY)).toBe("2026-08-27");
    expect(periodStart("todo", TODAY)).toBeNull();
    expect(parsePeriod("90")).toBe("90");
    expect(parsePeriod("365")).toBe("30");
    const records = [rec("2026-11-17"), rec("2026-11-18"), rec("2026-11-30")];
    expect(inPeriod(records, "7", TODAY).map((r) => r.date)).toEqual(["2026-11-18"]);
    expect(inPeriod(records, "todo", TODAY)).toHaveLength(3);
  });

  it("cuenta por el día de México en que terminó, no por UTC", () => {
    // 2026-11-25 03:30 UTC = 2026-11-24 21:30 en Ciudad de México.
    const late = rec(TODAY, { done: "2026-11-25T03:30:00Z" });
    expect(finishedDay(late)).toBe("2026-11-24");
    // 2026-11-17 05:59 UTC = 16 nov 23:59 en México: fuera de los últimos 7 días.
    const edge = rec("2026-11-16", { done: "2026-11-17T05:59:00Z" });
    const inside = rec("2026-11-18", { done: "2026-11-18T06:00:00Z" });
    expect(completedInLastDays([late, edge, inside], 7, TODAY)).toBe(2);
    expect(completedInLastDays([late, edge, inside], 30, TODAY)).toBe(3);
  });
});

describe("tiempo y RPE", () => {
  it("suma solo sesiones completadas válidas y descarta duraciones absurdas", () => {
    const valid = rec("2026-11-20", { done: "2026-11-20T15:00:00Z" }); // 40 min
    const huge = rec("2026-11-21", { done: "2026-11-21T15:00:00Z" });
    huge.log = { ...huge.log!, startedAt: new Date("2026-11-21T08:00:00Z") }; // 7 h
    const cancelled = rec("2026-11-22", { done: "2026-11-22T15:00:00Z", sessionStatus: "cancelada" });
    expect(trainingTime([valid, huge, cancelled])).toEqual({ totalSeconds: 2400, sessions: 1, discarded: 1 });
    expect(formatTotalTime(2400)).toBe("40 min");
    expect(formatTotalTime(3 * 3600 + 300)).toBe("3 h 05 min");
  });

  it("promedia el RPE de completadas que lo tienen", () => {
    const records = [
      rec("2026-11-20", { done: "2026-11-20T15:00:00Z", rpe: 7 }),
      rec("2026-11-21", { done: "2026-11-21T15:00:00Z", rpe: 8 }),
      rec("2026-11-22", { done: "2026-11-22T15:00:00Z", rpe: null }),
      rec("2026-11-22", { done: "2026-11-22T15:00:00Z", rpe: 2, sessionStatus: "cancelada" }),
    ];
    expect(averageRpe(records)).toEqual({ value: 7.5, sessions: 2 });
    expect(averageRpe([])).toEqual({ value: null, sessions: 0 });
  });
});

describe("marcas y evolución por ejercicio", () => {
  const s1 = rec("2026-11-10", {
    done: "2026-11-10T15:00:00Z",
    sets: [set(0, 1, { actualDistanceMeters: 50, actualLoadKg: 140 }), set(0, 2, { actualDistanceMeters: 50, actualLoadKg: 145 }), set(1, 1, { actualReps: 20 })],
  });
  const s2 = rec("2026-11-17", {
    done: "2026-11-17T15:00:00Z",
    sets: [set(0, 1, { actualDistanceMeters: 45, actualLoadKg: 152 }), set(1, 1, { actualReps: 18 }), set(2, 1, { actualDurationSeconds: 75 })],
  });
  const notDone = rec("2026-11-20", { started: true, sets: [set(0, 1, { actualDistanceMeters: 50, actualLoadKg: 200 })] });
  const cancelled = rec("2026-11-21", { done: "2026-11-21T15:00:00Z", sessionStatus: "cancelada", sets: [set(1, 1, { actualReps: 99 })] });

  const items = exerciseProgress([s2, s1, notDone, cancelled]);
  const sled = items.find((i) => i.name === "Sled Push")!;
  const wall = items.find((i) => i.name === "Wall Balls")!;
  const plank = items.find((i) => i.name === "Plancha")!;

  it("agrupa por ejercicio + objetivo y ordena por estación HYROX", () => {
    expect(items.map((i) => i.group)).toEqual(["Sled Push", "Wall Balls", "Movilidad"]);
    expect(sled.key).toBe(`${SLED}|distance`);
  });

  it("evolución: mejor serie por sesión, en orden cronológico, solo completadas vigentes", () => {
    expect(sled.metric).toBe("load");
    expect(sled.points.map((p) => [p.day, p.value])).toEqual([
      ["2026-11-10", 145],
      ["2026-11-17", 152],
    ]);
    expect(sled.sufficient).toBe(true);
    expect(trendChange(sled.points)).toBe(7);
    expect(wall.points.map((p) => p.value)).toEqual([20, 18]);
    expect(plank.sufficient).toBe(false); // 1 sola sesión
    expect(trendChange(plank.points)).toBeNull();
  });

  it("marcas: mayor carga, mayor distancia, más reps y mayor tiempo sostenido (sin canceladas ni en curso)", () => {
    expect(sled.records.map((r) => [r.kind, r.value, r.day])).toEqual([
      ["load", 152, "2026-11-17"],
      ["distance", 50, "2026-11-10"], // empate: la primera vez
    ]);
    expect(wall.records).toEqual([{ kind: "reps", value: 20, day: "2026-11-10", sessionId: s1.sessionId }]);
    expect(plank.records.map((r) => [r.kind, r.value])).toEqual([["duration", 75]]);
  });

  it("no mezcla ejercicios distintos aunque compartan métrica", () => {
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.every((i) => i.points.every((p) => p.sessionId !== notDone.sessionId && p.sessionId !== cancelled.sessionId))).toBe(true);
  });

  it("formatea en la unidad del usuario", () => {
    expect(formatMetric("load", 152, "kg")).toBe("152 kg");
    expect(formatMetric("load", 152, "lb")).toBe("335.1 lb");
    expect(formatMetric("distance", 1000, "kg")).toBe("1 km");
    expect(formatMetric("duration", 75, "kg")).toBe("01:15");
    expect(formatChange("load", 7, "kg")).toBe("+7 kg");
    expect(formatChange("reps", -2, "kg")).toBe("−2 reps");
    expect(formatChange("reps", 0, "kg")).toBe("Sin cambio");
  });
});

describe("molestias recientes", () => {
  it("filtra por día de México y excluye sesiones canceladas", () => {
    const d = (id: string, at: string) => ({ id, zone: "rodilla" as const, intensity: "leve" as const, note: null, exerciseName: null, createdAt: new Date(at) });
    const a = rec("2026-11-20", { done: "2026-11-20T15:00:00Z", discomforts: [d("d1", "2026-11-20T15:00:00Z"), d("d2", "2026-11-10T15:00:00Z")] });
    const c = rec("2026-11-21", { done: "2026-11-21T15:00:00Z", sessionStatus: "cancelada", discomforts: [d("d3", "2026-11-21T15:00:00Z")] });
    expect(recentDiscomforts([a, c], "2026-11-18").map((x) => x.id)).toEqual(["d1"]);
    expect(recentDiscomforts([a, c], null).map((x) => x.id)).toEqual(["d1", "d2"]);
  });
});

describe("resumen del coach", () => {
  const good = { athleteId: "a1", name: "Ana", relationStatus: "active" as const, records: [1, 2, 3].map((i) => rec(`2026-11-2${i}`, { done: `2026-11-2${i}T15:00:00Z` })) };
  const low = {
    athleteId: "a2",
    name: "Beto",
    relationStatus: "paused" as const,
    records: [rec("2026-11-20", { done: "2026-11-20T15:00:00Z" }), rec("2026-11-21"), rec("2026-11-22"), rec("2026-11-23")],
  };
  const hurt = {
    athleteId: "a3",
    name: "Caro",
    relationStatus: "active" as const,
    records: [rec("2026-11-22", { done: "2026-11-22T15:00:00Z", discomforts: [{ id: "x", zone: "hombro", intensity: "moderada", note: null, exerciseName: null, createdAt: new Date("2026-11-22T15:00:00Z") }] })],
  };

  it("agrega el grupo y marca baja adherencia (< 70% con ≥ 3) y molestias", () => {
    const o = coachOverview([good, low, hurt], "7", TODAY, "todos");
    expect(o.group).toMatchObject({ completed: 5, due: 8 });
    expect(o.lowCount).toBe(1);
    expect(o.discomfortCount).toBe(1);
    // Primero quien requiere atención.
    expect(o.rows.map((r) => r.name)).toEqual(["Beto", "Caro", "Ana"]);
    expect(o.rows.find((r) => r.name === "Ana")?.lastCompletedDay).toBe("2026-11-23");
  });

  it("filtra por estado", () => {
    expect(coachOverview([good, low, hurt], "7", TODAY, "baja").rows.map((r) => r.name)).toEqual(["Beto"]);
    expect(coachOverview([good, low, hurt], "7", TODAY, "molestias").rows.map((r) => r.name)).toEqual(["Caro"]);
  });
});

describe("atletas con pendientes (Inicio del coach)", () => {
  it("solo quien tiene sesiones vencidas sin completar; primero baja adherencia", () => {
    const ok = { athleteId: "a1", name: "Ana", relationStatus: "active" as const, records: [rec("2026-11-22", { done: "2026-11-22T15:00:00Z" })] };
    const missedOne = { athleteId: "a2", name: "Beto", relationStatus: "active" as const, records: [rec("2026-11-22", { done: "2026-11-22T15:00:00Z" }), rec("2026-11-23")] };
    const low = {
      athleteId: "a3",
      name: "Caro",
      relationStatus: "active" as const,
      records: [rec("2026-11-20"), rec("2026-11-21", { started: true }), rec("2026-11-22", { done: "2026-11-22T15:00:00Z" })],
    };
    const cancelledOnly = { athleteId: "a4", name: "Dani", relationStatus: "active" as const, records: [rec("2026-11-22", { sessionStatus: "cancelada" })] };
    const rows = coachOverview([ok, missedOne, low, cancelledOnly], "30", TODAY, "todos").rows;
    const pending = pendingAthletes(rows);
    expect(pending.map((p) => [p.name, p.pendingCount, p.low])).toEqual([
      ["Caro", 2, true],
      ["Beto", 1, false],
    ]);
  });
});
