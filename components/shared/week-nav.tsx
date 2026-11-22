import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysKey, formatWeekRange } from "@/lib/scheduling/dates";

/**
 * Navegación por semanas con enlaces (?semana=YYYY-MM-DD, lunes).
 * Botones de 44 px con nombre accesible; "Esta semana" solo si no es la actual.
 */
export function WeekNav({ basePath, monday, currentMonday }: { basePath: string; monday: string; currentMonday: string }) {
  const link = (key: string) => (key === currentMonday ? basePath : `${basePath}?semana=${key}`);
  const isCurrent = monday === currentMonday;
  return (
    <nav aria-label="Semanas" className="flex items-center gap-2">
      <Link
        href={link(addDaysKey(monday, -7))}
        aria-label="Semana anterior"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-muted/50"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <p className="min-w-0 flex-1 text-center text-sm font-semibold text-ink sm:flex-none sm:px-2" aria-live="polite">
        {isCurrent ? "Esta semana · " : ""}
        {formatWeekRange(monday)}
      </p>
      <Link
        href={link(addDaysKey(monday, 7))}
        aria-label="Semana siguiente"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-muted/50"
      >
        <ChevronRight aria-hidden className="size-5" />
      </Link>
      {!isCurrent && (
        <Link href={basePath} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-electric hover:underline">
          Hoy
        </Link>
      )}
    </nav>
  );
}
