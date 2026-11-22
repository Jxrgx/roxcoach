import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ButtonLink } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-ink">
          Iniciar sesión
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        <p className="text-sm font-semibold text-acid">Entrenamiento HYROX</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Programa, asigna y mide cada sesión en un solo lugar.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
          Deja atrás el pizarrón y los mensajes dispersos. Tu coach planea; tú entrenas y registras.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/registro" size="lg">
            Crear cuenta
          </ButtonLink>
          <ButtonLink href="/login" size="lg" variant="secondary">
            Ya tengo cuenta
          </ButtonLink>
        </div>

      </main>

      <footer className="py-4 text-sm text-muted">RoxCoach · Entrenamiento HYROX para coaches y atletas.</footer>
    </div>
  );
}
