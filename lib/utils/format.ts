import type { Intensity } from "@/lib/types/domain";

const LOCALE = "es-MX";

/** "65 min" o "1 h 20 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Segundos a "mm:ss" o "h:mm:ss". */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "sábado, 21 de noviembre". */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "21 nov 2026". */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "");
}

/** "2026-11-21" en hora local (no UTC), para atributos `dateTime`. */
export function toLocalDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Diferencia en días naturales entre dos fechas (ignora la hora). */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export interface WeekDay {
  date: Date;
  /** Distancia en días desde hoy. */
  offset: number;
  label: (typeof WEEKDAY_SHORT)[number];
  dayOfMonth: number;
  isToday: boolean;
}

/** Semana de lunes a domingo que contiene `today`. */
export function getWeek(today: Date): WeekDay[] {
  const mondayIndex = (today.getDay() + 6) % 7; // 0 = lunes
  return WEEKDAY_SHORT.map((label, i) => {
    const offset = i - mondayIndex;
    const date = addDays(today, offset);
    return { date, offset, label, dayOfMonth: date.getDate(), isToday: offset === 0 };
  });
}

/** Texto relativo corto para un offset de días. */
export function relativeDayLabel(offset: number): string {
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Mañana";
  if (offset === -1) return "Ayer";
  if (offset > 1) return `En ${offset} días`;
  return `Hace ${Math.abs(offset)} días`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const INTENSITY_LABEL: Record<Intensity, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Días naturales desde `today` hasta `isoDate` ("YYYY-MM-DD"). null si no hay fecha o ya pasó. */
export function daysUntil(isoDate: string, today: Date): number | null {
  if (!isoDate) return null;
  const diff = Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${toLocalDateKey(today)}T00:00:00Z`)) / 86_400_000);
  return Number.isNaN(diff) || diff < 0 ? null : diff;
}
