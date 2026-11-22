import { parseDuration } from "@/lib/workouts/rules";
import { isDateKey } from "@/lib/scheduling/dates";

/**
 * Validaciones centralizadas (funciones puras).
 * Se usan en cliente para feedback inmediato y deberán reutilizarse en el
 * servidor cuando exista persistencia. Devuelven errores por campo.
 */

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/* ---------- Registro de serie (SetLogger) ---------- */

export interface SetResultInput {
  load: string;
  amount: string;
  rpe: string;
}

export interface SetResult {
  actualLoadKg?: number;
  actualAmount: number;
  rpe?: number;
}

export function validateSetResult(
  input: SetResultInput,
  options: { requiresLoad: boolean; amountLabel: string },
): { ok: true; value: SetResult } | { ok: false; errors: FieldErrors<keyof SetResultInput> } {
  const errors: FieldErrors<keyof SetResultInput> = {};

  const load = parseNumber(input.load);
  if (options.requiresLoad) {
    if (load === null) errors.load = "Ingresa la carga que usaste.";
    else if (Number.isNaN(load) || load < 0 || load > 500) errors.load = "La carga debe estar entre 0 y 500.";
  } else if (load !== null && (Number.isNaN(load) || load < 0 || load > 500)) {
    errors.load = "La carga debe estar entre 0 y 500.";
  }

  const amount = parseNumber(input.amount);
  if (amount === null) errors.amount = `Ingresa ${options.amountLabel.toLowerCase()} real.`;
  else if (Number.isNaN(amount) || amount <= 0 || amount > 100_000)
    errors.amount = `${options.amountLabel} debe ser un número mayor a 0.`;

  const rpe = parseNumber(input.rpe);
  if (rpe !== null && (Number.isNaN(rpe) || !Number.isInteger(rpe) || rpe < 1 || rpe > 10))
    errors.rpe = "El RPE va de 1 a 10.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      actualAmount: amount as number,
      ...(load !== null ? { actualLoadKg: load } : {}),
      ...(rpe !== null ? { rpe } : {}),
    },
  };
}

/* ---------- Acceso (sin autenticación funcional todavía) ---------- */

export interface LoginInput {
  email: string;
  password: string;
}

export function validateLogin(input: LoginInput): FieldErrors<keyof LoginInput> {
  const errors: FieldErrors<keyof LoginInput> = {};
  if (!input.email.trim()) errors.email = "Ingresa tu correo.";
  else if (!EMAIL_RE.test(input.email.trim())) errors.email = "Revisa el formato del correo.";
  if (!input.password) errors.password = "Ingresa tu contraseña.";
  return errors;
}

export interface RegisterInput extends LoginInput {
  name: string;
  role: string;
}

export function validateRegister(input: RegisterInput): FieldErrors<keyof RegisterInput> {
  const errors: FieldErrors<keyof RegisterInput> = validateLogin(input);
  if (input.name.trim().length < 2) errors.name = "Escribe tu nombre.";
  if (input.role !== "coach" && input.role !== "athlete") errors.role = "Elige si eres coach o atleta.";
  if (input.password && input.password.length < 8) errors.password = "Usa al menos 8 caracteres.";
  return errors;
}

/* ---------- Configuración del coach ---------- */

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const DISTANCE_UNITS = ["km", "mi"] as const;

export interface CoachSettingsInput {
  name: string;
  gym: string;
  weightUnit?: string;
  distanceUnit?: string;
}

export function validateCoachSettings(input: CoachSettingsInput): FieldErrors<keyof CoachSettingsInput> {
  const errors: FieldErrors<keyof CoachSettingsInput> = {};
  if (input.name.trim().length < 2) errors.name = "Escribe tu nombre.";
  else if (input.name.trim().length > 80) errors.name = "Usa máximo 80 caracteres.";
  if (input.gym.trim().length < 2) errors.gym = "Escribe el nombre del gimnasio.";
  else if (input.gym.trim().length > 80) errors.gym = "Usa máximo 80 caracteres.";
  if (input.weightUnit !== undefined && !(WEIGHT_UNITS as readonly string[]).includes(input.weightUnit))
    errors.weightUnit = "Elige kilogramos o libras.";
  if (input.distanceUnit !== undefined && !(DISTANCE_UNITS as readonly string[]).includes(input.distanceUnit))
    errors.distanceUnit = "Elige kilómetros o millas.";
  return errors;
}

