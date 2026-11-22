import Link from "next/link";
import { AlertTriangle, Info, Trophy } from "lucide-react";
import {
  DISCOMFORT_INTENSITY_LABEL,
  DISCOMFORT_ZONE_LABEL,
} from "@/lib/execution/discomfort";
import {
  METRIC_LABEL,
  PERIOD_LABEL,
  PERIODS,
  percent,
  trendChange,
  type AdherenceSummary,
  type ExerciseProgress,
  type Period,
  type ProgressDiscomfort,
} from "@/lib/progress/metrics";
import {
  formatChange,
  formatMetric,
  sessionsLabel,
} from "@/lib/progress/format";
import { formatKeyShort, todayKey } from "@/lib/scheduling/dates";
import type { WeightUnit } from "@/lib/workouts/rules";
import { cn } from "@/lib/utils/cn";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * Piezas del módulo de progreso (atleta y coach). Todas muestran el periodo,
 * cuántas sesiones se usaron y si los datos son insuficientes.
 */

export const INSUFFICIENT = "Aún no hay datos suficientes";

/** Contexto de una métrica: periodo · sesiones usadas · aviso de datos insuficientes. */
export function DataNote({
  period,
  sessions,
  insufficient = false,
  className,
}: {
  period: string;
  sessions: number;
  insufficient?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 text-sm text-muted",
        className,
      )}
    >
      <span>{period}</span>
      <span aria-hidden>·</span>
      <span>{sessionsLabel(sessions)}</span>
      {insufficient && (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 text-warning">
            <Info aria-hidden className="size-3.5" />
            Datos insuficientes
          </span>
        </>
      )}
    </p>
  );
}

