"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { openExecutionStore } from "@/lib/offline/idb";
import { decideRestore, sessionIdFromPath, type RestoreDecision } from "@/lib/offline/restore";
import { Button, ButtonLink } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { StateMessage } from "@/components/ui/state-message";
import { ExecutionScreen } from "@/components/athlete/execution-screen";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ruta de la ejecución que se pidió: el service worker redirige aquí con
 * ?sesion=<id> (la URL coincide con esta página; el router no se desfasa).
 */
function originalPath(): string {
  const id = new URLSearchParams(window.location.search).get("sesion") ?? "";
  return UUID_RE.test(id) ? `/atleta/sesiones/${id.toLowerCase()}/ejecutar` : window.location.pathname;
}

const NONE_MESSAGE: Record<Extract<RestoreDecision, { kind: "none" }>["reason"], string> = {
  "not-execution": "Esta pantalla solo restaura un entrenamiento que abriste en este dispositivo.",
  "no-user": "No hay un entrenamiento guardado en este dispositivo. Conéctate para abrir tu sesión.",
  "no-copy": "Esta sesión no está guardada en este dispositivo. Conéctate para abrirla.",
};

/**
 * Shell de la ejecución sin red (fase 12). El service worker redirige aquí cuando
 * falla la recarga de /atleta/sesiones/[id]/ejecutar; aquí no hay datos del
 * servidor: todo sale de IndexedDB (copia local + cola) y solo si pertenece al
 * último usuario que abrió esa sesión. Al volver la red se recarga la ruta real.
 */
export function OfflineExecution() {
  const [decision, setDecision] = useState<RestoreDecision | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await openExecutionStore();
      const pathname = originalPath();
      const sessionId = sessionIdFromPath(pathname);
      const lastUser = await store.getLastUser();
      const copy = sessionId && lastUser ? await store.getSessionCopy(lastUser, sessionId) : null;
      const ops = sessionId && lastUser ? await store.listOps(lastUser, sessionId) : [];
      if (!cancelled) setDecision(decideRestore({ pathname, lastUser, copy, ops }));
    })();
    // Con red otra vez: la ruta real carga del servidor y su cola envía lo pendiente (idempotente).
    const onOnline = () => window.location.replace(originalPath());
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!decision) return <LoadingState label="Buscando tu entrenamiento en este dispositivo…" />;

  if (decision.kind === "none") {
    return (
      <StateMessage
        tone="warning"
        icon={<WifiOff />}
        title="Sin conexión"
        description={NONE_MESSAGE[decision.reason]}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button icon={<RefreshCw aria-hidden className="size-4" />} onClick={() => window.location.replace(originalPath())}>
              Reintentar
            </Button>
            <ButtonLink href="/atleta/inicio" variant="secondary">
              Ir al inicio
            </ButtonLink>
          </div>
        }
      />
    );
  }

  const { copy } = decision;
  return (
    <ExecutionScreen
      restored
      sessionId={copy.sessionId}
      userId={copy.userId}
      title={copy.title}
      snapshot={copy.snapshot}
      unit={copy.unit}
      log={{ startedAt: new Date(copy.log.startedAt), pausedAt: copy.log.pausedAt ? new Date(copy.log.pausedAt) : null, pausedSeconds: copy.log.pausedSeconds }}
      sets={copy.sets}
      serverNow={new Date().getTime()}
    />
  );
}
