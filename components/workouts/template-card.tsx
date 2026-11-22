import Link from "next/link";
import { ChevronRight, Clock, Layers } from "lucide-react";
import type { TemplateListItemDTO } from "@/lib/db/templates";
import { formatDuration } from "@/lib/utils/format";
import { Intensity } from "@/components/workouts/intensity";
import { TemplateStatusBadge } from "@/components/workouts/template-status";

/** Plantilla en la lista del coach (enlace al detalle). */
export function TemplateCard({ template }: { template: TemplateListItemDTO }) {
  return (
    <Link
      href={`/coach/entrenamientos/${template.id}`}
      className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-4 pr-10 shadow-card transition-colors hover:border-muted/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-ink">{template.name}</h3>
        <TemplateStatusBadge status={template.status} />
      </div>
      {template.focus && <p className="mt-1 text-sm text-muted">{template.focus}</p>}
      <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Duración</dt>
          <Clock aria-hidden className="size-4 text-muted" />
          <dd className="tabular-nums text-ink">{template.estimatedMinutes ? formatDuration(template.estimatedMinutes) : "Sin duración"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Contenido</dt>
          <Layers aria-hidden className="size-4 text-muted" />
          <dd className="text-ink">
            {template.blockCount} {template.blockCount === 1 ? "bloque" : "bloques"} · {template.exerciseCount}{" "}
            {template.exerciseCount === 1 ? "ejercicio" : "ejercicios"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Intensidad</dt>
          <dd>
            <Intensity level={template.intensity} />
          </dd>
        </div>
      </dl>
      <ChevronRight aria-hidden className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted group-hover:text-ink" />
    </Link>
  );
}
