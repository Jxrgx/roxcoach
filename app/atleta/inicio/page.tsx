import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clock, Layers, PauseCircle, Play } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteCoach } from "@/lib/db/athletes";
import { listAthleteSessions, listUpcomingAthleteSessions } from "@/lib/db/sessions";
import { addDaysKey, mondayOf, relativeDayKey, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE, formatDuration } from "@/lib/utils/format";
import { RaceCountdown } from "@/components/athlete/race-countdown";
import { ScreenStates } from "@/components/shared/screen-states";
import { SessionCard } from "@/components/workouts/session-card";
import { Intensity } from "@/components/workouts/intensity";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { StateMessage } from "@/components/ui/state-message";

export const metadata: Metadata = { title: "Inicio" };

export default async function AthleteHomePage() {
  const athlete = await requireAthlete();
  const today = todayKey(APP_TIME_ZONE);
  const monday = mondayOf(today);
  const [coach, todays, upcomingAll, week] = await Promise.all([
    findAthleteCoach(athlete.id),
    listAthleteSessions(athlete.id, today, today),
    listUpcomingAthleteSessions(athlete.id, addDaysKey(today, 1), 2),
    listAthleteSessions(athlete.id, monday, addDaysKey(monday, 6)),
  ]);
  const firstName = athlete.name.split(" ")[0];
  const current = todays.find((s) => s.status === "programada");
  const weekScheduled = week.filter((s) => s.status === "programada").length;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Hola, {firstName}</h1>
        <RaceCountdown raceDate={athlete.raceDate} />
      </header>

      {coach?.status === "paused" && (
        <p role="status" className="mb-5 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-ink">
          <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {coach.coachName} pausó tu plan por ahora.
        </p>
      )}

      <ScreenStates
        empty={{
          title: "Hoy no tienes entrenamiento asignado",
          description: "Disfruta tu descanso. Tu coach te avisará cuando programe la siguiente sesión.",
          action: (
            <ButtonLink href="/atleta/agenda" variant="secondary">
              Ver mi agenda
            </ButtonLink>
          ),
        }}
        loadingLabel="Cargando tu entrenamiento…"
      >
        {/* Nivel 1: el entrenamiento de hoy y la acción para iniciarlo. */}
        {current ? (
          <section aria-labelledby="hoy" className="rounded-2xl border border-line bg-surface-2 p-5 shadow-card">
            <p className="text-sm font-semibold text-acid">
              Entrenamiento de hoy{current.startTime ? <span className="tabular-nums"> · {current.startTime}</span> : null}
            </p>
            <h2 id="hoy" className="mt-1 text-2xl font-bold tracking-tight text-ink">
              {current.title}
            </h2>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-surface p-3">
                <dt className="flex items-center gap-1 text-xs text-muted">
                  <Clock aria-hidden className="size-3.5" /> Duración
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-ink">{current.estimatedMinutes ? formatDuration(current.estimatedMinutes) : "—"}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="flex items-center gap-1 text-xs text-muted">
                  <Layers aria-hidden className="size-3.5" /> Bloques
                </dt>
                <dd className="mt-1 font-semibold text-ink">{current.blockCount}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">Intensidad</dt>
                <dd className="mt-1 font-semibold">
                  <Intensity level={current.intensity} />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted">{current.snapshot.blocks.map((b) => b.name).join(" · ")}</p>
            <ButtonLink href={`/atleta/sesiones/${current.id}`} size="lg" fullWidth className="mt-5" icon={<Play aria-hidden className="size-5" />}>
              Comenzar entrenamiento
            </ButtonLink>
          </section>
        ) : (
          <StateMessage
            icon={<CalendarCheck />}
            title="Hoy no tienes entrenamiento asignado"
            description={coach ? "Aprovecha para recuperarte. Revisa tu agenda para ver lo que sigue." : "Cuando te unas al equipo de un coach, aquí verás tu entrenamiento del día."}
          />
        )}

        {/* Nivel 2: lo que sigue y la semana. */}
        <section aria-labelledby="proximas" className="mt-8">
          <SectionHeader
            id="proximas"
            title="Próximas sesiones"
            action={
              <Link href="/atleta/agenda" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
                Ver agenda
              </Link>
            }
          />
          {upcomingAll.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No tienes más sesiones programadas por ahora.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingAll.map((s) => (
                <li key={s.id}>
                  <SessionCard
                    href={`/atleta/sesiones/${s.id}`}
                    session={{
                      title: s.title,
                      when: `${relativeDayKey(s.date, today)}${s.startTime ? ` · ${s.startTime}` : ""}`,
                      status: s.status,
                      estimatedMinutes: s.estimatedMinutes,
                      blockCount: s.blockCount,
                      intensity: s.intensity,
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="semana" className="mt-8">
          <SectionHeader id="semana" title="Tu semana" />
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink">
            <strong className="text-2xl font-bold tabular-nums">{weekScheduled}</strong>{" "}
            {weekScheduled === 1 ? "sesión programada" : "sesiones programadas"} esta semana.
          </p>
        </section>
      </ScreenStates>
    </>
  );
}
