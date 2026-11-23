import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Plus } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listLibrary } from "@/lib/db/exercises";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";
import { ButtonLink } from "@/components/ui/button";
import { ExerciseLibrary } from "@/components/coach/exercise-library";

export const metadata: Metadata = { title: "Biblioteca" };

function NewExercise() {
  return (
    <ButtonLink href="/coach/biblioteca/nuevo" icon={<Plus aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
      Nuevo ejercicio
    </ButtonLink>
  );
}

/** Biblioteca del coach, una vez por petición (la comparten el resumen y la lista). */
const loadLibrary = cache(async () => {
  const coach = await requireCoach();
  return listLibrary(coach.id);
});

/** La estructura (título y acción) aparece al instante; el resumen y la lista llegan con los datos. */
export default function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Biblioteca"
        description={
          <Suspense fallback={<InlineSkeleton />}>
            <LibrarySummary />
          </Suspense>
        }
        action={<NewExercise />}
      />
      <Suspense fallback={<ContentSkeleton label="Cargando biblioteca…" variant="cards" />}>
        <LibraryContent />
      </Suspense>
    </>
  );
}

async function LibrarySummary() {
  const exercises = await loadLibrary();
  const own = exercises.filter((e) => e.origin === "own" && !e.archived).length;
  return <>{`Ejercicios de RoxCoach${own ? ` y ${own} ${own === 1 ? "personalizado" : "personalizados"}` : ""}, listos para tus plantillas.`}</>;
}

async function LibraryContent() {
  const exercises = await loadLibrary();
  return (
    <ScreenStates
      empty={{
        title: "Aún no tienes ejercicios personalizados",
        description: "Crea tu primer ejercicio para reutilizarlo en tus plantillas.",
        action: <NewExercise />,
      }}
      loadingLabel="Cargando biblioteca…"
      loadingVariant="cards"
    >
      <ExerciseLibrary exercises={exercises} />
    </ScreenStates>
  );
}
