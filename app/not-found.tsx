import { Compass } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <StateMessage
        icon={<Compass />}
        title="No encontramos esta página"
        description="Puede que el enlace haya cambiado. Vuelve al inicio para continuar."
        action={<ButtonLink href="/">Ir al inicio</ButtonLink>}
      />
    </main>
  );
}
