import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findExerciseForCoach, listSubstitutionCandidates } from "@/lib/db/exercises";
import { coachCanEdit } from "@/lib/exercises/rules";
import { PageHeader } from "@/components/shared/page-header";
import { ExerciseForm } from "@/components/coach/exercise-form";

export const metadata: Metadata = { title: "Editar ejercicio" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditExercisePage({ params, searchParams }: PageProps<"/coach/biblioteca/[id]/editar">) {
  const [{ id }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  const exercise = UUID_RE.test(id) ? await findExerciseForCoach(coach.id, id) : null;
  // Solo se editan ejercicios propios y activos; los del sistema se duplican.
  if (!exercise || !coachCanEdit({ coachId: exercise.coachId, archived: exercise.archived }, coach.id) || exercise.archived) notFound();
  const options = await listSubstitutionCandidates(coach.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/coach/biblioteca/${id}`} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Ejercicio
      </Link>
      {query.copia === "1" && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-electric/30 bg-electric/10 p-3.5 text-sm text-ink">
          <Copy aria-hidden className="mt-0.5 size-4 shrink-0 text-electric" />
          Creamos tu copia personalizada. Ajusta lo que necesites; el original de RoxCoach no cambia.
        </p>
      )}
      <PageHeader title="Editar ejercicio" description={exercise.name} />
      <ExerciseForm
        exerciseId={exercise.id}
        cancelHref={`/coach/biblioteca/${id}`}
        substitutionOptions={options}
        initial={{
          name: exercise.name,
          category: exercise.category,
          difficulty: exercise.difficulty,
          instructions: exercise.instructions,
          cue: exercise.cue,
          equipment: exercise.equipment,
          mediaType: exercise.mediaType ?? "",
          mediaUrl: exercise.mediaUrl ?? "",
          // Las sustituciones archivadas se quitan al editar (ya no son elegibles).
          substituteIds: exercise.substitutes.filter((s) => !s.archived).map((s) => s.id),
        }}
      />
    </div>
  );
}
