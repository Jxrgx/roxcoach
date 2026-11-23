import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findTemplateForCoach } from "@/lib/db/templates";
import { builderExerciseOptions } from "@/lib/workouts/builder-data";
import { toTemplateInput } from "@/lib/workouts/convert";
import { canEditTemplate } from "@/lib/workouts/rules";
import { PageHeader } from "@/components/shared/page-header";
import { TemplateStatusBadge } from "@/components/workouts/template-status";
import { TemplateBuilder } from "@/components/coach/template-builder";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Editar plantilla" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/coach/entrenamientos/[id]/editar">;

/** El enlace de regreso y el encabezado dependen de la plantilla: todo llega detrás de Suspense. */
export default function EditTemplatePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl"><DetailSkeleton label="Cargando plantilla…" /></div>}>
      <EditTemplate params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditTemplate({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  const template = UUID_RE.test(id) ? await findTemplateForCoach(coach.id, id) : null;
  // Las archivadas no se editan: primero se restauran.
  if (!template || !canEditTemplate(template.status)) notFound();
  const options = await builderExerciseOptions(coach.id);

  const archivedInfo = Object.fromEntries(
    template.blocks.flatMap((b) => b.exercises).filter((e) => e.exerciseArchived).map((e) => [e.exerciseId, { name: e.exerciseName, category: e.category }]),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/coach/entrenamientos/${id}`} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Plantilla
      </Link>
      {query.copia === "1" && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-electric/30 bg-electric/10 p-3.5 text-sm text-ink">
          <Copy aria-hidden className="mt-0.5 size-4 shrink-0 text-electric" />
          Creamos una copia como borrador. Ajusta lo que necesites; la original no cambia.
        </p>
      )}
      <PageHeader
        eyebrow={<TemplateStatusBadge status={template.status} />}
        title="Editar plantilla"
        description={
          template.status === "publicada"
            ? "Está publicada: al guardar debe seguir completa (duración y ejercicios en cada bloque)."
            : template.name
        }
      />
      <TemplateBuilder
        templateId={template.id}
        weightUnit={coach.weightUnit}
        options={options}
        archivedInfo={archivedInfo}
        cancelHref={`/coach/entrenamientos/${id}`}
        initial={toTemplateInput(
          {
            name: template.name,
            focus: template.focus,
            intensity: template.intensity,
            estimatedMinutes: template.estimatedMinutes,
            blocks: template.blocks.map((b) => ({ name: b.name, notes: b.notes, exercises: b.exercises })),
          },
          coach.weightUnit,
        )}
      />
    </div>
  );
}
