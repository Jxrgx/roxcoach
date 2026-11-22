import { CalendarX2 } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/** Mismo mensaje para sesiones inexistentes o no asignadas: no revela si existen. */
export default function AthleteSessionNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Sesión no disponible</h1>
      <StateMessage
        icon={<CalendarX2 />}
        title="Esta sesión no está en tu agenda"
        description="Puede que tu coach te haya quitado de la sesión o que el enlace sea incorrecto."
        action={<ButtonLink href="/atleta/agenda">Ver mi agenda</ButtonLink>}
      />
    </div>
  );
}
