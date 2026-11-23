"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

/**
 * Registra el service worker (solo en producción) y muestra brevemente si se
 * está instalando o actualizando. El SW nuevo toma el control solo
 * (skipWaiting + clients.claim) sin recargar la página: nunca interrumpe un
 * entrenamiento. Arriba y sin bloquear: no tapa las acciones principales.
 */
export function PwaRegister() {
  const [status, setStatus] = useState<null | "installing" | "updating">(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const track = (worker: ServiceWorker | null) => {
      if (!worker || cancelled) return;
      setStatus(navigator.serviceWorker.controller ? "updating" : "installing");
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated" || worker.state === "redundant") setStatus(null);
      });
    };
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        track(reg.installing);
        reg.addEventListener("updatefound", () => track(reg.installing));
      })
      .catch(() => {
        /* sin SW la app funciona igual (solo sin recarga offline) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;
  const Icon = status === "updating" ? RefreshCw : Download;
  return (
    <p
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-2 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-electric/40 bg-surface px-3 py-1.5 text-sm text-ink shadow-card"
    >
      <Icon aria-hidden className="size-4 shrink-0 animate-spin text-electric" />
      {status === "updating" ? "Actualizando la app…" : "Instalando modo sin conexión…"}
    </p>
  );
}
