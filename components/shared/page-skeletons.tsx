import { LoadingState, Skeleton } from "@/components/ui/loading-state";

/**
 * Fallbacks de `<Suspense>` dentro de cada página (fase 14). La estructura de la
 * página (título, descripción, acciones estáticas) se renderiza fuera del
 * límite y aparece al instante en una navegación; aquí solo va la forma de lo
 * que está cargando, sin texto inventado.
 */

/** Encabezado cuyo título depende del usuario (p. ej. "Hola, Ana"). */
export function HeaderSkeleton({ description = true }: { description?: boolean }) {
  return (
    <div className="mb-6" aria-hidden>
      <Skeleton className="h-8 w-48" />
      {description && <Skeleton className="mt-2.5 h-4 w-72 max-w-full" />}
    </div>
  );
}

/** Contenido con datos: lista o tarjetas con esqueletos y texto para lectores de pantalla. */
export function ContentSkeleton({ label, rows = 3, variant = "list" }: { label: string; rows?: number; variant?: "list" | "cards" }) {
  return <LoadingState label={label} rows={rows} variant={variant} />;
}

/** Pantalla de detalle sin título estático (el título es el nombre del recurso). */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div>
      <HeaderSkeleton />
      <LoadingState label={label} rows={3} />
    </div>
  );
}

/** Texto en línea que depende de datos (p. ej. dentro de la descripción, que es un <p>). */
export function InlineSkeleton({ className = "w-56" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-4 max-w-full animate-pulse rounded-lg bg-surface-2 align-middle ${className}`} />;
}
