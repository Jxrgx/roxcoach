import type { Metadata } from "next";
import { Suspense } from "react";
import { requireCoach } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ContentSkeleton } from "@/components/shared/page-skeletons";
import { CoachSettingsForm } from "@/components/coach/coach-settings-form";

export const metadata: Metadata = { title: "Configuración" };

/** La estructura aparece al instante; el formulario llega con el perfil del coach. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" description="Tu perfil, tu gimnasio y cómo se muestran los datos." />
      <Suspense fallback={<ContentSkeleton label="Cargando configuración…" rows={4} />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const coach = await requireCoach();
  return (
    <ScreenStates
      empty={{ title: "No encontramos tu configuración", description: "Recarga la página para intentarlo de nuevo." }}
      loadingLabel="Cargando configuración…"
    >
      <CoachSettingsForm coach={coach} />
    </ScreenStates>
  );
}
