"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Lock, WifiOff } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateMessage
      tone="warning"
      icon={<WifiOff />}
      title="Sin conexión"
      description="No pudimos actualizar la información. Cuando vuelvas a tener conexión, la cargaremos de nuevo."
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    />
  );
}

export function ForbiddenState({ description }: { description?: string }) {
  return (
    <StateMessage
      tone="info"
      icon={<Lock />}
      title="No tienes acceso a esta sección"
      description={description ?? "Pide a tu coach o al administrador del gimnasio que te dé permiso."}
    />
  );
}

export const PREVIEW_STATES = ["cargando", "vacio", "error", "sin-conexion", "sin-permisos"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

export interface ScreenStatesProps {
  /** Contenido con datos (estado normal). */
  children: ReactNode;
  empty: { title: string; description?: string; action?: ReactNode };
  loadingLabel?: string;
  loadingVariant?: "list" | "cards";
  errorTitle?: string;
}

function StateSwitch({ children, empty, loadingLabel, loadingVariant, errorTitle }: ScreenStatesProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = params.get("estado") as PreviewState | null;
  const clear = () => router.replace(pathname);

  switch (state) {
    case "cargando":
      return <LoadingState label={loadingLabel} variant={loadingVariant} />;
    case "vacio":
      return <EmptyState {...empty} />;
    case "error":
      return <ErrorState title={errorTitle} onRetry={clear} />;
    case "sin-conexion":
      return <OfflineState onRetry={clear} />;
    case "sin-permisos":
      return <ForbiddenState />;
    default:
      return <>{children}</>;
  }
}

/**
 * Contenedor de estados de una pantalla con datos dinámicos.
 *
 * Mientras no exista backend, el estado se puede previsualizar con
 * `?estado=cargando|vacio|error|sin-conexion|sin-permisos`. Cuando haya datos
 * reales, este componente recibirá el estado desde la capa de datos.
 *
 * El fallback de Suspense es el propio contenido para que el HTML
 * prerenderizado muestre los datos y no un esqueleto.
 */
export function ScreenStates(props: ScreenStatesProps) {
  return (
    <Suspense fallback={props.children}>
      <StateSwitch {...props} />
    </Suspense>
  );
}
