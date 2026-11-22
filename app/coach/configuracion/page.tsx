import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { CoachSettingsForm } from "@/components/coach/coach-settings-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const coach = await requireCoach();
  return (
    <>
      <PageHeader title="Configuración" description="Tu perfil, tu gimnasio y cómo se muestran los datos." />
      <ScreenStates
        empty={{ title: "No encontramos tu configuración", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando configuración…"
      >
        <CoachSettingsForm coach={coach} />
      </ScreenStates>
    </>
  );
}
