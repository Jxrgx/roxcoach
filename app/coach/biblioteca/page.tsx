import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listLibrary } from "@/lib/db/exercises";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
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

export default async function LibraryPage() {
  const coach = await requireCoach();
  const exercises = await listLibrary(coach.id);
  const own = exercises.filter((e) => e.origin === "own" && !e.archived).length;

  return (
    <>
      <PageHeader
        title="Biblioteca"
        description={`Ejercicios de RoxCoach${own ? ` y ${own} ${own === 1 ? "personalizado" : "personalizados"}` : ""}, listos para tus plantillas.`}
        action={<NewExercise />}
      />
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
    </>
  );
}
