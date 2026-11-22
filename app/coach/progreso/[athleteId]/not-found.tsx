import { UserX } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/** Mismo mensaje para atletas inexistentes y de otros coaches: no revela si existen. */
export default function AthleteProgressNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Atleta no encontrado</h1>
      <StateMessage
        icon={<UserX />}
        title="Este atleta no está en tu equipo"
        description="Puede que el enlace sea incorrecto o que el atleta ya no entrene contigo."
        action={<ButtonLink href="/coach/progreso">Ir a Progreso</ButtonLink>}
      />
    </div>
  );
}
