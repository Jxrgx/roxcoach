import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { OfflineActions } from "@/components/shared/offline-actions";
import { StateMessage } from "@/components/ui/state-message";

export const metadata: Metadata = { title: "Sin conexión", robots: { index: false, follow: false } };

/**
 * Página offline ESTÁTICA (fase 12): el service worker la sirve cuando se pide
 * sin red una ruta que no está disponible sin conexión. No contiene datos.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-10">
      <header className="mb-6 flex h-11 items-center">
        <Logo />
      </header>
      <main id="contenido" className="outline-none">
        <h1 className="sr-only">Sin conexión</h1>
        <StateMessage
          tone="warning"
          icon={<WifiOff />}
          title="Esta pantalla necesita conexión"
          description="No hay red en este momento. Si estabas entrenando, vuelve a abrir tu entrenamiento: lo registrado se guardó en este dispositivo y se enviará al recuperar la conexión."
          action={<OfflineActions />}
        />
      </main>
    </div>
  );
}
