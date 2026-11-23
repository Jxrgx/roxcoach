import { CalendarX2, SearchX, UserX } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";

/**
 * Mensajes de "no encontrado" de las rutas de detalle. Los usan los
 * `not-found.tsx` de cada ruta (navegación cliente, dentro del shell) y el
 * las páginas 404 prerenderizadas de app/no-encontrado (404 real en cargas directas).
 * Mismo mensaje para inexistentes y ajenos: no revela si el recurso existe.
 */

function Message({ srTitle, icon, title, description, href, action }: { srTitle: string; icon: React.ReactNode; title: string; description: string; href: string; action: string }) {
  return (
    <div className="py-6">
      <h1 className="sr-only">{srTitle}</h1>
      <StateMessage icon={icon} title={title} description={description} action={<ButtonLink href={href}>{action}</ButtonLink>} />
    </div>
  );
}

export const AthleteNotFound = () => (
  <Message
    srTitle="Atleta no encontrado"
    icon={<UserX />}
    title="Este atleta no está en tu equipo"
    description="Puede que el enlace sea incorrecto o que el atleta ya no esté vinculado contigo."
    href="/coach/atletas"
    action="Ver mis atletas"
  />
);

export const AthleteProgressNotFound = () => (
  <Message
    srTitle="Atleta no encontrado"
    icon={<UserX />}
    title="Este atleta no está en tu equipo"
    description="Puede que el enlace sea incorrecto o que el atleta ya no entrene contigo."
    href="/coach/progreso"
    action="Ir a Progreso"
  />
);

export const ExerciseNotFound = () => (
  <Message
    srTitle="Ejercicio no encontrado"
    icon={<SearchX />}
    title="Este ejercicio no está en tu biblioteca"
    description="Puede que el enlace sea incorrecto o que el ejercicio no sea tuyo."
    href="/coach/biblioteca"
    action="Ir a la biblioteca"
  />
);

export const TemplateNotFound = () => (
  <Message
    srTitle="Plantilla no encontrada"
    icon={<SearchX />}
    title="Esta plantilla no está entre tus entrenamientos"
    description="Puede que el enlace sea incorrecto o que la plantilla no sea tuya."
    href="/coach/entrenamientos"
    action="Ver mis plantillas"
  />
);

export const SessionNotFound = () => (
  <Message
    srTitle="Sesión no encontrada"
    icon={<CalendarX2 />}
    title="Esta sesión no está en tu calendario"
    description="Puede que el enlace sea incorrecto o que la sesión no sea tuya."
    href="/coach/calendario"
    action="Ir al calendario"
  />
);

export const AthleteSessionNotFound = () => (
  <Message
    srTitle="Sesión no disponible"
    icon={<CalendarX2 />}
    title="Esta sesión no está en tu agenda"
    description="Puede que tu coach te haya quitado de la sesión o que el enlace sea incorrecto."
    href="/atleta/agenda"
    action="Ver mi agenda"
  />
);

export const AthleteExerciseNotFound = () => (
  <Message
    srTitle="Ejercicio no disponible"
    icon={<SearchX />}
    title="Este ejercicio no está disponible"
    description="Puede que tu coach lo haya retirado o que el enlace sea incorrecto."
    href="/atleta/inicio"
    action="Ir a mi inicio"
  />
);
