import { describe, expect, it } from "vitest";
import {
  athleteCanView,
  checkSubstitutions,
  coachCanDuplicate,
  coachCanEdit,
  coachCanView,
  exerciseOrigin,
  filterLibrary,
  MAX_SUBSTITUTIONS,
  mediaHost,
  type LibraryItem,
} from "@/lib/exercises/rules";
import { hasErrors, validateExercise, type ExerciseInput } from "@/lib/validations";

const ME = "coach-1";
const OTHER = "coach-2";
const system = { coachId: null, archived: false };
const mine = { coachId: ME, archived: false };
const theirs = { coachId: OTHER, archived: false };

describe("permisos por propietario", () => {
  it("el coach ve los del sistema y los suyos, no los de otros", () => {
    expect(coachCanView(system, ME)).toBe(true);
    expect(coachCanView(mine, ME)).toBe(true);
    expect(coachCanView({ ...mine, archived: true }, ME)).toBe(true);
    expect(coachCanView(theirs, ME)).toBe(false);
  });

  it("solo el propietario edita; los del sistema solo se duplican", () => {
    expect(coachCanEdit(mine, ME)).toBe(true);
    expect(coachCanEdit(system, ME)).toBe(false);
    expect(coachCanEdit(theirs, ME)).toBe(false);
    expect(coachCanDuplicate(system)).toBe(true);
    expect(coachCanDuplicate(mine)).toBe(false);
  });

  it("el atleta ve los del sistema y los de su coach actual, no archivados", () => {
    expect(athleteCanView(system, null)).toBe(true);
    expect(athleteCanView(mine, ME)).toBe(true);
    expect(athleteCanView(mine, null)).toBe(false);
    expect(athleteCanView(theirs, ME)).toBe(false);
    expect(athleteCanView({ ...mine, archived: true }, ME)).toBe(false);
  });

  it("origen según propietario", () => {
    expect(exerciseOrigin(system)).toBe("system");
    expect(exerciseOrigin(mine)).toBe("own");
  });
});

describe("sustituciones", () => {
  const available = new Set(["a", "b", "c", "d", "e", "f"]);

  it("acepta hasta 5 disponibles, únicas y sin el propio ejercicio", () => {
    expect(checkSubstitutions(["a", "b"], { exerciseId: "x", available })).toBeNull();
    expect(checkSubstitutions([], { available })).toBeNull();
    expect(MAX_SUBSTITUTIONS).toBe(5);
  });

  it("detecta cada error", () => {
    expect(checkSubstitutions(["a", "b", "c", "d", "e", "f"], { available })).toBe("too-many");
    expect(checkSubstitutions(["a", "a"], { available })).toBe("duplicate");
    expect(checkSubstitutions(["a", "x"], { exerciseId: "x", available: new Set([...available, "x"]) })).toBe("self");
    expect(checkSubstitutions(["a", "zzz"], { available })).toBe("not-available");
  });
});

describe("medios por URL", () => {
  it("solo https, con dominio legible", () => {
    expect(mediaHost("https://www.youtube.com/watch?v=1")).toBe("youtube.com");
    expect(mediaHost("https://cdn.example.com/a.jpg")).toBe("cdn.example.com");
    expect(mediaHost("http://youtube.com")).toBeNull();
    expect(mediaHost("javascript:alert(1)")).toBeNull();
    expect(mediaHost("no es url")).toBeNull();
  });
});

describe("filterLibrary", () => {
  const items: LibraryItem[] = [
    { id: "1", name: "Sled Push", category: "estaciones", difficulty: "intermedio", equipment: ["Trineo"], origin: "system", archived: false },
    { id: "2", name: "Remo", category: "estaciones", difficulty: "principiante", equipment: ["Remo"], origin: "system", archived: false },
    { id: "3", name: "Sentadilla con salto", category: "fuerza", difficulty: "avanzado", equipment: [], origin: "own", archived: false },
    { id: "4", name: "Rotación torácica", category: "movilidad", difficulty: "principiante", equipment: [], origin: "own", archived: true },
  ];
  const all = { query: "", category: "todas" as const, difficulty: "todas" as const, origin: "todos" as const };
  const ids = (r: LibraryItem[]) => r.map((e) => e.id);

  it("oculta archivados salvo en el filtro Archivados", () => {
    expect(ids(filterLibrary(items, all))).toEqual(["1", "2", "3"]);
    expect(ids(filterLibrary(items, { ...all, origin: "archivados" }))).toEqual(["4"]);
  });

  it("busca por nombre o equipo sin acentos", () => {
    expect(ids(filterLibrary(items, { ...all, query: "trineo" }))).toEqual(["1"]);
    expect(ids(filterLibrary(items, { ...all, query: "SENTADILLA" }))).toEqual(["3"]);
    expect(ids(filterLibrary(items, { ...all, query: "toracica", origin: "archivados" }))).toEqual(["4"]);
  });

  it("filtra por categoría, dificultad y origen", () => {
    expect(ids(filterLibrary(items, { ...all, category: "estaciones" }))).toEqual(["1", "2"]);
    expect(ids(filterLibrary(items, { ...all, difficulty: "principiante" }))).toEqual(["2"]);
    expect(ids(filterLibrary(items, { ...all, origin: "own" }))).toEqual(["3"]);
    expect(ids(filterLibrary(items, { ...all, origin: "system", category: "fuerza" }))).toEqual([]);
  });
});

describe("validateExercise", () => {
  const valid: ExerciseInput = {
    name: "Sled Push pesado",
    category: "estaciones",
    difficulty: "avanzado",
    instructions: "Empuja el trineo con pasos cortos y rápidos.",
    cue: "Pasos cortos",
    equipment: ["Trineo"],
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/watch?v=abc",
    substituteIds: ["00000000-0000-4000-8000-000000000005"],
  };

  it("acepta un ejercicio completo y uno mínimo sin medio", () => {
    expect(hasErrors(validateExercise(valid))).toBe(false);
    expect(hasErrors(validateExercise({ ...valid, cue: "", equipment: [], mediaType: "", mediaUrl: "", substituteIds: [] }))).toBe(false);
  });

  it("valida campos obligatorios y catálogos", () => {
    const e = validateExercise({ ...valid, name: "A", category: "cardio", difficulty: "experto", instructions: "corto", equipment: ["Cohete"] });
    expect(Object.keys(e).sort()).toEqual(["category", "difficulty", "equipment", "instructions", "name"]);
  });

  it("exige https y coherencia entre tipo y enlace", () => {
    expect(validateExercise({ ...valid, mediaUrl: "http://youtube.com/x" }).mediaUrl).toMatch(/https/);
    expect(validateExercise({ ...valid, mediaUrl: "javascript:alert(1)" }).mediaUrl).toBeDefined();
    expect(validateExercise({ ...valid, mediaUrl: "" }).mediaUrl).toBe("Pega el enlace del medio.");
    expect(validateExercise({ ...valid, mediaType: "", mediaUrl: "https://x.com/a" }).mediaType).toBeDefined();
    expect(validateExercise({ ...valid, mediaType: "audio" }).mediaType).toBeDefined();
  });

  it("limita sustituciones a 5 ids válidos y únicos", () => {
    const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    expect(validateExercise({ ...valid, substituteIds: [1, 2, 3, 4, 5, 6].map(id) }).substituteIds).toMatch(/máximo 5/);
    expect(validateExercise({ ...valid, substituteIds: [id(1), id(1)] }).substituteIds).toBeDefined();
    expect(validateExercise({ ...valid, substituteIds: ["no-uuid"] }).substituteIds).toBeDefined();
  });
});
