import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  diffDays,
  formatKeyLong,
  formatKeyShort,
  formatWeekRange,
  isDateKey,
  mondayOf,
  relativeDayKey,
  todayKey,
  weekDays,
} from "@/lib/scheduling/dates";
import { resolveWeekParam } from "@/lib/scheduling/week-param";
import { buildSnapshot, parseSnapshot, snapshotEquipment, snapshotExerciseCount, snapshotToPreview, type TemplateForSnapshot } from "@/lib/scheduling/snapshot";
import { filterSessionsByStatus } from "@/components/coach/calendar-week";
import { hasErrors, validateSessionDetails } from "@/lib/validations";

describe("fechas de calendario (claves YYYY-MM-DD)", () => {
  it("valida claves reales", () => {
    expect(isDateKey("2026-11-24")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("24/11/2026")).toBe(false);
  });

  it("calcula hoy en la zona horaria de la app", () => {
    // 2026-11-25 04:30 UTC = 2026-11-24 22:30 en Ciudad de México (UTC-6).
    const instant = new Date("2026-11-25T04:30:00Z");
    expect(todayKey("America/Mexico_City", instant)).toBe("2026-11-24");
    expect(todayKey("UTC", instant)).toBe("2026-11-25");
  });

  it("aritmética de días y semanas sin desfases", () => {
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(mondayOf("2026-11-24")).toBe("2026-11-23"); // martes → lunes
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // domingo → lunes anterior
    expect(diffDays("2026-11-24", "2026-11-26")).toBe(2);
    const week = weekDays("2026-11-23", "2026-11-24");
    expect(week.map((d) => d.label)).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    expect(week[1]).toMatchObject({ key: "2026-11-24", dayOfMonth: 24, isToday: true });
    expect(week[6]?.key).toBe("2026-11-29");
  });

  it("formatea en español", () => {
    expect(formatKeyLong("2026-11-24")).toBe("Martes, 24 de noviembre");
    expect(formatKeyShort("2026-11-24")).toBe("24 nov");
    expect(formatKeyShort("2027-01-05", "2026-11-24")).toBe("5 ene 2027");
    expect(relativeDayKey("2026-11-24", "2026-11-24")).toBe("Hoy");
    expect(relativeDayKey("2026-11-25", "2026-11-24")).toBe("Mañana");
    expect(relativeDayKey("2026-11-27", "2026-11-24")).toMatch(/^Vie 27 nov$/);
    expect(formatWeekRange("2026-11-23")).toBe("23 – 29 nov");
    expect(formatWeekRange("2026-11-30")).toBe("30 nov – 6 dic");
  });

  it("?semana= se ajusta al lunes y cae a la semana actual si no es válido", () => {
    expect(resolveWeekParam("2026-11-26", "2026-11-24")).toBe("2026-11-23");
    expect(resolveWeekParam(undefined, "2026-11-24")).toBe("2026-11-23");
    expect(resolveWeekParam("basura", "2026-11-24")).toBe("2026-11-23");
    expect(resolveWeekParam(["2026-12-02"], "2026-11-24")).toBe("2026-11-30");
  });
});

const TEMPLATE: TemplateForSnapshot = {
  name: "Engine + Sled Push",
  focus: "Potencia",
  intensity: "alta",
  estimatedMinutes: 65,
  blocks: [
    {
      name: "Running",
      notes: "",
      exercises: [
        { exerciseId: "e1", exerciseName: "Carrera 1 km", category: "carrera", equipment: ["Pista"], sets: 4, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: 90, notes: null },
      ],
    },
    {
      name: "Sled Push",
      notes: "Carga Pro",
      exercises: [
        { exerciseId: "e2", exerciseName: "Sled Push", category: "estaciones", equipment: ["Trineo", "Pista"], sets: 4, targetType: "distance", reps: null, distanceMeters: 50, durationSeconds: null, loadKg: 152, restSeconds: 120, notes: "Pasos cortos" },
      ],
    },
  ],
};

