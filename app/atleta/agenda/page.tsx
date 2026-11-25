import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAthlete } from "@/lib/auth/session";
import { listAthleteSessions } from "@/lib/db/sessions";
import { addDaysKey, mondayOf, todayKey, weekDays } from "@/lib/scheduling/dates";
import { resolveWeekParam } from "@/lib/scheduling/week-param";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { WeekNav } from "@/components/shared/week-nav";
import { AgendaWeek } from "@/components/athlete/agenda-week";
import { ContentSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Agenda" };

/** La estructura aparece al instante; la semana llega detrás de Suspense. */
export default function AgendaPage({ searchParams }: PageProps<"/atleta/agenda">) {
  return (
    <>
      <PageHeader title="Agenda" description="Tu semana de entrenamiento, programada por tu coach." />
      <Suspense fallback={<ContentSkeleton label="Cargando agenda…" rows={4} />}>
        <AgendaContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AgendaContent({ searchParams }: { searchParams: PageProps<"/atleta/agenda">["searchParams"] }) {
  const [athlete, query] = await Promise.all([requireAthlete(), searchParams]);
  const today = todayKey(APP_TIME_ZONE);
  const monday = resolveWeekParam(query.semana, today);
  const sessions = await listAthleteSessions(athlete.id, monday, addDaysKey(monday, 6));

  return (
    <>
      <div className="mb-4">
        <WeekNav basePath="/atleta/agenda" monday={monday} currentMonday={mondayOf(today)} />
      </div>
      <ScreenStates
        empty={{
          title: "Aún no tienes sesiones programadas",
          description: "Cuando tu coach te asigne entrenamientos, aparecerán aquí.",
        }}
        loadingLabel="Cargando agenda…"
      >
        <AgendaWeek days={weekDays(monday, today)} sessions={sessions} today={today} />
      </ScreenStates>
    </>
  );
}
