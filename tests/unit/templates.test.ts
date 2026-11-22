import { describe, expect, it } from "vitest";
import {
  canArchive,
  canEditTemplate,
  canPublish,
  canUnpublish,
  filterTemplates,
  formatPrescription,
  loadForDisplay,
  loadToKg,
  moveItem,
  parseDuration,
  publishProblems,
  type PrescriptionData,
} from "@/lib/workouts/rules";
import { defaultExerciseInput, inputToPreview, toTemplateInput, toTemplateWriteData } from "@/lib/workouts/convert";
import { validateTemplate, type TemplateInput } from "@/lib/validations";

const SLED = "00000000-0000-4000-8000-000000000004";
const RUN = "00000000-0000-4000-8000-000000000001";

function template(overrides: Partial<TemplateInput> = {}): TemplateInput {
  return {
    name: "Engine + Sled Push",
    focus: "Resistencia",
    intensity: "alta",
    estimatedMinutes: "65",
    blocks: [
      {
        key: "b1",
        name: "Running",
        notes: "",
        exercises: [{ key: "e1", exerciseId: RUN, sets: "4", targetType: "distance", target: "1000", load: "", rest: "1:30", notes: "" }],
      },
      {
        key: "b2",
        name: "Sled Push",
        notes: "Carga Pro",
        exercises: [{ key: "e2", exerciseId: SLED, sets: "4", targetType: "distance", target: "50", load: "152", rest: "120", notes: "Pasos cortos" }],
      },
    ],
    ...overrides,
  };
}

describe("unidades de carga", () => {
  it("convierte kg ↔ lb sin deriva visible", () => {
    expect(loadToKg(100, "kg")).toBe(100);
    expect(loadToKg(100, "lb")).toBe(45.36);
    expect(loadForDisplay(45.36, "lb")).toBe(100);
    expect(loadForDisplay(152, "kg")).toBe(152);
  });
});

describe("parseDuration", () => {
  it("acepta segundos, mm:ss y h:mm:ss", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("01:00:00")).toBe(3600);
    expect(parseDuration(" 2:05 ")).toBe(125);
  });
  it("rechaza formatos inválidos", () => {
    for (const bad of ["", "1:75", "abc", "1:2:3:4", "-5", "1.5"]) expect(parseDuration(bad)).toBeNull();
  });
});

describe("formatPrescription", () => {
  const base: PrescriptionData = { sets: 4, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: 90 };
  it("formatea distancia, repeticiones y tiempo con carga y descanso", () => {
    expect(formatPrescription(base)).toBe("4 × 1 km · descanso 01:30");
    expect(formatPrescription({ ...base, distanceMeters: 50, loadKg: 152, restSeconds: null })).toBe("4 × 50 m · 152 kg");
    expect(formatPrescription({ ...base, targetType: "reps", reps: 10, distanceMeters: null, loadKg: 45.36, restSeconds: null }, "lb")).toBe("4 × 10 reps · 100 lb");
    expect(formatPrescription({ ...base, targetType: "time", durationSeconds: 60, distanceMeters: null, restSeconds: 0 })).toBe("4 × 01:00");
  });
});