/* ---------- Perfil del atleta ---------- */

export const HYROX_DIVISIONS = [
  "Open Men",
  "Open Women",
  "Pro Men",
  "Pro Women",
  "Doubles Men",
  "Doubles Women",
  "Doubles Mixed",
] as const;

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const EQUIPMENT_OPTIONS = [
  "Trineo",
  "SkiErg",
  "Remo",
  "Balón medicinal",
  "Kettlebells",
  "Sandbag",
  "Barra y discos",
  "Pista",
] as const;

export interface AthleteProfileInput extends SportsInfoInput {
  name: string;
  weightUnit: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? 1) - 1 && date.getUTCDate() === d;
}

/** Información deportiva: la editan el atleta y su coach (con relación activa). */
export interface SportsInfoInput {
  division: string;
  /** "YYYY-MM-DD" o vacío. */
  raceDate: string;
  availableDays: string[];
  equipment: string[];
}

export function validateSportsInfo(input: SportsInfoInput): FieldErrors<keyof SportsInfoInput> {
  const errors: FieldErrors<keyof SportsInfoInput> = {};
  if (input.division && !(HYROX_DIVISIONS as readonly string[]).includes(input.division))
    errors.division = "Elige una división HYROX válida.";
  if (input.raceDate && !isValidIsoDate(input.raceDate)) errors.raceDate = "Revisa la fecha de competencia.";
  if (input.availableDays.some((d) => !(WEEKDAYS as readonly string[]).includes(d)))
    errors.availableDays = "Hay un día no válido.";
  if (input.equipment.some((e) => !(EQUIPMENT_OPTIONS as readonly string[]).includes(e)))
    errors.equipment = "Hay un equipo no válido.";
  return errors;
}

export function validateAthleteProfile(input: AthleteProfileInput): FieldErrors<keyof AthleteProfileInput> {
  const errors: FieldErrors<keyof AthleteProfileInput> = { ...validateSportsInfo(input) };
  if (input.name.trim().length < 2) errors.name = "Escribe tu nombre.";
  else if (input.name.trim().length > 80) errors.name = "Usa máximo 80 caracteres.";
  if (!(WEIGHT_UNITS as readonly string[]).includes(input.weightUnit)) errors.weightUnit = "Elige kilogramos o libras.";
  return errors;
}

/* ---------- Invitaciones ---------- */

export interface InvitationInput {
  email: string;
  /** Opcional: ayuda al coach a reconocer la invitación. */
  name: string;
}

export function validateInvitation(input: InvitationInput): FieldErrors<keyof InvitationInput> {
  const errors: FieldErrors<keyof InvitationInput> = {};
  const email = input.email.trim();
  if (!email) errors.email = "Escribe el correo del atleta.";
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Revisa el formato del correo.";
  if (input.name.trim().length > 80) errors.name = "Usa máximo 80 caracteres.";
  return errors;
}

export function hasErrors<T extends string>(errors: FieldErrors<T>): boolean {
  return Object.keys(errors).length > 0;
}

/** Resultado estándar de una Server Action con validación por campo. */
export type ActionResult<K extends string> = { ok: true } | { ok: false; errors?: FieldErrors<K>; message?: string };

/* ---------- Biblioteca de ejercicios ---------- */

