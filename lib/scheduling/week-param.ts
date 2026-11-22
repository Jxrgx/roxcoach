import { isDateKey, mondayOf } from "@/lib/scheduling/dates";

/** Lunes a mostrar según ?semana= (cualquier día válido se ajusta a su lunes). */
export function resolveWeekParam(param: string | string[] | undefined, today: string): string {
  const value = Array.isArray(param) ? param[0] : param;
  return value && isDateKey(value) ? mondayOf(value) : mondayOf(today);
}
