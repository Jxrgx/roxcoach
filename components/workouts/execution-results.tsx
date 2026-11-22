import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import type { SessionSummary } from "@/lib/execution/progress";
import type { DiscomfortDTO } from "@/lib/db/execution";
import { formatActualSet } from "@/lib/execution/format";
import { DISCOMFORT_INTENSITY_LABEL, DISCOMFORT_ZONE_LABEL } from "@/lib/execution/discomfort";
import { formatSetTarget, type WeightUnit } from "@/lib/workouts/rules";
import { Disclosure } from "@/components/ui/disclosure";
import { ProgressBar } from "@/components/ui/progress-bar";

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
                {b.done} de {b.total} series
              </span>
            }
          >
            <ul className="flex flex-col gap-4">
              {b.exercises.map((e) => (
                <li key={`${e.blockIndex}.${e.exerciseIndex}`}>
                  <p className="font-semibold text-ink">{e.exercise.name}</p>
                  <p className="text-sm text-muted">Planeado por serie: {formatSetTarget(e.exercise, unit)}</p>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {e.sets.map((s) => (
                      <li key={s.setNumber} className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                        {s.actual ? (
                          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
                        ) : (
                          <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium text-ink">Serie {s.setNumber}: </span>
                          <span className={s.actual ? "tabular-nums text-ink" : "text-muted"}>
                            {s.actual ? formatActualSet(s.actual, unit) : pendingLabel}
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
        <li key={d.id} className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              Molestia {DISCOMFORT_INTENSITY_LABEL[d.intensity].toLowerCase()} · {DISCOMFORT_ZONE_LABEL[d.zone]}
            </p>
            {d.exerciseName && <p className="text-muted">Durante: {d.exerciseName}</p>}
            {d.note && <p className="mt-1 whitespace-pre-line text-ink">{d.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
