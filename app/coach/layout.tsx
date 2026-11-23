import type { Metadata } from "next";
import { Suspense } from "react";
import { CoachShell } from "@/components/coach/coach-shell";
import {
  CoachMobileProfile,
  CoachMobileProfileSkeleton,
  CoachProfileCard,
  CoachProfileCardSkeleton,
} from "@/components/coach/coach-profile";
import { AreaSkeleton, CoachGate } from "@/components/shared/area-gate";
import { AlertsBell, AlertsBellMobile, AlertsLink, AlertsLinkDesktop } from "@/components/alerts/alerts-indicator";

export const metadata: Metadata = {
  title: { default: "Panel del coach", template: "%s · Coach · RoxCoach" },
};

/**
 * La navegación forma parte del shell estático; todo lo que depende de la
 * sesión (perfil y contenido) se resuelve en servidor detrás de Suspense.
 */
export default function CoachLayout({ children }: LayoutProps<"/coach">) {
  return (
    <CoachShell
      profileCard={
        <Suspense fallback={<CoachProfileCardSkeleton />}>
          <CoachProfileCard />
        </Suspense>
      }
      mobileProfile={
        <Suspense fallback={<CoachMobileProfileSkeleton />}>
          <CoachMobileProfile />
        </Suspense>
      }
      alertsDesktop={
        <Suspense fallback={<AlertsLink count={null} />}>
          <AlertsLinkDesktop />
        </Suspense>
      }
      alertsMobile={
        <Suspense fallback={<AlertsBell count={null} />}>
          <AlertsBellMobile />
        </Suspense>
      }
    >
      <Suspense fallback={<AreaSkeleton />}>
        <CoachGate>{children}</CoachGate>
      </Suspense>
    </CoachShell>
  );
}
