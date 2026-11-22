import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { StateMessage } from "@/components/ui/state-message";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Estado vacío: explica qué falta y ofrece la siguiente acción. */
export function EmptyState({ title, description, action, icon = <Inbox />, className }: EmptyStateProps) {
  return <StateMessage icon={icon} title={title} description={description} action={action} className={className} />;
}
