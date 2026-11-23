import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findExerciseForCoach } from "@/lib/db/exercises";
import { ScreenStates } from "@/components/shared/screen-states";
import { ExerciseDetail } from "@/components/workouts/exercise-detail";
import { ExerciseActions } from "@/components/coach/exercise-actions";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Ejercicio" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/coach/biblioteca/[id]">;

/** El título es el nombre del ejercicio: el detalle completo llega detrás de Suspense. */
export default function CoachExercisePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<DetailSkeleton label="Cargando ejercicio…" />}>
      <CoachExercise params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CoachExercise({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ id }, query, coach] = await Promise.all([params, searchParams, requireCoach()]);
  // Un ejercicio de otro coach (o un id inválido) se ve igual que uno inexistente.
  const exercise = UUID_RE.test(id) ? await findExerciseForCoach(coach.id, id) : null;
  if (!exercise) notFound();

  return (
    <ScreenStates
      empty={{ title: "No encontramos este ejercicio", description: "Recarga la página para intentarlo de nuevo." }}
      loadingLabel="Cargando ejercicio…"
    >
      <ExerciseDetail
        exercise={exercise}
        substituteHref={(sid) => `/coach/biblioteca/${sid}`}
        backLink={
          <Link href="/coach/biblioteca" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Biblioteca
          </Link>
        }
        notice={
          query.guardado === "1" ? (
            <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-positive/30 bg-positive/10 p-3.5 text-sm text-ink">
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-positive" />
              Ejercicio guardado.
            </p>
          ) : undefined
        }
        actions={<ExerciseActions id={exercise.id} name={exercise.name} origin={exercise.origin} archived={exercise.archived} />}
      />
    </ScreenStates>
  );
}
