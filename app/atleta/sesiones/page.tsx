import type { Metadata } from "next";
import { Clock, Layers, Package, Play } from "lucide-react";
import { todayWorkout } from "@/lib/mock/athlete";
import { formatDuration } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { StickyActions } from "@/components/shared/sticky-actions";
import { Intensity } from "@/components/workouts/intensity";
import { Disclosure } from "@/components/ui/disclosure";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Entrenamiento de hoy" };

export default function SessionPage() {
  const w = todayWorkout;
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
      <header>
        <p className="text-sm font-semibold text-acid">Hoy</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{w.name}</h1>
        <p className="mt-1.5 text-sm text-muted">{w.focus}</p>
        <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Duración</dt>
            <Clock aria-hidden className="size-4 text-muted" />
            <dd className="font-semibold tabular-nums text-ink">{formatDuration(w.durationMinutes)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Bloques</dt>
            <Layers aria-hidden className="size-4 text-muted" />
            <dd className="font-semibold text-ink">{w.blocks.length} bloques</dd>
          </div>
          <div>
            <dt className="sr-only">Intensidad</dt>
            <dd className="font-semibold">
              <Intensity level={w.intensity} />
            </dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="bloques" className="mt-8">
        <h2 id="bloques" className="mb-3 text-base font-semibold text-ink">
          Bloques
        </h2>
        <ol className="flex flex-col gap-2">
          {w.blocks.map((b, i) => (
            <li key={b.id}>
              <Disclosure
                title={
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm tabular-nums text-muted">
                      {i + 1}
                    </span>
                    {b.name}
                  </span>
                }
                meta={<span className="pl-9.5">{b.summary}</span>}
              >
                <ul className="flex flex-col gap-3">
                  {b.exercises.map((e, j) => (
                    <li key={`${e.exerciseId}-${j}`}>
                      <p className="font-medium text-ink">{e.name}</p>
                      <p className="mt-0.5 text-sm tabular-nums text-muted">{e.prescription}</p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="equipo" className="mt-6">
        <h2 id="equipo" className="sr-only">
          Equipo necesario
        </h2>
        <Disclosure
          title={
            <span className="flex items-center gap-2.5">
              <Package aria-hidden className="size-5 text-muted" />
              Equipo necesario
            </span>
          }
          meta={<span className="pl-7.5">{w.equipment.length} elementos</span>}
        >
          <ul className="flex flex-wrap gap-2">
            {w.equipment.map((item) => (
              <li key={item} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </Disclosure>
      </section>

      <StickyActions>
        <ComingSoonButton
          size="lg"
          fullWidth
          className="sm:w-auto sm:min-w-64"
          icon={<Play aria-hidden className="size-5" />}
          module="ejecución de entrenamiento"
          description="Verás el bloque y la serie activa, el temporizador y podrás registrar tus resultados con una mano."
        >
          Comenzar
        </ComingSoonButton>
      </StickyActions>
    </ScreenStates>
  );
}
