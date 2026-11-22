import { Archive, CheckCircle2, FilePen } from "lucide-react";
import { TEMPLATE_STATUS_LABEL, type TemplateStatusValue } from "@/lib/workouts/rules";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const CONFIG: Record<TemplateStatusValue, { tone: BadgeTone; icon: typeof Archive }> = {
  publicada: { tone: "positive", icon: CheckCircle2 },
  borrador: { tone: "warning", icon: FilePen },
  archivada: { tone: "neutral", icon: Archive },
};

/** Estado de una plantilla con icono + texto (no depende solo del color). */
export function TemplateStatusBadge({ status }: { status: TemplateStatusValue }) {
  const { tone, icon: Icon } = CONFIG[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden />}>
      {TEMPLATE_STATUS_LABEL[status]}
    </Badge>
  );
}