describe("snapshot de la sesión", () => {
  it("congela la plantilla con versión y equipo", () => {
    const snap = buildSnapshot(TEMPLATE);
    expect(snap.version).toBe(1);
    expect(snap.templateName).toBe("Engine + Sled Push");
    expect(snap.blocks[1]).toMatchObject({ name: "Sled Push", notes: "Carga Pro" });
    expect(snap.blocks[1]!.exercises[0]).toMatchObject({ name: "Sled Push", loadKg: 152, equipment: ["Trineo", "Pista"] });
    expect(snapshotEquipment(snap)).toEqual(["Pista", "Trineo"]);
    expect(snapshotExerciseCount(snap)).toBe(2);
  });

  it("es una copia: cambiar la plantilla después no lo altera", () => {
    const template = structuredClone(TEMPLATE);
    const snap = buildSnapshot(template);
    template.blocks[0]!.exercises[0]!.sets = 10;
    template.blocks[0]!.exercises[0]!.equipment.push("Cohete");
    template.name = "Otro nombre";
    expect(snap.blocks[0]!.exercises[0]!.sets).toBe(4);
    expect(snap.blocks[0]!.exercises[0]!.equipment).toEqual(["Pista"]);
    expect(snap.templateName).toBe("Engine + Sled Push");
  });

  it("valida en tiempo de ejecución lo que viene de la BD", () => {
    const snap = buildSnapshot(TEMPLATE);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ version: 2, blocks: [] })).toBeNull();
    expect(parseSnapshot({ ...snap, intensity: "extrema" })).toBeNull();
    const broken = structuredClone(snap) as unknown as { blocks: { exercises: { sets: unknown }[] }[] };
    broken.blocks[0]!.exercises[0]!.sets = "4";
    expect(parseSnapshot(broken)).toBeNull();
  });

  it("se convierte en vista previa con prescripciones en la unidad del atleta", () => {
    const preview = snapshotToPreview(buildSnapshot(TEMPLATE), "Sesión del martes", "lb");
    expect(preview.name).toBe("Sesión del martes");
    expect(preview.blocks[1]!.exercises[0]!.prescription).toBe("4 × 50 m · 335.1 lb · descanso 02:00");
  });
});

describe("validateSessionDetails", () => {
  const opts = { today: "2026-11-24", maxDate: "2027-11-25" };
  it("acepta hoy, hora opcional y notas", () => {
    expect(hasErrors(validateSessionDetails({ date: "2026-11-24", time: "", title: "Engine", notes: "" }, opts))).toBe(false);
    expect(hasErrors(validateSessionDetails({ date: "2026-12-01", time: "07:30", title: "Engine", notes: "Llega antes" }, opts))).toBe(false);
  });
  it("rechaza fechas pasadas, demasiado lejanas y horas inválidas", () => {
    expect(validateSessionDetails({ date: "2026-11-23", time: "", title: "Engine", notes: "" }, opts).date).toMatch(/anterior a hoy/);
    expect(validateSessionDetails({ date: "2028-01-01", time: "", title: "Engine", notes: "" }, opts).date).toMatch(/un año/);
    expect(validateSessionDetails({ date: "2026-11-24", time: "7:30", title: "Engine", notes: "" }, opts).time).toBeDefined();
    expect(validateSessionDetails({ date: "2026-11-24", time: "", title: "Engine", notes: "x".repeat(501) }, opts).notes).toBeDefined();
  });
});

describe("filtro del calendario", () => {
  it("filtra por estado", () => {
    const sessions = [
      { id: "1", status: "programada" as const },
      { id: "2", status: "cancelada" as const },
    ];
    expect(filterSessionsByStatus(sessions, "todas")).toHaveLength(2);
    expect(filterSessionsByStatus(sessions, "cancelada").map((s) => s.id)).toEqual(["2"]);
  });
});
