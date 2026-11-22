import type { Intensity as Level } from "@/lib/types/domain";
import { INTENSITY_LABEL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const LEVEL: Record<Level, number> = { baja: 1, media: 2, alta: 3 };
const COLOR: Record<Level, string> = { baja: "bg-positive", media: "bg-warning", alta: "bg-danger" };

/** Indicador de intensidad: barras + texto. */
export function Intensity({ level, className }: { level: Level; className?: string }) {
  const filled = LEVEL[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-ink", className)}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn("w-1 rounded-sm", n <= filled ? COLOR[level] : "bg-line")}
            style={{ height: `${4 + n * 3}px` }}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Intensidad </span>
        {INTENSITY_LABEL[level]}
      </span>
    </span>
  );
}
