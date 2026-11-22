import type { Metadata } from "next";
import { CheckCircle2, Percent, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { mockAthleteProgress } from "@/lib/mock/athlete";
import { formatClock } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { MetricTile } from "@/components/shared/metric-tile";
import { SectionHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export const metadata: Metadata = { title: "Progreso" };

/** Diferencia de tiempo: negativa = mejora (menos segundos). */
function Delta({ previous, current }: { previous: number; current: number }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-sm text-muted">Sin cambio</span>;
  const better = diff < 0;
  const Icon = better ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${better ? "text-positive" : "text-warning"}`}>
      <Icon aria-hidden className="size-4" />
      {better ? "−" : "+"}
      {formatClock(Math.abs(diff))}
      <span className="font-normal text-muted">{better ? " mejor" : " más lento"}</span>
    </span>
  );
}

export default function AthleteProgressPage() {
  const p = mockAthleteProgress;
  return (
    <>
      <PageHeader title="Progreso" description="Tu constancia y tus mejores marcas." />
      <ScreenStates
        empty={{
          title: "Aún no tienes resultados",
          description: "Completa tu primer entrenamiento para empezar a ver tu progreso.",
        }}
        loadingLabel="Cargando progreso…"
        loadingVariant="cards"
      >
        <dl className="grid grid-cols-2 gap-3">
          <MetricTile icon={<CheckCircle2 />} label="Completadas" value={String(p.completedSessions)} context="sesiones en total" />
          <MetricTile icon={<Percent />} label="Adherencia" value={`${p.adherence}%`} context="últimas 4 semanas">
            <ProgressBar className="mt-3" value={p.adherence} label="Adherencia" size="sm" />
          </MetricTile>
        </dl>

        <section aria-labelledby="marcas" className="mt-8">
          <SectionHeader id="marcas" title="Marcas personales" />
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {p.personalRecords.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Trophy aria-hidden className="size-5 shrink-0 text-acid" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{r.label}</p>
                  <p className="text-sm text-muted">{r.date}</p>
                </div>
                <p className="text-lg font-bold tabular-nums text-ink">{r.value}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="estaciones" className="mt-8">
          <SectionHeader id="estaciones" title="Evolución por estación" />
          <p className="-mt-1 mb-3 text-sm text-muted">Mejor tiempo actual comparado con el bloque anterior.</p>
          <ul className="flex flex-col gap-2">
            {p.stations.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3">
                <div>
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-sm text-muted">
                    Antes <span className="tabular-nums">{formatClock(s.previous)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-ink">{formatClock(s.current)}</p>
                  <Delta previous={s.previous} current={s.current} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </ScreenStates>
    </>
  );
}
