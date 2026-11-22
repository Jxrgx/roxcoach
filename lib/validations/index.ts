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

/* ---------- Nueva sesión (vista previa) ---------- */

export interface NewSessionInput {
  name: string;
  templateId: string;
  date: string;
}

export function validateNewSession(input: NewSessionInput): FieldErrors<keyof NewSessionInput> {
  const errors: FieldErrors<keyof NewSessionInput> = {};
  if (input.name.trim().length < 3) errors.name = "Dale un nombre a la sesión (mínimo 3 caracteres).";
  if (!input.templateId) errors.templateId = "Elige una plantilla o “Sesión en blanco”.";
  if (!input.date) errors.date = "Elige la fecha de la sesión.";
  return errors;
}

export function hasErrors<T extends string>(errors: FieldErrors<T>): boolean {
  return Object.keys(errors).length > 0;
}

/** Resultado estándar de una Server Action con validación por campo. */
export type ActionResult<K extends string> = { ok: true } | { ok: false; errors?: FieldErrors<K>; message?: string };
