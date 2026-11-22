import type { Metadata } from "next";
import { mockCoachSessions } from "@/lib/mock/workouts";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { NewSessionButton } from "@/components/coach/new-session";
import { WeekCalendar } from "@/components/coach/week-calendar";

export const metadata: Metadata = { title: "Calendario" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Calendario"
        description="Sesiones programadas de tu equipo para esta semana."
        action={<NewSessionButton fullWidth className="sm:w-auto" />}
      />
      <ScreenStates
        empty={{
          title: "No hay sesiones programadas esta semana",
          description: "Programa la primera sesión para que tus atletas sepan qué entrenar.",
          action: <NewSessionButton />,
        }}
        loadingLabel="Cargando calendario…"
      >
        <WeekCalendar sessions={mockCoachSessions} />
      </ScreenStates>
    </>
  );
}