describe("moveItem", () => {
  it("reordena sin mutar y respeta los límites", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 2, -2)).toEqual(["c", "a", "b"]);
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("publicación y estados", () => {
  it("lista lo que falta para publicar", () => {
    expect(publishProblems({ estimatedMinutes: 60, blocks: [{ name: "A", exerciseCount: 2 }] })).toEqual([]);
    const problems = publishProblems({ estimatedMinutes: null, blocks: [{ name: "Running", exerciseCount: 0 }] });
    expect(problems).toHaveLength(2);
    expect(problems[1]).toMatch(/Running/);
    expect(publishProblems({ estimatedMinutes: 30, blocks: [] })).toEqual(["Agrega al menos un bloque."]);
  });

  it("transiciones válidas", () => {
    expect(canPublish("borrador")).toBe(true);
    expect(canPublish("publicada")).toBe(false);
    expect(canUnpublish("publicada")).toBe(true);
    expect(canArchive("archivada")).toBe(false);
    expect(canEditTemplate("archivada")).toBe(false);
    expect(canEditTemplate("publicada")).toBe(true);
  });
});

describe("filterTemplates", () => {
  const items = [
    { id: "1", name: "Engine + Sled Push", focus: "Potencia", status: "publicada" as const },
    { id: "2", name: "Movilidad", focus: "Recuperación", status: "borrador" as const },
    { id: "3", name: "Vieja", focus: "", status: "archivada" as const },
  ];
  it("'activas' excluye archivadas y busca sin acentos en nombre o enfoque", () => {
    expect(filterTemplates(items, "", "activas").map((t) => t.id)).toEqual(["1", "2"]);
    expect(filterTemplates(items, "recuperacion", "activas").map((t) => t.id)).toEqual(["2"]);
    expect(filterTemplates(items, "", "archivada").map((t) => t.id)).toEqual(["3"]);
    expect(filterTemplates(items, "", "publicada").map((t) => t.id)).toEqual(["1"]);
  });
});

describe("validateTemplate", () => {
  it("acepta una plantilla completa para publicar", () => {
    expect(validateTemplate(template(), { publish: true, weightUnit: "kg" })).toEqual({});
  });

  it("un borrador solo exige nombre, pero publicar exige duración y ejercicios", () => {
    const draft = template({ estimatedMinutes: "", blocks: [{ key: "b", name: "Bloque 1", notes: "", exercises: [] }] });
    expect(validateTemplate(draft, { publish: false, weightUnit: "kg" })).toEqual({});
    const errors = validateTemplate(draft, { publish: true, weightUnit: "kg" });
    expect(Object.keys(errors).sort()).toEqual(["blocks.0.exercises", "estimatedMinutes"]);
  });

  it("marca errores por ruta en cada ejercicio", () => {
    const t = template();
    const bad: TemplateInput = {
      ...t,
      name: "X",
      blocks: [
        {
          ...t.blocks[0]!,
          exercises: [{ key: "e", exerciseId: "nope", sets: "0", targetType: "time", target: "1:75", load: "-3", rest: "abc", notes: "x".repeat(141) }],
        },
      ],
    };
    const errors = validateTemplate(bad, { publish: false, weightUnit: "kg" });
    expect(Object.keys(errors).sort()).toEqual(
      [
        "name",
        "blocks.0.exercises.0.exerciseId",
        "blocks.0.exercises.0.sets",
        "blocks.0.exercises.0.target",
        "blocks.0.exercises.0.load",
        "blocks.0.exercises.0.rest",
        "blocks.0.exercises.0.notes",
      ].sort(),
    );
  });

  it("el límite de carga depende de la unidad del coach", () => {
    const heavy = (load: string) => template({ blocks: [{ ...template().blocks[1]!, exercises: [{ ...template().blocks[1]!.exercises[0]!, load }] }] });
    expect(validateTemplate(heavy("600"), { publish: false, weightUnit: "kg" })["blocks.0.exercises.0.load"]).toBeDefined();
    expect(validateTemplate(heavy("600"), { publish: false, weightUnit: "lb" })["blocks.0.exercises.0.load"]).toBeUndefined();
  });
});

describe("conversión formulario ↔ datos", () => {
  it("convierte a números, segundos y kg (planeado, nunca resultados)", () => {
    const data = toTemplateWriteData(template(), "kg");
    expect(data.estimatedMinutes).toBe(65);
    expect(data.blocks[0]!.exercises[0]).toEqual({
      exerciseId: RUN, sets: 4, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: 90, notes: null,
    });
    expect(data.blocks[1]!.exercises[0]!.loadKg).toBe(152);
    expect(data.blocks[1]!.notes).toBe("Carga Pro");
  });

  it("ida y vuelta en lb conserva los valores capturados", () => {
    const data = toTemplateWriteData(template({ blocks: [{ ...template().blocks[1]!, exercises: [{ ...template().blocks[1]!.exercises[0]!, load: "100" }] }] }), "lb");
    expect(data.blocks[0]!.exercises[0]!.loadKg).toBe(45.36);
    const back = toTemplateInput(
      { name: data.name, focus: "", intensity: data.intensity, estimatedMinutes: data.estimatedMinutes, blocks: data.blocks.map((b) => ({ name: b.name, notes: b.notes ?? "", exercises: b.exercises.map((e, i) => ({ ...e, id: `x${i}` })) })) },
      "lb",
    );
    expect(back.blocks[0]!.exercises[0]!.load).toBe("100");
    expect(back.blocks[0]!.exercises[0]!.rest).toBe("02:00");
  });

  it("valores por defecto según la categoría", () => {
    expect(defaultExerciseInput(RUN, "carrera")).toMatchObject({ sets: "1", targetType: "distance", target: "1000" });
    expect(defaultExerciseInput(SLED, "estaciones")).toMatchObject({ sets: "3", targetType: "reps", target: "10" });
  });

  it("la vista previa muestra lo capturado aunque esté incompleto", () => {
    const info = new Map([[RUN, { name: "Carrera 1 km", category: "carrera", archived: false }]]);
    const preview = inputToPreview(template({ estimatedMinutes: "" }), "kg", info);
    expect(preview.estimatedMinutes).toBeNull();
    expect(preview.blocks[0]!.exercises[0]).toMatchObject({ name: "Carrera 1 km", prescription: "4 × 1000 m · descanso 01:30" });
    expect(preview.blocks[1]!.exercises[0]!.name).toBe("Ejercicio");
  });
});
