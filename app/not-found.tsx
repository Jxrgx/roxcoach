import { Compass } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/**
 * 404 genérico (rutas que no existen). Debe seguir siendo ESTÁTICO: es el
 * límite "no encontrado" raíz de todas las páginas, y si leyera la petición
 * volvería parciales a /login, /registro y a las páginas offline que precachea
 * el service worker. Los 404 de detalles con el shell de cada área viven en
 * app/no-encontrado (ver proxy y docs/architecture.md → Estado HTTP).
 */
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
