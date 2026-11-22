/**
 * Modelo de dominio de RoxCoach (solo tipos; sin persistencia en esta fase).
 *
 * Separación obligatoria (CLAUDE.md):
 *   Ejercicio → Plantilla → Sesión programada → Asignación → Registro realizado
 *
 * Lo planeado (Plantilla / Sesión / Asignación) nunca se sobrescribe con lo
 * realizado (Registro). Los resultados reales viven en `SetLog`.
 */

export type Role = "coach" | "athlete";

export type HyroxDivision =
  | "Open Men"
  | "Open Women"
  | "Pro Men"
  | "Pro Women"
  | "Doubles Men"
  | "Doubles Women"
  | "Doubles Mixed";

export type Intensity = "baja" | "media" | "alta";

export type ExerciseCategory = "carrera" | "estaciones" | "fuerza" | "movilidad";

export type WeightUnit = "kg" | "lb";
export type DistanceUnit = "km" | "mi";

/** Estado de una sesión desde la perspectiva de su ejecución. */
export type SessionStatus = "programada" | "en_curso" | "completada" | "omitida" | "descanso";

export type TemplateStatus = "publicada" | "borrador" | "archivada";

export type AthleteStatus = "activo" | "pendiente" | "en_pausa";

/** Prescripción planeada de una serie. Todos los campos son objetivos. */
export interface PlannedSet {
  reps?: number;
  distanceMeters?: number;
  loadKg?: number;
  durationSeconds?: number;
  restSeconds?: number;
}

/** Resultado real registrado por el atleta. Nunca reemplaza a PlannedSet. */
export interface SetLog {
  actualReps?: number;
  actualDistanceMeters?: number;
  actualLoadKg?: number;
  actualDurationSeconds?: number;
  rpe?: number;
  note?: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string[];
  /** Duración del video demostrativo, si existe. */
  videoDurationSeconds?: number;
  cue: string;
}

export interface BlockExercise {
  exerciseId: string;
  name: string;
  prescription: string;
}

export interface WorkoutBlock {
  id: string;
  name: string;
  summary: string;
  exercises: BlockExercise[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  focus: string;
  durationMinutes: number;
  intensity: Intensity;
  blocks: WorkoutBlock[];
  equipment: string[];
  status: TemplateStatus;
  timesAssigned: number;
}

/**
 * Sesión programada en un plan semanal relativo.
 * `dayOffset` es la distancia en días desde hoy (0 = hoy, -1 = ayer).
 * Se usa offset para que los datos ficticios siempre parezcan actuales.
 */
export interface ScheduledSession {
  id: string;
  templateId: string;
  name: string;
  dayOffset: number;
  time: string;
  durationMinutes: number;
  intensity: Intensity;
  blockCount: number;
  athleteIds: string[];
  status: SessionStatus;
}

export interface Athlete {
  id: string;
  name: string;
  division: HyroxDivision;
  status: AthleteStatus;
  /** Porcentaje de sesiones completadas en las últimas 4 semanas. */
  adherence: number;
  nextSessionLabel: string | null;
  raceInDays: number | null;
}

export interface Coach {
  id: string;
  name: string;
  gym: string;
  email: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}
