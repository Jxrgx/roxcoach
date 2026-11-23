import type { Metadata } from "next";
import { Logo } from "@/components/shared/logo";
import { OfflineExecution } from "@/components/athlete/offline-execution";

export const metadata: Metadata = { title: "Entrenamiento sin conexión", robots: { index: false, follow: false } };

/**
 * Shell ESTÁTICO de la ejecución (fase 12): no lee cookies ni datos del
 * servidor, así que se puede cachear sin riesgo. El service worker lo sirve si
 * falla la recarga de una ejecución (redirige aquí con ?sesion=<id>); el
 * contenido sale de IndexedDB.
 */
export default function OfflineExecutionPage() {
  return (
    // Sin navegación inferior en el shell: las acciones fijas se pegan al borde.
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-10" style={{ ["--spacing-bottom-nav" as string]: "0px" }}>
      <header className="mb-4 flex h-11 items-center">
        <Logo />
      </header>
      <main id="contenido" className="outline-none">
        <OfflineExecution />
      </main>
    </div>
  );
}
