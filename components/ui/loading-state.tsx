import { cn } from "@/lib/utils/cn";

interface LoadingStateProps {
  /** Texto anunciado a lectores de pantalla. */
  label?: string;
  /** Número de filas esqueleto. */
  rows?: number;
  variant?: "list" | "cards";
  className?: string;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

/** Estado de carga con esqueletos que respetan la forma final del contenido. */
export function LoadingState({ label = "Cargando…", rows = 3, variant = "list", className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn("w-full", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className={cn(variant === "cards" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3")}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-3 h-3 w-4/5" />
            <Skeleton className="mt-2 h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { Skeleton };
