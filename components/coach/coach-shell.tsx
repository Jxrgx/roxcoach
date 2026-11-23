"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Home,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { COACH_NAV, COACH_PRIMARY_MOBILE, isActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/shared/logo";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NewSessionButton } from "@/components/coach/new-session";

const ICONS: Record<string, LucideIcon> = {
  inicio: Home,
  calendario: CalendarDays,
  atletas: Users,
  entrenamientos: Dumbbell,
  biblioteca: BookOpen,
  progreso: BarChart3,
  mensajes: MessageSquare,
  configuracion: Settings,
};

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.key] ?? Home;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
        active ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:bg-surface-2/60 hover:text-ink",
      )}
    >
      <Icon aria-hidden className={cn("size-5", active && "text-acid")} />
      {item.label}
    </Link>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = COACH_NAV.filter((i) => COACH_PRIMARY_MOBILE.includes(i.key));
  const secondary = COACH_NAV.filter((i) => !COACH_PRIMARY_MOBILE.includes(i.key));
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-bottom-nav max-w-xl grid-cols-5">
          {primary.map((item) => {
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
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] leading-tight",
                moreActive ? "font-semibold text-ink" : "text-muted",
              )}
            >
              <MoreHorizontal aria-hidden className={cn("size-5", moreActive && "text-acid")} />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más secciones">
        <ul className="flex flex-col gap-1">
          {secondary.map((item) => {
            const Icon = ICONS[item.key] ?? Home;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-13 items-center gap-3 rounded-xl px-3 text-base",
                    active ? "bg-surface-2 font-semibold text-ink" : "text-ink hover:bg-surface-2",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", active ? "text-acid" : "text-muted")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}

function SidebarNavList({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {COACH_NAV.map((item) => (
        <li key={item.key}>
          <SidebarLink item={item} active={isActive(pathname, item.href)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Las partes que dependen de la ruta activa usan usePathname. En rutas con
 * parámetros dinámicos (p. ej. /coach/atletas/[id]) usePathname suspende con
 * Cache Components, así que van detrás de Suspense con un fallback idéntico
 * sin sección resaltada: el shell sigue siendo estático e instantáneo.
 */
function SidebarNavActive() {
  return <SidebarNavList pathname={usePathname()} />;
}

function MobileNavActive() {
  return <MobileNav pathname={usePathname()} />;
}

/**
 * Shell del coach. La navegación es estática; `profileCard`, `mobileProfile` y
 * los avisos son slots que el servidor llena con datos reales (detrás de Suspense).
 */
export function CoachShell({
  children,
  profileCard,
  mobileProfile,
  alertsDesktop,
  alertsMobile,
}: {
  children: ReactNode;
  profileCard: ReactNode;
  mobileProfile: ReactNode;
  /** Enlace a Avisos con el contador (lo llena el servidor). */
  alertsDesktop: ReactNode;
  alertsMobile: ReactNode;
}) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-acid focus:px-4 focus:py-2 focus:font-semibold focus:text-on-acid"
      >
        Saltar al contenido
      </a>

      {/* Tablet y desktop: barra lateral completa */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-bg md:flex lg:w-64">
        <div className="px-5 pt-6 pb-5">
          <Link href="/coach/inicio" aria-label="RoxCoach, ir a inicio" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
        </div>
        <div className="px-4">
          <NewSessionButton fullWidth variant="secondary" />
        </div>
        <div className="mt-3 px-3">{alertsDesktop}</div>
        <nav aria-label="Navegación principal" className="mt-5 flex-1 overflow-y-auto px-3">
          <Suspense fallback={<SidebarNavList pathname="" />}>
            <SidebarNavActive />
          </Suspense>
        </nav>
        <div className="m-3">{profileCard}</div>
      </aside>

      {/* Mobile: barra superior compacta */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur md:hidden">
        <Link href="/coach/inicio" aria-label="RoxCoach, ir a inicio" className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          {alertsMobile}
          {mobileProfile}
        </div>
      </header>

      <div className="md:pl-56 lg:pl-64">
        <OfflineBanner />
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+1.5rem)] outline-none sm:px-6 md:pt-8 md:pb-10 lg:px-8"
        >
          {children}
        </main>
      </div>

      <Suspense fallback={<MobileNav pathname="" />}>
        <MobileNavActive />
      </Suspense>
    </>
  );
}
