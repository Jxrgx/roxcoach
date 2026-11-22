import type { ReactNode } from "react";
import { requireAthlete, requireCoach } from "@/lib/auth/session";
import { LoadingState, Skeleton } from "@/components/ui/loading-state";

/**
 * Verificación de rol en servidor antes de mostrar el contenido de un área.
 * Complementa a proxy.ts: aunque el proxy redirige rápido, la decisión
 * definitiva se toma aquí contra la tabla `profiles`.
 */
export async function CoachGate({ children }: { children: ReactNode }) {
  await requireCoach();
  return <>{children}</>;
}

export async function AthleteGate({ children }: { children: ReactNode }) {
  await requireAthlete();
  return <>{children}</>;
}

/** Fallback mientras se verifica la sesión (forma similar al contenido final). */
export function AreaSkeleton() {
  return (
    <div>
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-72 max-w-full" />
      <LoadingState label="Verificando tu sesión…" rows={3} />
    </div>
  );
}
