import type { Metadata } from "next";
import { Archive, CheckCircle2, FilePen, Plus } from "lucide-react";
import type { TemplateStatus } from "@/lib/types/domain";
import { mockRecentSessions, mockTemplates } from "@/lib/mock/workouts";
import { formatDuration, relativeDayLabel } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { WorkoutCard } from "@/components/workouts/workout-card";
import { Intensity } from "@/components/workouts/intensity";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Entrenamientos" };

const TEMPLATE_STATUS: Record<TemplateStatus, { label: string; tone: BadgeTone; icon: typeof Archive }> = {
  publicada: { label: "Publicada", tone: "positive", icon: CheckCircle2 },
  borrador: { label: "Borrador", tone: "warning", icon: FilePen },
  archivada: { label: "Archivada", tone: "neutral", icon: Archive },
};

function CreateWorkout() {
  return (
    <ComingSoonButton
      icon={<Plus aria-hidden className="size-5" />}
      module="constructor de entrenamientos"
      description="Podrás armar plantillas por bloques (carrera, estaciones, fuerza, movilidad) y reutilizarlas al programar."
      fullWidth
      className="sm:w-auto"
    >
      Crear entrenamiento
    </ComingSoonButton>
  );
}

export default function WorkoutsPage() {
  return (
    <>
      <PageHeader
        title="Entrenamientos"
        description="Tus plantillas reutilizables y las sesiones que ya programaste."
        action={<CreateWorkout />}
      />
      <ScreenStates
        empty={{
          title: "Todavía no tienes plantillas",
          description: "Crea tu primera plantilla para programar más rápido.",
          action: <CreateWorkout />,
        }}
        loadingLabel="Cargando entrenamientos…"
        loadingVariant="cards"
      >
        <div className="flex flex-col gap-8">
          <section aria-labelledby="plantillas">
            <SectionHeader id="plantillas" title={`Plantillas (${mockTemplates.length})`} />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {mockTemplates.map((t) => {
                const st = TEMPLATE_STATUS[t.status];
                const Icon = st.icon;
                return (
                  <li key={t.id}>
                    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-ink">{t.name}</h3>
                        <Badge tone={st.tone} icon={<Icon aria-hidden />}>
                          {st.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">{t.focus}</p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-sm">
                        <span className="tabular-nums text-ink">{formatDuration(t.durationMinutes)}</span>
                        <Intensity level={t.intensity} />
                        <span className="text-muted">
                          {t.timesAssigned === 0 ? "Sin asignar" : `Asignada ${t.timesAssigned} veces`}
                        </span>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="recientes">
            <SectionHeader id="recientes" title="Sesiones recientes" />
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {mockRecentSessions.map((s) => (
                <li key={s.id}>
                  <WorkoutCard
                    name={s.name}
                    when={`${relativeDayLabel(s.dayOffset)} · ${s.time}`}
                    durationMinutes={s.durationMinutes}
                    intensity={s.intensity}
                    blockCount={s.blockCount}
                    status={s.status}
                    athleteCount={s.athleteIds.length}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </ScreenStates>
    </>
  );
}
