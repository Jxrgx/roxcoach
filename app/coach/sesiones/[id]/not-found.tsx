import { CalendarX2 } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/** Mismo mensaje para sesiones inexistentes y de otros coaches: no revela si existen. */
export default function SessionNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Sesión no encontrada</h1>
      <StateMessage
        icon={<CalendarX2 />}
        title="Esta sesión no está en tu calendario"
        description="Puede que el enlace sea incorrecto o que la sesión no sea tuya."
        action={<ButtonLink href="/coach/calendario">Ir al calendario</ButtonLink>}
      />
    </div>
  );
}
