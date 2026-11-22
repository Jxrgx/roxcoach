import type { Metadata } from "next";
import { requireCoach } from "@/lib/auth/session";
import { listCoachSessions } from "@/lib/db/sessions";
import { addDaysKey, mondayOf, todayKey, weekDays } from "@/lib/scheduling/dates";
import { resolveWeekParam } from "@/lib/scheduling/week-param";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { WeekNav } from "@/components/shared/week-nav";
import { NewSessionButton } from "@/components/coach/new-session";
import { CalendarWeek } from "@/components/coach/calendar-week";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarPage({ searchParams }: PageProps<"/coach/calendario">) {
  const [coach, query] = await Promise.all([requireCoach(), searchParams]);
  const today = todayKey(APP_TIME_ZONE);
  const monday = resolveWeekParam(query.semana, today);
  const sessions = await listCoachSessions(coach.id, monday, addDaysKey(monday, 6));
  const scheduled = sessions.filter((s) => s.status === "programada").length;

  return (
    <>
      <PageHeader
        title="Calendario"
        description={
          scheduled === 0
            ? "Programa tus plantillas publicadas para tus atletas."
            : `${scheduled} ${scheduled === 1 ? "sesión programada" : "sesiones programadas"} esta semana.`
        }
        action={<NewSessionButton fullWidth className="sm:w-auto" />}
      />
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