const EXERCISE_CATEGORY_VALUES = ["carrera", "estaciones", "fuerza", "movilidad"];
const EXERCISE_DIFFICULTY_VALUES = ["principiante", "intermedio", "avanzado"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ExerciseInput {
  name: string;
  category: string;
  difficulty: string;
  instructions: string;
  cue: string;
  equipment: string[];
  /** "" (sin medio) | "video" | "imagen". */
  mediaType: string;
  mediaUrl: string;
  /** Ids en orden de preferencia (máx. 5). */
  substituteIds: string[];
}

export function validateExercise(input: ExerciseInput): FieldErrors<keyof ExerciseInput> {
  const errors: FieldErrors<keyof ExerciseInput> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Escribe el nombre del ejercicio.";
  else if (name.length > 80) errors.name = "Usa máximo 80 caracteres.";
  if (!EXERCISE_CATEGORY_VALUES.includes(input.category)) errors.category = "Elige una categoría.";
  if (!EXERCISE_DIFFICULTY_VALUES.includes(input.difficulty)) errors.difficulty = "Elige una dificultad.";
  const instructions = input.instructions.trim();
  if (instructions.length < 10) errors.instructions = "Describe cómo se ejecuta (mínimo 10 caracteres).";
  else if (instructions.length > 2000) errors.instructions = "Usa máximo 2000 caracteres.";
  if (input.cue.trim().length > 140) errors.cue = "Usa máximo 140 caracteres.";
  if (input.equipment.some((e) => !(EQUIPMENT_OPTIONS as readonly string[]).includes(e)) || new Set(input.equipment).size !== input.equipment.length)
    errors.equipment = "Hay un equipo no válido.";

  const url = input.mediaUrl.trim();
  if (input.mediaType === "") {
    if (url) errors.mediaType = "Elige si el enlace es un video o una imagen.";
  } else if (input.mediaType !== "video" && input.mediaType !== "imagen") {
    errors.mediaType = "Elige video o imagen.";
  } else if (!url) {
    errors.mediaUrl = "Pega el enlace del medio.";
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "https:" || /\s/.test(url)) errors.mediaUrl = "Usa un enlace completo que empiece con https://";
    else if (url.length > 500) errors.mediaUrl = "El enlace es demasiado largo.";
  }

  if (input.substituteIds.length > 5) errors.substituteIds = "Elige como máximo 5 sustituciones.";
  else if (input.substituteIds.some((id) => !UUID_PATTERN.test(id)) || new Set(input.substituteIds).size !== input.substituteIds.length)
    errors.substituteIds = "Hay sustituciones no válidas.";
  return errors;
}

/* ---------- Plantillas de entrenamiento ---------- */

export interface BlockExerciseInput {
  /** Clave local estable para React (no se guarda). */
  key: string;
  exerciseId: string;
  sets: string;
  targetType: string;
  /** Repeticiones, metros o "mm:ss" según targetType. */
  target: string;
  /** En la unidad del coach (kg o lb); vacío = sin carga. */
  load: string;
  /** Segundos o "mm:ss"; vacío = sin descanso indicado. */
  rest: string;
  notes: string;
}

export interface BlockInput {
  key: string;
  name: string;
  notes: string;
  exercises: BlockExerciseInput[];
}

export interface TemplateInput {
  name: string;
  focus: string;
  intensity: string;
  /** Minutos; vacío permitido solo en borrador. */
  estimatedMinutes: string;
  blocks: BlockInput[];
}

/** Errores por ruta: "name", "blocks.0.name", "blocks.0.exercises.1.target"… */
export type TemplateErrors = Record<string, string>;

