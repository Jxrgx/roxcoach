import { normalizeSearch } from "@/lib/utils/format";

/**
 * Biblioteca de ejercicios: catálogos, permisos y filtros (funciones puras).
 * La base de datos además garantiza propiedad de sustituciones, https y
 * longitudes (migración add_exercises).
 */

export const EXERCISE_CATEGORIES = ["carrera", "estaciones", "fuerza", "movilidad"] as const;
export type ExerciseCategoryValue = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ExerciseCategoryValue, string> = {
  carrera: "Carrera",
  estaciones: "Estaciones HYROX",
  fuerza: "Fuerza",
  movilidad: "Movilidad",
};

export const EXERCISE_DIFFICULTIES = ["principiante", "intermedio", "avanzado"] as const;
export type ExerciseDifficultyValue = (typeof EXERCISE_DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<ExerciseDifficultyValue, string> = {
  principiante: "Principiante",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

export const MEDIA_TYPES = ["video", "imagen"] as const;
export type MediaTypeValue = (typeof MEDIA_TYPES)[number];

export const MAX_SUBSTITUTIONS = 5;

/* ---------- Propiedad y permisos ---------- */

export interface ExerciseOwnership {
  /** null = ejercicio del sistema. */
  coachId: string | null;
  archived: boolean;
}

export type ExerciseOrigin = "system" | "own";

export function exerciseOrigin(e: Pick<ExerciseOwnership, "coachId">): ExerciseOrigin {
  return e.coachId === null ? "system" : "own";
}

/** Un coach ve los del sistema y los suyos (también sus archivados). */
export function coachCanView(e: ExerciseOwnership, coachId: string): boolean {
  return e.coachId === null || e.coachId === coachId;
}

/** Solo el propietario edita, archiva o restaura. Los del sistema, nadie. */
export function coachCanEdit(e: ExerciseOwnership, coachId: string): boolean {
  return e.coachId !== null && e.coachId === coachId;
}

/** Solo los del sistema se duplican como propios. */
export function coachCanDuplicate(e: ExerciseOwnership): boolean {
  return e.coachId === null;
}

/** El atleta consulta los del sistema y los de su coach actual (no archivados). */
export function athleteCanView(e: ExerciseOwnership, currentCoachId: string | null): boolean {
  if (e.archived) return false;
  return e.coachId === null || (currentCoachId !== null && e.coachId === currentCoachId);
}

/* ---------- Sustituciones ---------- */

export type SubstitutionError = "too-many" | "self" | "duplicate" | "not-available";

/**
 * Valida la lista de sustituciones de un ejercicio.
 * `available` = ids que el coach puede usar (sistema + propios, no archivados).
 */
export function checkSubstitutions(
  substituteIds: string[],
  opts: { exerciseId?: string; available: ReadonlySet<string> },
): SubstitutionError | null {
  if (substituteIds.length > MAX_SUBSTITUTIONS) return "too-many";
  if (new Set(substituteIds).size !== substituteIds.length) return "duplicate";
  if (opts.exerciseId && substituteIds.includes(opts.exerciseId)) return "self";
  if (substituteIds.some((id) => !opts.available.has(id))) return "not-available";
  return null;
}

export const SUBSTITUTION_ERROR_MESSAGE: Record<SubstitutionError, string> = {
  "too-many": `Elige como máximo ${MAX_SUBSTITUTIONS} sustituciones.`,
  self: "Un ejercicio no puede sustituirse por sí mismo.",
  duplicate: "Hay sustituciones repetidas.",
  "not-available": "Alguna sustitución ya no está disponible. Revisa la lista.",
};

/* ---------- Medios por URL ---------- */

/** Dominio legible de una URL https ("youtube.com"), o null si no es válida. */
export function mediaHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* ---------- Filtros de la biblioteca ---------- */

export type OriginFilter = "todos" | "system" | "own" | "archivados";

export interface LibraryItem {
  id: string;
  name: string;
  category: ExerciseCategoryValue;
  difficulty: ExerciseDifficultyValue;
  equipment: string[];
  origin: ExerciseOrigin;
  archived: boolean;
}

/**
 * Filtra por texto (nombre o equipo, sin acentos), categoría, dificultad y
 * origen. Los archivados solo aparecen con el filtro "archivados".
 */
export function filterLibrary<T extends LibraryItem>(
  items: T[],
  f: { query: string; category: ExerciseCategoryValue | "todas"; difficulty: ExerciseDifficultyValue | "todas"; origin: OriginFilter },
): T[] {
  const q = normalizeSearch(f.query);
  return items.filter((e) => {
    if (f.origin === "archivados" ? !e.archived : e.archived) return false;
    if (f.origin === "system" && e.origin !== "system") return false;
    if (f.origin === "own" && e.origin !== "own") return false;
    if (f.category !== "todas" && e.category !== f.category) return false;
    if (f.difficulty !== "todas" && e.difficulty !== f.difficulty) return false;
    return q === "" || normalizeSearch(`${e.name} ${e.equipment.join(" ")}`).includes(q);
  });
}
