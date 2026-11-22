import { SearchX } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/** Mismo mensaje para ejercicios inexistentes y de otros coaches: no revela si existen. */
export default function ExerciseNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Ejercicio no encontrado</h1>
      <StateMessage
        icon={<SearchX />}
        title="Este ejercicio no está en tu biblioteca"
        description="Puede que el enlace sea incorrecto o que el ejercicio no sea tuyo."
        action={<ButtonLink href="/coach/biblioteca">Ir a la biblioteca</ButtonLink>}
      />
    </div>
  );
}
