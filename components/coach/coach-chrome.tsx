import { Suspense, type ReactNode } from "react";
import { CoachShell } from "@/components/coach/coach-shell";
import { CoachMobileProfile, CoachMobileProfileSkeleton, CoachProfileCard, CoachProfileCardSkeleton } from "@/components/coach/coach-profile";
import { AlertsBell, AlertsBellMobile, AlertsLink, AlertsLinkDesktop } from "@/components/alerts/alerts-indicator";

/**
 * Marco del panel del coach: navegación estática + perfil y avisos por
 * streaming detrás de Suspense. Lo usan el layout de /coach y el 404 real
 * de las rutas de detalle (`app/not-found.tsx`), para que se vean igual.
 */
export function CoachChrome({ children }: { children: ReactNode }) {
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
      {children}
    </CoachShell>
  );
}
