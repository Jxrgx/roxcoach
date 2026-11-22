import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { listAthleteSessions, listUpcomingAthleteSessions } from "@/lib/db/sessions";
import { relativeDayKey, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { SessionCard } from "@/components/workouts/session-card";
import { AthleteSessionDetail } from "@/components/athlete/athlete-session-detail";

export const metadata: Metadata = { title: "Entrenamiento de hoy" };

/** "Entrenamiento": la sesión de hoy; si no hay, la próxima programada. */
export default async function TodaySessionPage() {
  const athlete = await requireAthlete();
  const today = todayKey(APP_TIME_ZONE);
  const todays = (await listAthleteSessions(athlete.id, today, today)).filter((s) => s.status === "programada");
  const current = todays[0];
  const next = current ? null : (await listUpcomingAthleteSessions(athlete.id, today, 1))[0];

  return (
    <ScreenStates
      empty={{
        title: "No tienes entrenamiento para hoy",
        description: "Revisa tu agenda para ver la próxima sesión.",
        action: (
          <ButtonLink href="/atleta/agenda" variant="secondary">
            Ver agenda
          </ButtonLink>
        ),
      }}
      loadingLabel="Cargando sesión…"
    >
      {current ? (
        <AthleteSessionDetail session={current} unit={athlete.weightUnit} eyebrow="Hoy" />
      ) : (
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Entrenamiento</h1>
          <StateMessage
            icon={<CalendarCheck />}
            title="Hoy no tienes entrenamiento asignado"
            description={next ? "Aprovecha para recuperarte. Esta es tu próxima sesión:" : "Tu coach te avisará cuando programe tu próxima sesión."}
            action={
              <ButtonLink href="/atleta/agenda" variant="secondary">
                Ver mi agenda
              </ButtonLink>
            }
          />
          {next && (
            <SessionCard
              href={`/atleta/sesiones/${next.id}`}
              session={{
                title: next.title,
                when: `${relativeDayKey(next.date, today)}${next.startTime ? ` · ${next.startTime}` : ""}`,
                status: next.status,
                estimatedMinutes: next.estimatedMinutes,
                blockCount: next.blockCount,
                intensity: next.intensity,
              }}
            />
          )}
        </div>
      )}
    </ScreenStates>
  );
}