function parseIntStrict(raw: string): number | null {
  const v = raw.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

function parseDecimal(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}

/**
 * Valida la plantilla. Un borrador solo exige nombre válido y que lo que sí
 * se capturó sea correcto; para publicar además debe estar completa.
 */
export function validateTemplate(input: TemplateInput, opts: { publish: boolean; weightUnit: "kg" | "lb" }): TemplateErrors {
  const errors: TemplateErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Escribe el nombre de la plantilla.";
  else if (name.length > 80) errors.name = "Usa máximo 80 caracteres.";
  if (input.focus.trim().length > 140) errors.focus = "Usa máximo 140 caracteres.";
  if (!["baja", "media", "alta"].includes(input.intensity)) errors.intensity = "Elige la intensidad.";

  if (input.estimatedMinutes.trim() === "") {
    if (opts.publish) errors.estimatedMinutes = "Indica la duración estimada para publicar.";
  } else {
    const minutes = parseIntStrict(input.estimatedMinutes);
    if (minutes === null || minutes < 5 || minutes > 300) errors.estimatedMinutes = "Entre 5 y 300 minutos.";
  }

  if (input.blocks.length > 20) errors.blocks = "Máximo 20 bloques.";
  if (opts.publish && input.blocks.length === 0) errors.blocks = "Agrega al menos un bloque para publicar.";

  const maxLoad = opts.weightUnit === "lb" ? 1100 : 500;
  input.blocks.forEach((block, b) => {
    const bp = `blocks.${b}`;
    const blockName = block.name.trim();
    if (blockName.length < 1) errors[`${bp}.name`] = "Ponle nombre al bloque.";
    else if (blockName.length > 60) errors[`${bp}.name`] = "Usa máximo 60 caracteres.";
    if (block.notes.trim().length > 280) errors[`${bp}.notes`] = "Usa máximo 280 caracteres.";
    if (block.exercises.length > 30) errors[`${bp}.exercises`] = "Máximo 30 ejercicios por bloque.";
    if (opts.publish && block.exercises.length === 0) errors[`${bp}.exercises`] = "Agrega al menos un ejercicio a este bloque para publicar.";

    block.exercises.forEach((ex, e) => {
      const ep = `${bp}.exercises.${e}`;
      if (!UUID_PATTERN.test(ex.exerciseId)) errors[`${ep}.exerciseId`] = "Elige un ejercicio válido.";
      const sets = parseIntStrict(ex.sets);
      if (sets === null || sets < 1 || sets > 50) errors[`${ep}.sets`] = "Entre 1 y 50 series.";

      if (ex.targetType === "reps") {
        const reps = parseIntStrict(ex.target);
        if (reps === null || reps < 1 || reps > 1000) errors[`${ep}.target`] = "Entre 1 y 1000 repeticiones.";
      } else if (ex.targetType === "distance") {
        const meters = parseIntStrict(ex.target);
        if (meters === null || meters < 1 || meters > 100000) errors[`${ep}.target`] = "Distancia en metros (1 a 100 000).";
      } else if (ex.targetType === "time") {
        const seconds = parseDuration(ex.target);
        if (seconds === null || seconds < 1 || seconds > 36000) errors[`${ep}.target`] = "Tiempo en mm:ss (por ejemplo 1:30).";
      } else {
        errors[`${ep}.targetType`] = "Elige el tipo de objetivo.";
      }

      if (ex.load.trim() !== "") {
        const load = parseDecimal(ex.load);
        if (load === null || load <= 0 || load > maxLoad) errors[`${ep}.load`] = `Carga entre 0 y ${maxLoad} ${opts.weightUnit}.`;
      }
      if (ex.rest.trim() !== "") {
        const rest = parseDuration(ex.rest);
        if (rest === null || rest > 3600) errors[`${ep}.rest`] = "Descanso en segundos o mm:ss (máx. 60:00).";
      }
      if (ex.notes.trim().length > 140) errors[`${ep}.notes`] = "Usa máximo 140 caracteres.";
    });
  });
  return errors;
}

/* ---------- Programación de sesiones ---------- */

export interface SessionDetailsInput {
  /** "YYYY-MM-DD". */
  date: string;
  /** "" o "HH:MM" (24 h). */
  time: string;
  title: string;
  notes: string;
}

export interface ScheduleInput extends SessionDetailsInput {
  templateId: string;
  athleteIds: string[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;


/** Fecha, hora, título y notas. `today` y `maxDate` en "YYYY-MM-DD" (zona de la app). */
export function validateSessionDetails(
  input: SessionDetailsInput,
  opts: { today: string; maxDate: string },
): FieldErrors<keyof SessionDetailsInput> {
  const errors: FieldErrors<keyof SessionDetailsInput> = {};
  if (!isDateKey(input.date)) errors.date = "Elige la fecha de la sesión.";
  else if (input.date < opts.today) errors.date = "La fecha no puede ser anterior a hoy.";
  else if (input.date > opts.maxDate) errors.date = "Programa con máximo un año de anticipación.";
  if (input.time.trim() !== "" && !TIME_RE.test(input.time.trim())) errors.time = "Usa el formato de 24 horas (por ejemplo 07:00).";
  const title = input.title.trim();
  if (title.length < 2) errors.title = "Escribe el título de la sesión.";
  else if (title.length > 80) errors.title = "Usa máximo 80 caracteres.";
  if (input.notes.trim().length > 500) errors.notes = "Usa máximo 500 caracteres.";
  return errors;
}

export function validateSchedule(input: ScheduleInput, opts: { today: string; maxDate: string }): FieldErrors<keyof ScheduleInput> {
  const errors: FieldErrors<keyof ScheduleInput> = validateSessionDetails(input, opts);
  if (!UUID_PATTERN.test(input.templateId)) errors.templateId = "Elige una plantilla publicada.";
  if (input.athleteIds.length === 0) errors.athleteIds = "Elige al menos un atleta.";
  else if (input.athleteIds.length > 50) errors.athleteIds = "Máximo 50 atletas por sesión.";
  else if (input.athleteIds.some((id) => !UUID_PATTERN.test(id)) || new Set(input.athleteIds).size !== input.athleteIds.length)
    errors.athleteIds = "Hay atletas no válidos.";
  return errors;
}
