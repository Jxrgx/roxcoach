import { SearchX } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/** Mismo mensaje para plantillas inexistentes y ajenas: no revela si existen. */
export default function TemplateNotFound() {
  return (
    <div className="py-6">
      <h1 className="sr-only">Plantilla no encontrada</h1>
      <StateMessage
        icon={<SearchX />}
        title="Esta plantilla no está entre tus entrenamientos"
        description="Puede que el enlace sea incorrecto o que la plantilla no sea tuya."
        action={<ButtonLink href="/coach/entrenamientos">Ver mis plantillas</ButtonLink>}
      />
    </div>
  );
}
