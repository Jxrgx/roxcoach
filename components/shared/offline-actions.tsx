"use client";

import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { openExecutionStore } from "@/lib/offline/idb";
import { ButtonLink } from "@/components/ui/button";
import { RetryButton } from "@/components/shared/retry-button";

/**
 * Acciones de la página sin conexión, con UNA sola principal: abrir el
 * entrenamiento guardado en este dispositivo (del último usuario) si existe;
 * si no, reintentar. El service worker abre la ejecución con el shell offline,
 * que la restaura desde IndexedDB.
 */
export function OfflineActions() {
  const [saved, setSaved] = useState<{ sessionId: string; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void openExecutionStore().then(async (store) => {
      const user = await store.getLastUser();
      const latest = user ? (await store.listSessionCopies(user))[0] : undefined;
      if (!cancelled && latest) setSaved({ sessionId: latest.sessionId, title: latest.title });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {saved && (
        <ButtonLink href={`/atleta/sesiones/${saved.sessionId}/ejecutar`} icon={<HardDrive aria-hidden className="size-4" />}>
          Abrir entrenamiento guardado: {saved.title}
        </ButtonLink>
      )}
      <RetryButton variant={saved ? "secondary" : "primary"} />
      <ButtonLink href="/atleta/sesiones" variant="ghost">
        Ir a mi entrenamiento
      </ButtonLink>
    </div>
  );
}
