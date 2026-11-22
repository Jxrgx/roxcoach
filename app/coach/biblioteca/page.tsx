import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { mockExercises } from "@/lib/mock/workouts";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { ExerciseLibrary } from "@/components/coach/exercise-library";

export const metadata: Metadata = { title: "Biblioteca" };

function NewExercise() {
  return (
    <ComingSoonButton
      icon={<Plus aria-hidden className="size-5" />}
      module="biblioteca de ejercicios"
      description="Podrás crear ejercicios propios con video, equipo necesario e indicaciones técnicas."
      fullWidth
      className="sm:w-auto"
    >
      Nuevo ejercicio
    </ComingSoonButton>
  );
}

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Biblioteca"
        description="Ejercicios y estaciones HYROX listos para usar en tus plantillas."
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
        <ExerciseLibrary exercises={mockExercises} />
      </ScreenStates>
    </>
  );
}
