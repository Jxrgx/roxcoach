import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { ComponentCatalog } from "@/components/shared/component-catalog";

export const metadata: Metadata = {
  title: "Sistema visual",
  robots: { index: false, follow: false },
};

/**
 * Catálogo interno del sistema visual. Solo disponible en desarrollo
 * (o en producción con ROXCOACH_CATALOG=1 para revisiones).
 */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.ROXCOACH_CATALOG !== "1") notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" aria-label="RoxCoach, ir a la página principal" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <span className="text-sm text-muted">Uso interno</span>
      </header>
      <main>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Sistema visual</h1>
        <p className="mt-1.5 max-w-2xl text-muted">
          Componentes base de RoxCoach con sus variantes y estados. Úsalo para validar cambios visuales antes de llevarlos a una pantalla.
        </p>
        <ComponentCatalog />
      </main>
    </div>
  );
}
