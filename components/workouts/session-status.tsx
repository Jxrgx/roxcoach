import { CheckCircle2, Clock, Moon, PlayCircle, XCircle } from "lucide-react";
import type { SessionStatus as Status } from "@/lib/types/domain";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const CONFIG: Record<Status, { label: string; tone: BadgeTone; icon: typeof Clock }> = {
  programada: { label: "Programada", tone: "neutral", icon: Clock },
  en_curso: { label: "En curso", tone: "acid", icon: PlayCircle },
  completada: { label: "Completada", tone: "positive", icon: CheckCircle2 },
  omitida: { label: "No realizada", tone: "danger", icon: XCircle },
  descanso: { label: "Descanso", tone: "info", icon: Moon },
};

/** Estado de una sesión con icono + texto (no depende solo del color). */
export function SessionStatus({ status }: { status: Status }) {
  const { label, tone, icon: Icon } = CONFIG[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden />}>
      {label}
    </Badge>
  );
}
