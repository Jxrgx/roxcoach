import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { requireCoach } from "@/lib/auth/session";
import { listCoachSessions } from "@/lib/db/sessions";
import { addDaysKey, mondayOf, todayKey, weekDays } from "@/lib/scheduling/dates";
import { resolveWeekParam } from "@/lib/scheduling/week-param";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { WeekNav } from "@/components/shared/week-nav";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";
import { NewSessionButton } from "@/components/coach/new-session";
import { CalendarWeek } from "@/components/coach/calendar-week";

export const metadata: Metadata = { title: "Calendario" };

type SearchParams = PageProps<"/coach/calendario">["searchParams"];

/** Semana pedida y sus sesiones, una vez por petición (las comparten el resumen y el calendario). */
const loadWeek = cache(async (searchParams: SearchParams) => {
  const [coach, query] = await Promise.all([requireCoach(), searchParams]);
  const today = todayKey(APP_TIME_ZONE);
  const monday = resolveWeekParam(query.semana, today);
  const sessions = await listCoachSessions(coach.id, monday, addDaysKey(monday, 6));
  const scheduled = sessions.filter((s) => s.status === "programada").length;
  return { today, monday, sessions, scheduled };
});

/** La estructura (título y acción) aparece al instante; la semana llega con los datos. */
export default function CalendarPage({ searchParams }: PageProps<"/coach/calendario">) {
  return (
    <>
      <PageHeader
        title="Calendario"
        description={
          <Suspense fallback={<InlineSkeleton />}>
            <WeekSummary searchParams={searchParams} />
          </Suspense>
        }
        action={<NewSessionButton fullWidth className="sm:w-auto" />}
      />
      <Suspense fallback={<ContentSkeleton label="Cargando calendario…" />}>
        <WeekContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function WeekSummary({ searchParams }: { searchParams: SearchParams }) {
  const { scheduled } = await loadWeek(searchParams);
  return (
    <>
      {scheduled === 0
        ? "Programa tus plantillas publicadas para tus atletas."
        : `${scheduled} ${scheduled === 1 ? "sesión programada" : "sesiones programadas"} esta semana.`}
    </>
  );
}

async function WeekContent({ searchParams }: { searchParams: SearchParams }) {
  const { today, monday, sessions } = await loadWeek(searchParams);
  return (
    <>
      <div className="mb-4">
        <WeekNav basePath="/coach/calendario" monday={monday} currentMonday={mondayOf(today)} />
      </div>
      <ScreenStates
        empty={{
          title: "No hay sesiones programadas esta semana",
          description: "Programa la primera sesión para que tus atletas sepan qué entrenar.",
          action: <NewSessionButton />,
        }}
        loadingLabel="Cargando calendario…"
      >
        <CalendarWeek days={weekDays(monday, today)} sessions={sessions} />
      </ScreenStates>
    </>
  );
}
