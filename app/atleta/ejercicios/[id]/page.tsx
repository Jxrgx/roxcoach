import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { findExerciseForAthlete } from "@/lib/db/exercises";
import { ScreenStates } from "@/components/shared/screen-states";
import { ExerciseDetail } from "@/components/workouts/exercise-detail";
import { DetailSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Ejercicio" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El contenido depende de la sesión y de la URL: llega detrás de Suspense (fase 14). */
export default function AthleteExercisePage({ params }: PageProps<"/atleta/ejercicios/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton label="Cargando ejercicio…" />}>
      <AthleteExercisePageContent params={params} />
    </Suspense>
  );
}

/**
 * Consulta de un ejercicio para el atleta (solo lectura). Visible si es de
 * RoxCoach o de su coach actual y no está archivado. Se enlazará desde las
 * sesiones cuando exista el constructor de entrenamientos.
 */
async function AthleteExercisePageContent({ params }: { params: PageProps<"/atleta/ejercicios/[id]">["params"] }) {
  const [{ id }, athlete] = await Promise.all([params, requireAthlete()]);
  const exercise = UUID_RE.test(id) ? await findExerciseForAthlete(athlete.id, id) : null;
  if (!exercise) notFound();

  return (
    <ScreenStates
      empty={{ title: "No encontramos este ejercicio", description: "Recarga la página para intentarlo de nuevo." }}
      loadingLabel="Cargando ejercicio…"
    >
      <ExerciseDetail
        exercise={exercise}
        substituteHref={(sid) => `/atleta/ejercicios/${sid}`}
        backLink={
          <Link href="/atleta/sesiones" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Entrenamiento
          </Link>
        }
      />
    </ScreenStates>
  );
}
