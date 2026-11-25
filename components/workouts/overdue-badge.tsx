import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Sesión de un día anterior que nunca se comenzó (startAvailability → "atrasada").
 * Icono + texto, no solo color. `compact` para tarjetas de lista.
 */
export function OverdueBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge tone="warning" icon={<History aria-hidden />}>
      {compact ? "Atrasada" : "Sesión atrasada"}
    </Badge>
  );
}
