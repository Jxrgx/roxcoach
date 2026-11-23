import { AlertTriangle, CheckCircle2, CircleDashed, UserCog } from "lucide-react";
import type { SessionSummary } from "@/lib/execution/progress";
import type { DiscomfortDTO } from "@/lib/db/execution";
import { formatActualSet } from "@/lib/execution/format";
import {
  DISCOMFORT_INTENSITY_LABEL,
  DISCOMFORT_ZONE_LABEL,
} from "@/lib/execution/discomfort";
import { formatSetTarget, type WeightUnit } from "@/lib/workouts/rules";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import type { EffectiveExercise } from "@/lib/overrides/apply";
import type { SnapshotExercise } from "@/lib/scheduling/snapshot";

/**
 * Encabezado de un ejercicio en los resultados: si el atleta tuvo ajustes,
 * muestra "Plan original" y "Ajuste para este atleta"; si se omitió, lo dice
 * (una serie omitida no es una serie no realizada).
 */
function AdjustedHeader({
  exercise,
  skipped,
  unit,
}: {
  exercise: SnapshotExercise;
  skipped: boolean;
  unit: WeightUnit;
}) {
  const eff = exercise as Partial<EffectiveExercise> & SnapshotExercise;
  const original = eff.adapted ? eff.original : undefined;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
        <span className="break-words">{exercise.name}</span>
        {skipped ? (
          <Badge tone="warning">Ejercicio omitido</Badge>
        ) : (
          original && (
            <Badge tone="info" icon={<UserCog aria-hidden />}>
              Ajustado
            </Badge>
          )
        )}
      </p>
      {original ? (
        <>
          <p className="text-sm text-muted">
            Plan original: {original.name} · {original.sets} ×{" "}
            {formatSetTarget(original, unit)}
          </p>
          {!skipped && (
            <p className="text-sm text-ink">
              Ajuste para este atleta: {exercise.sets} ×{" "}
              {formatSetTarget(exercise, unit)}
              {eff.replaced ? ` (sustituye a ${original.name})` : ""}
            </p>
          )}
          {eff.athleteNote && (
            <p className="text-sm text-muted italic">Nota: {eff.athleteNote}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          Planeado por serie: {formatSetTarget(exercise, unit)}
        </p>
      )}
      {skipped && (
        <p className="mt-1 text-sm text-muted">
          No se pidió a este atleta: no cuenta como pendiente ni como no
          realizada.
        </p>
      )}
    </div>
  );
}

/**
 * Planeado vs. realizado por bloque (atleta en su resumen, coach en resultados).
 * Lo planeado viene del snapshot; lo realizado, de los registros de serie.
 * `pendingLabel`: cómo se llama una serie sin registro ("Pendiente" o "No realizada").
 */
export function ExecutionResults({
  summary,
  unit,
  pendingLabel,
  defaultOpen = false,
}: {
  summary: SessionSummary;
  unit: WeightUnit;
  pendingLabel: string;
  defaultOpen?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {summary.blocks.map((b, i) => (
        <li key={`${i}-${b.name}`}>
          <Disclosure
            defaultOpen={defaultOpen}
            title={b.name}
            meta={
              <span className="tabular-nums">
                {b.total === 0
                  ? "Sin series para este atleta"
                  : `${b.done} de ${b.total} series`}
              </span>
            }
          >
            <ul className="flex flex-col gap-4">
              {b.exercises.map((e) => (
                <li key={`${e.blockIndex}.${e.exerciseIndex}`}>
                  <AdjustedHeader
                    exercise={e.exercise}
                    skipped={e.skipped}
                    unit={unit}
                  />
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {e.sets.map((s) => (
                      <li
                        key={s.setNumber}
                        className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                      >
                        {s.actual ? (
                          <CheckCircle2
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-positive"
                          />
                        ) : (
                          <CircleDashed
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium text-ink">
                            Serie {s.setNumber}:{" "}
                          </span>
                          <span
                            className={
                              s.actual ? "tabular-nums text-ink" : "text-muted"
                            }
                          >
                            {s.actual
                              ? formatActualSet(s.actual, unit)
                              : pendingLabel}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </Disclosure>
        </li>
      ))}
    </ol>
  );
}

/** Avance total: "9 de 12 series". */
export function ExecutionProgress({ summary }: { summary: SessionSummary }) {
  return (
    <ProgressBar
      value={summary.done}
      max={Math.max(1, summary.total)}
      label="Series registradas"
      showLabel
      valueText={`${summary.done} de ${summary.total}`}
      tone={summary.done === summary.total ? "positive" : "acid"}
    />
  );
}

/** Reportes de molestia: se muestran primero y con aviso (no solo color). */
export function DiscomfortList({ items }: { items: DiscomfortDTO[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li
          key={d.id}
          className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm"
        >
          <AlertTriangle
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              Molestia {DISCOMFORT_INTENSITY_LABEL[d.intensity].toLowerCase()} ·{" "}
              {DISCOMFORT_ZONE_LABEL[d.zone]}
            </p>
            {d.exerciseName && (
              <p className="text-muted">Durante: {d.exerciseName}</p>
            )}
            {d.note && (
              <p className="mt-1 whitespace-pre-line text-ink">{d.note}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
