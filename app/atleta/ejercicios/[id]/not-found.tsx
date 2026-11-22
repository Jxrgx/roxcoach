import { SearchX } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

export default function AthleteExerciseNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Ejercicio no disponible</h1>
      <StateMessage
        icon={<SearchX />}
        title="Este ejercicio no está disponible"
        description="Puede que tu coach lo haya retirado o que el enlace sea incorrecto."
        action={<ButtonLink href="/atleta/inicio">Ir a mi inicio</ButtonLink>}
      />
    </div>
  );
}
