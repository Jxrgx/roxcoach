"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, CalendarDays, Dumbbell, Home, User, type LucideIcon } from "lucide-react";
import { ATHLETE_NAV, isActive } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/shared/logo";
import { OfflineBanner } from "@/components/shared/offline-banner";

const ICONS: Record<string, LucideIcon> = {
  inicio: Home,
  agenda: CalendarDays,
  sesiones: Dumbbell,
  progreso: BarChart3,
  perfil: User,
};

/**
 * Shell del atleta: pensado para una mano. En mobile la navegación vive
 * abajo (zona del pulgar); desde tablet pasa a una barra superior.
 */
export function AthleteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-acid focus:px-4 focus:py-2 focus:font-semibold focus:text-on-acid"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 md:h-16">
          <Link href="/atleta/inicio" aria-label="RoxCoach, ir a inicio" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {ATHLETE_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-xl px-3 text-sm",
                        active ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <OfflineBanner />

      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-4 pt-5 pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+1.5rem)] outline-none md:pt-8 md:pb-12"
      >
        {children}
      </main>

      <nav
        aria-label="Navegación principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden"
      >
        {/* La celda central es más ancha: "Entrenamiento" cabe completo desde 320 px. */}
        <ul className="mx-auto grid h-bottom-nav max-w-xl grid-cols-[1fr_1fr_1.45fr_1fr_1fr]">
          {ATHLETE_NAV.map((item) => {
            const Icon = ICONS[item.key] ?? Home;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-tight",
                    active ? "font-semibold text-ink" : "text-muted",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", active && "text-acid")} />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
