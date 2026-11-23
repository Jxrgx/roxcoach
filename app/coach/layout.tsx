import type { Metadata } from "next";
import { Suspense } from "react";
import { CoachChrome } from "@/components/coach/coach-chrome";
import { AreaSkeleton, CoachGate } from "@/components/shared/area-gate";

export const metadata: Metadata = {
  title: { default: "Panel del coach", template: "%s · Coach · RoxCoach" },
};

/**
 * La navegación forma parte del shell estático; todo lo que depende de la
 * sesión (perfil y contenido) se resuelve en servidor detrás de Suspense.
 */
export default function CoachLayout({ children }: LayoutProps<"/coach">) {
  return (
    <CoachChrome>
      <Suspense fallback={<AreaSkeleton />}>
        <CoachGate>{children}</CoachGate>
      </Suspense>
    </CoachChrome>
  );
}
