import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Layers, PauseCircle, Play } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findAthleteCoach } from "@/lib/db/athletes";
import { getUpcomingSessions, mockAthletePlan, mockWeeklyProgress, todayWorkout } from "@/lib/mock/athlete";
import { RaceCountdown } from "@/components/athlete/race-countdown";
import { formatDuration, relativeDayLabel } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { WorkoutCard } from "@/components/workouts/workout-card";
import { Intensity } from "@/components/workouts/intensity";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export const metadata: Metadata = { title: "Inicio" };

export default async function AthleteHomePage() {
  const athlete = await requireAthlete();
  const coach = await findAthleteCoach(athlete.id);
  const firstName = athlete.name.split(" ")[0];
  const upcoming = getUpcomingSessions(mockAthletePlan, 2);
  const w = todayWorkout;

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
        <section aria-labelledby="hoy" className="rounded-2xl border border-line bg-surface-2 p-5 shadow-card">
          <p className="text-sm font-semibold text-acid">Entrenamiento de hoy</p>
          <h2 id="hoy" className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {w.name}
          </h2>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface p-3">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Clock aria-hidden className="size-3.5" /> Duración
              </dt>
              <dd className="mt-1 font-semibold tabular-nums text-ink">{formatDuration(w.durationMinutes)}</dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Layers aria-hidden className="size-3.5" /> Bloques
              </dt>
              <dd className="mt-1 font-semibold text-ink">{w.blocks.length}</dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-xs text-muted">Intensidad</dt>
              <dd className="mt-1 font-semibold">
                <Intensity level={w.intensity} />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">{w.blocks.map((b) => b.name).join(" · ")}</p>
          <ButtonLink href="/atleta/sesiones" size="lg" fullWidth className="mt-5" icon={<Play aria-hidden className="size-5" />}>
            Comenzar entrenamiento
          </ButtonLink>
        </section>

        {/* Nivel 2: lo que sigue y el avance de la semana. */}
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
          <ul className="flex flex-col gap-3">
            {upcoming.map((s) => (
              <li key={s.id}>
                <WorkoutCard
                  name={s.name}
                  when={`${relativeDayLabel(s.dayOffset)} · ${s.time}`}
                  durationMinutes={s.durationMinutes}
                  intensity={s.intensity}
                  blockCount={s.blockCount}
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="semana" className="mt-8">
          <SectionHeader id="semana" title="Tu semana" />
          <div className="rounded-2xl border border-line bg-surface p-4">
            <ProgressBar
              value={mockWeeklyProgress.done}
              max={mockWeeklyProgress.planned}
              label="Sesiones completadas esta semana"
              showLabel
              valueText={`${mockWeeklyProgress.done} de ${mockWeeklyProgress.planned}`}
            />
          </div>
        </section>
      </ScreenStates>
    </>
  );
}
