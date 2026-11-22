"use client";

import { addDays, formatLongDate, formatShortDate, toLocalDateKey } from "@/lib/utils/format";
import { useToday } from "@/lib/utils/use-today";

/** Fecha de hoy en el dispositivo del usuario ("Sábado, 21 de noviembre"). */
export function TodayLabel({ fallback = "Hoy" }: { fallback?: string }) {
  const today = useToday();
  if (!today) return <span>{fallback}</span>;
  const text = formatLongDate(today);
  return <time dateTime={toLocalDateKey(today)}>{text.charAt(0).toUpperCase() + text.slice(1)}</time>;
}

/** Fecha calculada a partir de hoy + `offsetDays` ("8 ene 2027"). */
export function RelativeDate({ offsetDays, fallback }: { offsetDays: number; fallback: string }) {
  const today = useToday();
  if (!today) return <span>{fallback}</span>;
  const date = addDays(today, offsetDays);
  return <time dateTime={toLocalDateKey(date)}>{formatShortDate(date)}</time>;
}
