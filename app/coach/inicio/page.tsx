import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, MessageSquare } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { mockAthletes, mockCoachProgress, mockRecentComments } from "@/lib/mock/coach";
import { mockCoachSessions } from "@/lib/mock/workouts";
import { PageHeader } from "@/components/shared/page-header";
import { TodayLabel } from "@/components/shared/today-label";
import { ScreenStates } from "@/components/shared/screen-states";
import { Avatar } from "@/components/shared/avatar";
import { NewSessionButton } from "@/components/coach/new-session";
import { WorkoutCard } from "@/components/workouts/workout-card";
import { Card, SectionHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Inicio" };

export default async function CoachHomePage() {
  const coach = await requireCoach();
  const firstName = coach.name.split(" ")[0];
  const today = mockCoachSessions.filter((s) => s.dayOffset === 0);
  const pending = mockAthletes.filter((a) => a.status === "pendiente");
  const { done, planned } = mockCoachProgress.completedSessions;

  return (
    <>
      <PageHeader
        eyebrow={<TodayLabel />}
        title={`Hola, ${firstName}`}
        description={coach.gymName ? `Esto es lo que tienes hoy en ${coach.gymName}.` : "Esto es lo que tienes hoy."}
        action={<NewSessionButton fullWidth className="sm:w-auto" />}
      />

      <ScreenStates
        empty={{
          title: "No hay sesiones programadas para hoy",
          description: "Crea una sesión o asigna una plantilla a tus atletas.",
          action: <NewSessionButton />,
        }}
        loadingLabel="Cargando sesiones de hoy…"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            <section aria-labelledby="hoy">
              <SectionHeader
                id="hoy"
                title={`Sesiones de hoy (${today.length})`}
                action={
                  <Link href="/coach/calendario" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
                    Ver semana
                  </Link>
                }
              />
              <ul className="flex flex-col gap-3">
                {today.map((s) => (
                  <li key={s.id}>
                    <WorkoutCard
                      name={s.name}
                      when={s.time}
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

            <section aria-labelledby="pendientes">
              <SectionHeader
                id="pendientes"
                title="Atletas con pendientes"
                action={
                  <Link href="/coach/atletas" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
                    Ver atletas
                  </Link>
                }
              />
              {pending.length === 0 ? (
                <p className="text-sm text-muted">Todos tus atletas van al día.</p>
              ) : (
                <Card padding="none">
                  <ul className="divide-y divide-line">
                    {pending.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <Avatar name={a.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">{a.name}</p>
                          <p className="truncate text-sm text-muted">{a.nextSessionLabel ?? "Sin sesión asignada"}</p>
                        </div>
                        <Badge tone="warning" icon={<AlertCircle aria-hidden />}>
                          {a.adherence}% adherencia
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-8">
            <section aria-labelledby="adherencia">
              <SectionHeader id="adherencia" title="Adherencia general" />
              <Card>
                <p className="text-4xl font-bold tabular-nums text-ink">{mockCoachProgress.adherence}%</p>
                <p className="mt-1 text-sm text-muted">
                  {done} de {planned} sesiones completadas en las últimas 4 semanas
                </p>
                <ProgressBar className="mt-4" value={done} max={planned} label="Sesiones completadas" />
              </Card>
            </section>

            <section aria-labelledby="comentarios">
              <SectionHeader
                id="comentarios"
                title="Comentarios recientes"
                action={
                  <Link href="/coach/mensajes" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
                    Mensajes
                  </Link>
                }
              />
              <ul className="flex flex-col gap-3">
                {mockRecentComments.map((c) => (
                  <li key={c.id}>
                    <Card padding="sm">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-ink">{c.athleteName}</span>
                        <span className="shrink-0 text-muted">{c.when}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                        <MessageSquare aria-hidden className="size-3.5" />
                        {c.sessionName}
                      </p>
                      <p className="mt-2 text-sm text-ink">{c.text}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </ScreenStates>
    </>
  );
}
