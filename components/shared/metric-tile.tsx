import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface MetricTileProps {
  label: string;
  value: string;
  /** Contexto del valor: "de 45 planeadas", "Jorge M.". */
  context?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Métrica individual: etiqueta, valor contundente y contexto. */
export function MetricTile({ label, value, context, icon, children, className }: MetricTileProps) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      <dt className="flex items-center gap-2 text-sm text-muted">
        {icon && (
          <span aria-hidden className="text-muted [&>svg]:size-4">
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd className="mt-2">
        <span className="block text-3xl font-bold tracking-tight tabular-nums text-ink sm:text-4xl">{value}</span>
        {context && <span className="mt-1 block text-sm text-muted">{context}</span>}
        {children}
      </dd>
    </div>
  );
}
