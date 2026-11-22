"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/utils/use-online";

/** Aviso persistente cuando el dispositivo pierde conexión. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span>Sin conexión. Verás la última información disponible.</span>
    </div>
  );
}
