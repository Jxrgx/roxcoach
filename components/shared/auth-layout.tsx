import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shared/logo";

/** Marco común de las pantallas de acceso. */
export function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <Link href="/" aria-label="RoxCoach, ir a la página principal" className="inline-flex min-h-11 items-center self-start">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </main>
    </div>
  );
}
