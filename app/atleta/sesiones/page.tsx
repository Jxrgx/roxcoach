import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findInProgressAthleteSession, listAthleteSessions, listUpcomingAthleteSessions } from "@/lib/db/sessions";
import { relativeDayKey, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { SessionCard } from "@/components/workouts/session-card";
import { AthleteSessionDetail } from "@/components/athlete/athlete-session-detail";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Entrenamiento de hoy" };

/**
 * "Entrenamiento": la que quedó en curso; si no, la de hoy; si no hay, la próxima programada.
 * El título depende de la sesión que se muestre, así que todo llega detrás de Suspense.
 */
export default function TodaySessionPage() {
  return (
    <Suspense fallback={<DetailSkeleton label="Cargando sesión…" />}>
      <TodaySessionContent />
    </Suspense>
  );
}

async function TodaySessionContent() {
  const athlete = await requireAthlete();
  const today = todayKey(APP_TIME_ZONE);
  // Las tres en paralelo (antes "próxima" esperaba a las otras dos): una consulta de más
  // cuando hay sesión hoy, a cambio de no encadenar otra ronda a la base de datos.
  const [inProgress, todaysAll, upcoming] = await Promise.all([
    findInProgressAthleteSession(athlete.id),
    listAthleteSessions(athlete.id, today, today),
    listUpcomingAthleteSessions(athlete.id, today, 1),
  ]);
  const todays = todaysAll.filter((s) => s.status === "programada");
  // Primero la que está en curso; después la primera de hoy sin completar.
  const current = inProgress ?? todays.find((s) => s.execution !== "completada") ?? todays[0];
  const next = current ? null : upcoming[0];

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
        <AthleteSessionDetail session={current} unit={athlete.weightUnit} today={today} eyebrow={current.date === today ? "Hoy" : undefined} />
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
