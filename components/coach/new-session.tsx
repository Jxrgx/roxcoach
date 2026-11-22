import { CalendarPlus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/**
 * "Nueva sesión": lleva al flujo real de programación (plantilla publicada →
 * fecha → título y notas → atletas activos). Con `plantilla` preselecciona una.
 */
export function NewSessionButton({
  fullWidth,
  className,
  variant = "primary",
  templateId,
  label = "Nueva sesión",
}: {
  fullWidth?: boolean;
  className?: string;
  /** "secondary" para el CTA global de la barra lateral, que no compite con la acción de la página. */
  variant?: "primary" | "secondary";
  templateId?: string;
  label?: string;
}) {
  const href = templateId ? `/coach/sesiones/nueva?plantilla=${templateId}` : "/coach/sesiones/nueva";
  return (
    <ButtonLink href={href} variant={variant} fullWidth={fullWidth} className={className} icon={<CalendarPlus aria-hidden className="size-5" />}>
      {label}
    </ButtonLink>
  );
}
