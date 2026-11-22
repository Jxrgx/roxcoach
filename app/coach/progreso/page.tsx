import type { Metadata } from "next";
import { CheckCircle2, Dumbbell, Percent, Timer } from "lucide-react";
import { mockCoachProgress } from "@/lib/mock/coach";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { MetricTile } from "@/components/shared/metric-tile";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export const metadata: Metadata = { title: "Progreso" };

export default function CoachProgressPage() {
  const p = mockCoachProgress;
  return (
    <>
      <PageHeader
        title="Progreso"
        description="Resumen del equipo en las últimas 4 semanas."
        action={
          <ButtonLink href="/coach/atletas" fullWidth className="sm:w-auto">
            Revisar por atleta
          </ButtonLink>
        }
      />
      <ScreenStates
        empty={{
          title: "Aún no hay resultados registrados",
          description: "Cuando tus atletas completen sesiones, verás aquí su progreso.",
        }}
        loadingLabel="Cargando progreso…"
        loadingVariant="cards"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricTile
            icon={<CheckCircle2 />}
            label="Sesiones completadas"
            value={String(p.completedSessions.done)}
            context={`de ${p.completedSessions.planned} planeadas`}
          />
          <MetricTile icon={<Percent />} label="Adherencia" value={`${p.adherence}%`} context="promedio del equipo">
            <ProgressBar className="mt-3" value={p.adherence} label="Adherencia del equipo" size="sm" />
          </MetricTile>
          <MetricTile icon={<Timer />} label="Mejor tiempo" value={p.bestTime.value} context={`${p.bestTime.label} · ${p.bestTime.athlete}`} />
          <MetricTile icon={<Dumbbell />} label="Mejor carga" value={p.bestLoad.value} context={`${p.bestLoad.label} · ${p.bestLoad.athlete}`} />
        </dl>
      </ScreenStates>
    </>
  );
}