/** Selector compacto de periodo (enlaces: funciona sin JavaScript y se puede compartir). */
export function PeriodTabs({
  value,
  hrefFor,
  label = "Periodo",
}: {
  value: Period;
  hrefFor: (p: Period) => string;
  label?: string;
}) {
  const short: Record<Period, string> = {
    "7": "7 días",
    "30": "30 días",
    "90": "90 días",
    todo: "Todo",
  };
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1">
        {PERIODS.map((p) => (
          <li key={p}>
            <Link
              href={hrefFor(p)}
              aria-current={p === value ? "page" : undefined}
              aria-label={PERIOD_LABEL[p]}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-xl px-1 text-sm font-medium",
                p === value
                  ? "bg-surface-2 text-ink ring-1 ring-electric/60"
                  : "text-muted hover:text-ink",
              )}
            >
              {short[p]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** ¿Estoy cumpliendo? Adherencia como métrica principal + desglose textual. */
export function AdherenceCard({
  summary,
  period,
  title = "Adherencia",
}: {
  summary: AdherenceSummary;
  period: Period;
  title?: string;
}) {
  const rate = summary.rate;
  return (
    <section
      aria-labelledby="adherencia"
      className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <h2 id="adherencia" className="text-sm font-medium text-muted">
        {title}
      </h2>
      {rate === null ? (
        <p className="mt-2 text-lg font-semibold text-ink">{INSUFFICIENT}</p>
      ) : (
        <>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight tabular-nums text-acid">
              {percent(rate)}%
            </span>
            <span className="text-sm text-muted">
              {summary.completed} de {summary.due} completadas
            </span>
          </p>
          <ProgressBar
            className="mt-3"
            value={percent(rate)}
            label={title}
            size="sm"
            tone={summary.sufficient && rate < 0.7 ? "warning" : "acid"}
          />
        </>
      )}
      <DataNote
        className="mt-2"
        period={PERIOD_LABEL[period]}
        sessions={summary.due}
        insufficient={!summary.sufficient}
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {[
          ["Asignadas", summary.assigned],
          ["Iniciadas", summary.started],
          ["Completadas", summary.completed],
          ["No realizadas", summary.missed],
          ["Abandonadas", summary.abandoned],
          ["En curso o pendientes", summary.inProgress + summary.pending],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1.5"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Barras simples (decorativas para lectores de pantalla: la tabla lleva los datos). */
function TrendBars({
  points,
  label,
}: {
  points: { value: number }[];
  label: string;
}) {
  const shown = points.slice(-8);
  const max = Math.max(...shown.map((p) => p.value), 1);
  // Barras de ancho fijo (no se estiran con pocos puntos); la última, resaltada.
  return (
    <div aria-hidden data-label={label} className="flex h-12 items-end gap-1.5">
      {shown.map((p, i) => (
        <span
          key={i}
          className={cn("w-5 rounded-t", i === shown.length - 1 ? "bg-electric" : "bg-electric/40")}
          style={{ height: `${Math.max(6, (p.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** ¿Cómo estoy evolucionando? Tendencia por ejercicio comparable. */
export function ExerciseTrends({
  items,
  unit,
}: {
  items: ExerciseProgress[];
  unit: WeightUnit;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {items.map((e) => {
        const change = trendChange(e.points);
        const last = e.points[e.points.length - 1];
        return (
          <li
            key={e.key}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {e.group !== e.name && <p className="text-sm text-muted">{e.group}</p>}
                <h3 className="font-semibold text-ink">{e.name}</h3>
                <p className="text-sm text-muted">
                  {METRIC_LABEL[e.metric]} por sesión
                </p>
              </div>
              {last && (
                <p className="shrink-0 text-right">
                  <span className="block text-xl font-bold tabular-nums text-ink">
                    {formatMetric(e.metric, last.value, unit)}
                  </span>
                  {change !== null && (
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        change > 0 ? "text-positive" : "text-muted",
                      )}
                    >
                      {formatChange(e.metric, change, unit)}
                    </span>
                  )}
                </p>
              )}
            </div>
            {e.sufficient ? (
              <>
                <div className="mt-3">
                  <TrendBars points={e.points} label={e.name} />
                </div>
                {/* Una tabla ignora el ancho de sr-only: se envuelve en un bloque oculto. */}
                <div className="sr-only">
                  <table>
                    <caption>
                      {METRIC_LABEL[e.metric]} de {e.name} por sesión
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Fecha</th>
                        <th scope="col">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.points.map((p) => (
                        <tr key={p.sessionId}>
                          <td>{formatKeyShort(p.day)}</td>
                          <td>{formatMetric(e.metric, p.value, unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {change === null || change === 0
                    ? "Sin cambio"
                    : `${change > 0 ? "Subió" : "Bajó"} de ${formatMetric(e.metric, e.points[0]!.value, unit)} a ${formatMetric(e.metric, last!.value, unit)}`}{" "}
                  · {sessionsLabel(e.points.length)}
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
                {INSUFFICIENT}: {sessionsLabel(e.points.length)}; se necesitan
                al menos 2.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Marcas personales: solo valores comparables del mismo ejercicio y objetivo. */
export function PersonalRecords({
  items,
  unit,
}: {
  items: ExerciseProgress[];
  unit: WeightUnit;
}) {
  const rows = items.flatMap((e) =>
    e.records.map((r) => ({
      ...r,
      name: e.name,
      key: `${e.key}|${r.kind}`,
      sessions: e.sessions,
    })),
  );
  if (rows.length === 0)
    return <p className="text-sm text-muted">{INSUFFICIENT}.</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 px-4 py-3">
          <Trophy aria-hidden className="size-5 shrink-0 text-electric" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{r.name}</p>
            <p className="text-sm text-muted">
              {METRIC_LABEL[r.kind]} · {formatKeyShort(r.day)} · de {sessionsLabel(r.sessions)}
            </p>
          </div>
          <p className="shrink-0 text-lg font-bold tabular-nums text-ink">
            {formatMetric(r.kind, r.value, unit)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** ¿Hay algo que atender? Molestias recientes con fecha y sesión. */
export function RecentDiscomforts({
  items,
  sessionHref,
}: {
  items: (ProgressDiscomfort & { sessionId: string; sessionTitle: string })[];
  sessionHref: (sessionId: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li key={d.id}>
          <Link
            href={sessionHref(d.sessionId)}
            className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm hover:border-warning/70"
          >
            <AlertTriangle
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                Molestia {DISCOMFORT_INTENSITY_LABEL[d.intensity].toLowerCase()}{" "}
                · {DISCOMFORT_ZONE_LABEL[d.zone]}
              </span>
              <span className="block text-muted">
                {formatKeyShort(todayKey("America/Mexico_City", d.createdAt))} ·{" "}
                {d.sessionTitle}
                {d.exerciseName ? ` · ${d.exerciseName}` : ""}
              </span>
              {d.note && (
                <span className="mt-1 block whitespace-pre-line text-ink">
                  {d.note}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
