import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findTemplateForCoach } from "@/lib/db/templates";
import { formatPrescription, publishProblems } from "@/lib/workouts/rules";
import { APP_TIME_ZONE, formatShortDate } from "@/lib/utils/format";
import { ScreenStates } from "@/components/shared/screen-states";
import { TemplatePreview } from "@/components/workouts/template-preview";
import { TemplateStatusBadge } from "@/components/workouts/template-status";
import { TemplateActions } from "@/components/coach/template-actions";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Plantilla" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/coach/entrenamientos/[id]">;

/** El enlace de regreso aparece al instante; la plantilla llega detrás de Suspense. */
export default function TemplateDetailPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/coach/entrenamientos" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Entrenamientos
      </Link>
      <Suspense fallback={<DetailSkeleton label="Cargando plantilla…" />}>
        <TemplateDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TemplateDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  // Una plantilla ajena (o un id inválido) se ve igual que una inexistente.
  const template = UUID_RE.test(id) ? await findTemplateForCoach(coach.id, id) : null;
  if (!template) notFound();

  const unit = coach.weightUnit;
  const archivedExercises = template.blocks.flatMap((b) => b.exercises).filter((e) => e.exerciseArchived);
  const missing =
    template.status === "borrador"
      ? publishProblems({ estimatedMinutes: template.estimatedMinutes, blocks: template.blocks.map((b) => ({ name: b.name, exerciseCount: b.exercises.length })) })
      : [];

  return (
    <>
      {query.guardado === "1" && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-positive/30 bg-positive/10 p-3.5 text-sm text-ink">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-positive" />
          Plantilla guardada.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <TemplateStatusBadge status={template.status} />
        <span>Actualizada el {formatShortDate(new Date(template.updatedAt), APP_TIME_ZONE)}</span>
      </div>

      <ScreenStates
        empty={{ title: "No encontramos esta plantilla", description: "Recarga la página para intentarlo de nuevo." }}
        loadingLabel="Cargando plantilla…"
      >
        <div className="mb-6">
          <TemplateActions id={template.id} name={template.name} status={template.status} />
        </div>

        {template.status === "borrador" && missing.length > 0 && (
          <div role="status" className="mb-4 rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold text-ink">Borrador: para publicarla falta</p>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {archivedExercises.length > 0 && (
          <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-ink">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            Usa {archivedExercises.length === 1 ? "un ejercicio archivado" : `${archivedExercises.length} ejercicios archivados`}. Sigue funcionando, pero
            considera cambiarlo al editar.
          </p>
        )}

        <TemplatePreview
          headingLevel={1}
          data={{
            name: template.name,
            focus: template.focus,
            intensity: template.intensity,
            estimatedMinutes: template.estimatedMinutes,
            blocks: template.blocks.map((b) => ({
              key: b.id,
              name: b.name,
              notes: b.notes,
              exercises: b.exercises.map((e) => ({
                key: e.id,
                name: e.exerciseName,
                prescription: formatPrescription(e, unit),
                notes: e.notes ?? "",
                archived: e.exerciseArchived,
              })),
            })),
          }}
        />
      </ScreenStates>
    </>
  );
}
