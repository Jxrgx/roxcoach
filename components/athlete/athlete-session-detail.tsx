import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Layers, Package, Play, StickyNote, XCircle } from "lucide-react";
import type { AthleteSessionDTO } from "@/lib/db/sessions";
import { formatKeyLong } from "@/lib/scheduling/dates";
import { snapshotEquipment } from "@/lib/scheduling/snapshot";
import { formatPrescription, type WeightUnit } from "@/lib/workouts/rules";
import { formatDuration } from "@/lib/utils/format";
import { Disclosure } from "@/components/ui/disclosure";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { StickyActions } from "@/components/shared/sticky-actions";
import { Intensity } from "@/components/workouts/intensity";

/**
 * Sesión asignada, vista por el atleta (desde el snapshot congelado).
 * Nivel 1: qué es y "Comenzar". Nivel 2: duración, bloques, intensidad.
 * Nivel 3 (acordeones): ejercicios de cada bloque y equipo.
 */
export function AthleteSessionDetail({ session, unit, eyebrow }: { session: AthleteSessionDTO; unit: WeightUnit; eyebrow?: string }) {
  const s = session.snapshot;
  const cancelled = session.status === "cancelada";
  const equipment = snapshotEquipment(s);

  return (
    <div>
      <header>
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-acid">
          {eyebrow ?? (
            <>
              <CalendarDays aria-hidden className="size-4" />
              {formatKeyLong(session.date)}
            </>
          )}
          {session.startTime && <span className="tabular-nums">· {session.startTime}</span>}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{session.title}</h1>
        {s.focus && <p className="mt-1.5 text-sm text-muted">{s.focus}</p>}
        <p className="mt-1 text-sm text-muted">Con {session.coachName}</p>
        <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Duración</dt>
            <Clock aria-hidden className="size-4 text-muted" />
            <dd className="font-semibold tabular-nums text-ink">{s.estimatedMinutes ? formatDuration(s.estimatedMinutes) : "Sin duración"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Bloques</dt>
            <Layers aria-hidden className="size-4 text-muted" />
            <dd className="font-semibold text-ink">
              {s.blocks.length} {s.blocks.length === 1 ? "bloque" : "bloques"}
            </dd>
          </div>
          <div>
            <dt className="sr-only">Intensidad</dt>
            <dd className="font-semibold">
              <Intensity level={s.intensity} />
            </dd>
          </div>
        </dl>
      </header>

      {cancelled && (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-sm text-ink">
          <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          Tu coach canceló esta sesión.
        </p>
      )}

      {session.notes && (
        <p className="mt-5 flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-sm whitespace-pre-line text-ink">
          <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            <span className="sr-only">Notas de tu coach: </span>
            {session.notes}
          </span>
        </p>
      )}

      <section aria-labelledby="bloques" className="mt-8">
        <h2 id="bloques" className="mb-3 text-base font-semibold text-ink">
          Bloques
        </h2>
        <ol className="flex flex-col gap-2">
          {s.blocks.map((b, i) => (
            <li key={`${i}-${b.name}`}>
              <Disclosure
                title={
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm tabular-nums text-muted">{i + 1}</span>
                    {b.name}
                  </span>
                }
                meta={
                  <span className="pl-9.5">
                    {b.exercises.length} {b.exercises.length === 1 ? "ejercicio" : "ejercicios"}
                  </span>
                }
              >
                {b.notes && <p className="mb-3 whitespace-pre-line text-sm text-muted">{b.notes}</p>}
                <ul className="flex flex-col gap-2">
                  {b.exercises.map((e, j) => (
                    <li key={`${j}-${e.exerciseId}`}>
                      <Link
                        href={`/atleta/ejercicios/${e.exerciseId}`}
                        className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2"
                        aria-label={`${e.name}: ${formatPrescription(e, unit)}. Ver ejercicio`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{e.name}</span>
                          <span className="block text-sm tabular-nums text-muted">{formatPrescription(e, unit)}</span>
                          {e.notes && <span className="block text-sm text-muted italic">{e.notes}</span>}
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </li>
          ))}
        </ol>
      </section>

      {equipment.length > 0 && (
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
            meta={<span className="pl-7.5">{equipment.length} elementos</span>}
          >
            <ul className="flex flex-wrap gap-2">
              {equipment.map((item) => (
                <li key={item} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink">
                  {item}
                </li>
              ))}
            </ul>
          </Disclosure>
        </section>
      )}

      {!cancelled && (
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
      )}
    </div>
  );
}
