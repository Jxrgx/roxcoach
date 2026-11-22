"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { ButtonLink } from "@/components/ui/button";

/** Contenido compartido por los archivos `error.tsx` de cada área. */
export function RouteError({ error, retry, homeHref }: { error: unknown; retry: () => void; homeHref: string }) {
  useEffect(() => {
    // Punto único para enviar errores a un servicio de monitoreo en el futuro.
    console.error(error);
  }, [error]);

  return (
    <div className="py-6">
      <ErrorState
        title="Algo salió mal al mostrar esta pantalla"
        description="No perdiste nada de lo que ya estaba guardado. Intenta de nuevo o vuelve al inicio."
        onRetry={retry}
        extraAction={
          <ButtonLink href={homeHref} variant="ghost">
            Volver al inicio
          </ButtonLink>
        }
      />
    </div>
  );
}
