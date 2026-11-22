import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "neutral" | "acid" | "info" | "positive" | "warning" | "danger";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  acid: "bg-acid/10 text-acid border-acid/30",
  info: "bg-electric/10 text-electric border-electric/30",
  positive: "bg-positive/10 text-positive border-positive/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
};

/**
 * Etiqueta de estado. Siempre lleva texto (y opcionalmente icono) para no
 * depender únicamente del color.
 */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        "[&>svg]:size-3.5",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
