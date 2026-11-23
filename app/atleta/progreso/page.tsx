import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAthlete } from "@/lib/auth/session";
import { listAthleteProgressRecords } from "@/lib/db/progress";
import { parsePeriod, type Period } from "@/lib/progress/metrics";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodTabs } from "@/components/progress/progress-parts";
import { ProgressOverview } from "@/components/progress/progress-overview";
import { ContentSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Progreso" };

/** Progreso propio del atleta, solo con sesiones reales (excluye canceladas y retiradas). */
export default function AthleteProgressPage({ searchParams }: PageProps<"/atleta/progreso">) {
  return (
    <>
      <PageHeader title="Progreso" description="Tu constancia, tu evolución y lo que conviene atender." />
      <Suspense fallback={<ContentSkeleton label="Cargando progreso…" variant="cards" />}>
        <ProgressContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProgressContent({ searchParams }: { searchParams: PageProps<"/atleta/progreso">["searchParams"] }) {
  const [athlete, query] = await Promise.all([requireAthlete(), searchParams]);
  const period = parsePeriod(query.periodo);
  const today = todayKey(APP_TIME_ZONE);
  const records = await listAthleteProgressRecords(athlete.id);
  const hrefFor = (p: Period) => `/atleta/progreso?periodo=${p}`;

  return (
    <ScreenStates
      empty={{ title: "Aún no tienes sesiones asignadas", description: "Cuando tu coach te asigne entrenamientos, verás aquí tu progreso." }}
      loadingLabel="Cargando progreso…"
      loadingVariant="cards"
    >
      {records.length === 0 ? (
        <EmptyState
          title="Aún no tienes sesiones asignadas"
          description="Tu progreso se calcula con las sesiones que tu coach te asigna y completas. Revisa tu agenda para ver lo que viene."
          action={<ButtonLink href="/atleta/agenda">Ver mi agenda</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <PeriodTabs value={period} hrefFor={hrefFor} />
          <ProgressOverview
            records={records}
            period={period}
            today={today}
            unit={athlete.weightUnit}
            sessionHref={(id) => `/atleta/sesiones/${id}/resumen`}
            noCompletedState={
              <EmptyState
                title="Completa tu primera sesión"
                description="Tus marcas y tu evolución aparecen cuando terminas una sesión: abre tu entrenamiento, pulsa Comenzar y registra cada serie."
                action={<ButtonLink href="/atleta/sesiones">Ir a mi entrenamiento</ButtonLink>}
              />
            }
          />
        </div>
      )}
    </ScreenStates>
  );
}
