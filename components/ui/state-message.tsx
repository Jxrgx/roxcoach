import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type StateTone = "neutral" | "danger" | "warning" | "info";

const ICON_TONE: Record<StateTone, string> = {
  neutral: "bg-surface-2 text-muted",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  info: "bg-electric/10 text-electric",
};

export interface StateMessageProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: StateTone;
  role?: "status" | "alert";
  className?: string;
}

/** Base visual compartida por los estados vacío, error, sin conexión y sin permisos. */
export function StateMessage({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  role = "status",
  className,
}: StateMessageProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-10 text-center",
        className,
      )}
    >
      <div aria-hidden className={cn("mb-4 flex size-12 items-center justify-center rounded-2xl [&>svg]:size-6", ICON_TONE[tone])}>
        {icon}
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row">{action}</div>}
    </div>
  );
}
