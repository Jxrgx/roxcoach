import type { Metadata } from "next";
import { mockAthletePlan } from "@/lib/mock/athlete";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { AgendaWeek } from "@/components/athlete/agenda-week";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage() {
  return (
    <>
      <PageHeader title="Agenda" description="Tu semana de entrenamiento, programada por tu coach." />
      <ScreenStates
        empty={{
          title: "Aún no tienes sesiones programadas",
          description: "Cuando tu coach te asigne entrenamientos, aparecerán aquí.",
        }}
        loadingLabel="Cargando agenda…"
      >
        <AgendaWeek plan={mockAthletePlan} />
      </ScreenStates>
    </>
  );
}
