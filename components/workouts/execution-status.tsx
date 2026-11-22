import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { EXECUTION_STATUS_LABEL, type ExecutionStatus } from "@/lib/execution/progress";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const CONFIG: Record<ExecutionStatus, { tone: BadgeTone; icon: typeof Circle }> = {
  sin_iniciar: { tone: "neutral", icon: Circle },
  en_curso: { tone: "acid", icon: PlayCircle },
  completada: { tone: "positive", icon: CheckCircle2 },
};

/** Estado de la ejecución de un atleta (icono + texto, no solo color). */
export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const { tone, icon: Icon } = CONFIG[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden />}>
      {EXECUTION_STATUS_LABEL[status]}
    </Badge>
  );
}
