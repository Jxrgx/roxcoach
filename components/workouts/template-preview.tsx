import { AlertTriangle, Clock, Layers } from "lucide-react";
import type { WorkoutIntensityValue } from "@/lib/workouts/rules";
import { formatDuration } from "@/lib/utils/format";
import { Disclosure } from "@/components/ui/disclosure";
import { Badge } from "@/components/ui/badge";
import { Intensity } from "@/components/workouts/intensity";

export interface PreviewExercise {
  key: string;
  name: string;
  /** Prescripción legible: "4 × 1 km · descanso 1:30". */
  prescription: string;
  notes: string;
  archived?: boolean;
}

export interface PreviewData {
  name: string;
  focus: string;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blocks: { key: string; name: string; notes: string; exercises: PreviewExercise[] }[];
}

/**
 * La sesión como la verá el atleta: resumen (duración, bloques, intensidad) y
 * bloques en acordeón con la prescripción de cada ejercicio. Componente de
 * presentación puro: lo usan el constructor y el detalle.
 */
export function TemplatePreview({ data, headingLevel = 2 }: { data: PreviewData; headingLevel?: 1 | 2 }) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const exerciseCount = data.blocks.reduce((n, b) => n + b.exercises.length, 0);
  return (
    <div>
      <Title className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{data.name || "Plantilla sin nombre"}</Title>
      {data.focus && <p className="mt-1.5 text-sm text-muted">{data.focus}</p>}
      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Duración</dt>
          <Clock aria-hidden className="size-4 text-muted" />
          <dd className="font-semibold tabular-nums text-ink">{data.estimatedMinutes ? formatDuration(data.estimatedMinutes) : "Sin duración"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Bloques</dt>
          <Layers aria-hidden className="size-4 text-muted" />
          <dd className="font-semibold text-ink">
            {data.blocks.length} {data.blocks.length === 1 ? "bloque" : "bloques"} · {exerciseCount} {exerciseCount === 1 ? "ejercicio" : "ejercicios"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Intensidad</dt>
          <dd className="font-semibold">
            <Intensity level={data.intensity} />
          </dd>
        </div>
      </dl>

      {data.blocks.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Esta plantilla todavía no tiene bloques.</p>
      ) : (
        <ol className="mt-6 flex flex-col gap-2">
          {data.blocks.map((b, i) => (
            <li key={b.key}>
              <Disclosure
                defaultOpen
                title={
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm tabular-nums text-muted">
                      {i + 1}
                    </span>
                    {b.name || `Bloque ${i + 1}`}
                  </span>
                }
                meta={
                  <span className="pl-9.5">
                    {b.exercises.length} {b.exercises.length === 1 ? "ejercicio" : "ejercicios"}
                  </span>
                }
              >
                {b.notes && <p className="mb-3 whitespace-pre-line text-sm text-muted">{b.notes}</p>}
                {b.exercises.length === 0 ? (
                  <p className="text-sm text-muted">Sin ejercicios.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {b.exercises.map((e) => (
                      <li key={e.key}>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                          {e.name}
                          {e.archived && (
                            <Badge tone="warning" icon={<AlertTriangle aria-hidden />}>
                              Archivado
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-muted">{e.prescription}</p>
                        {e.notes && <p className="mt-0.5 text-sm text-muted italic">{e.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Disclosure>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
