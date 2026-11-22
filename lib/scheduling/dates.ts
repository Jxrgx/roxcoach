/**
 * Fechas de calendario como claves "YYYY-MM-DD" (sin hora ni zona horaria).
 * "Hoy" se calcula en la zona horaria de la app; el resto es aritmética pura
 * sobre fechas UTC para evitar desfases.
 */

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): boolean {
  if (!KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Fecha de hoy en una zona horaria ("America/Mexico_City" → "2026-11-24"). */
export function todayKey(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtc(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = toUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Lunes de la semana que contiene la fecha. */
export function mondayOf(key: string): string {
  const d = toUtc(key);
  const offset = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return addDaysKey(key, -offset);
}

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export interface WeekDayKey {
  key: string;
  label: (typeof WEEKDAY_LABELS)[number];
  dayOfMonth: number;
  isToday: boolean;
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `monday`. */
export function weekDays(monday: string, today: string): WeekDayKey[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const key = addDaysKey(monday, i);
    return { key, label, dayOfMonth: Number(key.slice(8, 10)), isToday: key === today };
  });
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

const LOCALE = "es-MX";

/** "Lunes, 24 de noviembre" (con mayúscula inicial). */
export function formatKeyLong(key: string): string {
  const text = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(toUtc(key));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "24 nov" / "24 nov 2027" si es de otro año que `reference`. */
export function formatKeyShort(key: string, reference?: string): string {
  const sameYear = reference ? reference.slice(0, 4) === key.slice(0, 4) : true;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" })
    .format(toUtc(key))
    .replace(".", "");
}

/** "Hoy", "Mañana", "Ayer" o la fecha corta con día de la semana. */
export function relativeDayKey(key: string, today: string): string {
  const d = diffDays(today, key);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d === -1) return "Ayer";
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" }).format(toUtc(key)).replace(".", "");
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${formatKeyShort(key, today)}`;
}

/** Rango "24 – 30 nov" de una semana. */
export function formatWeekRange(monday: string): string {
  const sunday = addDaysKey(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return sameMonth ? `${Number(monday.slice(8, 10))} – ${formatKeyShort(sunday)}` : `${formatKeyShort(monday)} – ${formatKeyShort(sunday)}`;
}
