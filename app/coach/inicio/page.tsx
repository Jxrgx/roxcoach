import type { Metadata } from "next";
import { cache, Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Info, TrendingDown } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { countUnreadAlerts, listCoachAlerts, syncCoachAlerts } from "@/lib/db/alerts";
import { listCoachProgressAthletes, listCoachProgressRecords } from "@/lib/db/progress";
import { listCoachSessions } from "@/lib/db/sessions";
import { coachOverview, pendingAthletes, percent, PERIOD_LABEL } from "@/lib/progress/metrics";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { AlertItem } from "@/components/alerts/alert-item";
import { PageHeader } from "@/components/shared/page-header";
import { TodayLabel } from "@/components/shared/today-label";
import { ScreenStates } from "@/components/shared/screen-states";
import { Avatar } from "@/components/shared/avatar";
import { NewSessionButton } from "@/components/coach/new-session";
import { SessionCard } from "@/components/workouts/session-card";
import { Card, SectionHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { ContentSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Inicio" };

/** Periodo de los indicadores de Inicio (el mismo cálculo que Progreso). */
const PERIOD = "30" as const;

/**
 * Cargadores por petición (React `cache`): cada sección los llama sin repetir
 * consultas. Los avisos se sincronizan antes de listarlos.
 */
const loadToday = cache(async () => {
  const coach = await requireCoach();
  const todayDay = todayKey(APP_TIME_ZONE);
  return listCoachSessions(coach.id, todayDay, todayDay);
});

const loadAlerts = cache(async () => {
  const coach = await requireCoach();
  await syncCoachAlerts(coach.id);
  // Solo los avisos más importantes; el resto vive en /coach/avisos.
  const [topAlerts, unreadAlerts] = await Promise.all([listCoachAlerts(coach.id, { read: "sin-leer", kind: null, take: 3 }), countUnreadAlerts(coach.id)]);
  return { topAlerts, unreadAlerts };
});

const loadTeam = cache(async () => {
  const coach = await requireCoach();
  const todayDay = todayKey(APP_TIME_ZONE);
  const athletes = await listCoachProgressAthletes(coach.id);
  const records = await listCoachProgressRecords(
    coach.id,
    athletes.map((a) => a.athleteId),
  );
  const overview = coachOverview(
    athletes.map((a) => ({ ...a, records: records.get(a.athleteId) ?? [] })),
    PERIOD,
    todayDay,
    "todos",
  );
  return {
    athletes,
    pending: pendingAthletes(overview.rows).slice(0, 5),
    group: overview.group,
  };
});

/**
 * Inicio del coach, solo con datos reales: sesiones de hoy, avisos, atletas con
 * sesiones vencidas sin completar y adherencia del equipo (últimos 30 días).
 * La estructura aparece al instante y cada sección llega por separado.
 */
export default function CoachHomePage() {
  return (
    <>
      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>

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
            <Suspense fallback={<ContentSkeleton label="Cargando sesiones de hoy…" rows={2} />}>
              <TodaySection />
            </Suspense>
            <Suspense fallback={<ContentSkeleton label="Cargando avisos…" rows={2} />}>
              <AlertsSection />
            </Suspense>
            <Suspense fallback={<ContentSkeleton label="Cargando atletas con pendientes…" rows={2} />}>
              <PendingSection />
            </Suspense>
          </div>

          <div className="flex flex-col gap-8">
            <Suspense fallback={<ContentSkeleton label="Cargando adherencia…" rows={1} />}>
              <AdherenceSection />
            </Suspense>
          </div>
        </div>
      </ScreenStates>
    </>
  );
}

const headerAction = <NewSessionButton fullWidth className="sm:w-auto" />;

async function Greeting() {
  const coach = await requireCoach();
  const firstName = coach.name.split(" ")[0];
  return (
    <PageHeader
      eyebrow={<TodayLabel />}
      title={`Hola, ${firstName}`}
      description={coach.gymName ? `Esto es lo que tienes hoy en ${coach.gymName}.` : "Esto es lo que tienes hoy."}
      action={headerAction}
    />
  );
}

/** Misma forma que PageHeader: fecha y acción visibles; el saludo con el nombre llega después. */
function GreetingSkeleton() {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0" aria-hidden>
        <div className="mb-1 text-sm font-medium text-muted">
          <TodayLabel />
        </div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2.5 h-4 w-72 max-w-full" />
      </div>
      <div className="flex shrink-0 flex-col sm:flex-row">{headerAction}</div>
    </header>
  );
}

async function TodaySection() {
  const today = await loadToday();
  return (
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
      {today.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No hay sesiones programadas para hoy.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {today.map((s) => (
            <li key={s.id}>
              <SessionCard
                href={`/coach/sesiones/${s.id}`}
                session={{
                  title: s.title,
                  when: s.startTime ?? "Sin hora",
                  status: s.status,
                  estimatedMinutes: s.estimatedMinutes,
                  blockCount: s.blockCount,
                  intensity: s.intensity,
                  athleteCount: s.athleteCount,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function AlertsSection() {
  const { topAlerts, unreadAlerts } = await loadAlerts();
  return (
    <section aria-labelledby="avisos-inicio">
      <SectionHeader
        id="avisos-inicio"
        title={`Avisos (${unreadAlerts})`}
        action={
          <Link href="/coach/avisos" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
            Ver todos
          </Link>
        }
      />
      {topAlerts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Sin avisos pendientes. Todo en orden con tus atletas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {topAlerts.map((a) => (
            <li key={a.id}>
              <AlertItem alert={a} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function PendingSection() {
  const { athletes, pending, group } = await loadTeam();
  return (
    <section aria-labelledby="pendientes">
      <SectionHeader
        id="pendientes"
        title="Atletas con pendientes"
        action={
          <Link href="/coach/progreso" className="inline-flex min-h-11 items-center text-sm font-medium text-electric hover:underline">
            Ver progreso
          </Link>
        }
      />
      <p className="-mt-1 mb-3 text-sm text-muted">Sesiones vencidas sin completar · {PERIOD_LABEL[PERIOD].toLowerCase()}.</p>
      {athletes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Todavía no tienes atletas en tu equipo.</p>
      ) : pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          {group.due === 0 ? "Aún no hay sesiones vencidas para evaluar." : "Ningún atleta tiene sesiones vencidas sin completar."}
        </p>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {pending.map((a) => (
              <li key={a.athleteId}>
                <Link
                  href={`/coach/progreso/${a.athleteId}`}
                  aria-label={`Ver progreso de ${a.name}`}
                  className="group flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2/60"
                >
                  <Avatar name={a.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words text-ink">{a.name}</span>
                    <span className="block text-sm text-muted">
                      {a.pendingCount} {a.pendingCount === 1 ? "sesión sin completar" : "sesiones sin completar"}
                      {a.adherence.rate !== null && ` · ${percent(a.adherence.rate)}% adherencia`}
                      {!a.adherence.sufficient && " · datos insuficientes"}
                    </span>
                  </span>
                  {a.low && (
                    <Badge tone="warning" icon={<TrendingDown aria-hidden />}>
                      Baja adherencia
                    </Badge>
                  )}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

async function AdherenceSection() {
  const { group } = await loadTeam();
  return (
    <section aria-labelledby="adherencia">
      <SectionHeader id="adherencia" title="Adherencia general" />
      <Card>
        {group.rate === null ? (
          <p className="text-lg font-semibold text-ink">Aún no hay datos suficientes</p>
        ) : (
          <>
            <p className="text-4xl font-bold tabular-nums text-ink">{percent(group.rate)}%</p>
            <ProgressBar className="mt-4" value={group.completed} max={Math.max(1, group.due)} label="Sesiones completadas del equipo" />
          </>
        )}
        <p className="mt-2 text-sm text-muted">
          {group.completed} de {group.due} sesiones vencidas completadas · {PERIOD_LABEL[PERIOD].toLowerCase()}
        </p>
        {!group.sufficient && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-warning">
            <Info aria-hidden className="size-3.5" />
            Datos insuficientes (menos de 3 sesiones vencidas)
          </p>
        )}
      </Card>
    </section>
  );
}
