import { cn } from "@/lib/utils/cn";

interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  /** Muestra la etiqueta y el valor encima de la barra. */
  showLabel?: boolean;
  valueText?: string;
  tone?: "acid" | "positive" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  className?: string;
}

const TONE = {
  acid: "bg-acid",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-electric",
} as const;

export function ProgressBar({
  value,
  max = 100,
  label,
  showLabel = false,
  valueText,
  tone = "acid",
  size = "md",
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const text = valueText ?? `${Math.round(pct)}%`;
  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">{label}</span>
          <span className="font-semibold tabular-nums text-ink">{text}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className={cn("w-full overflow-hidden rounded-full bg-surface-2", size === "sm" ? "h-1.5" : "h-2.5")}
      >
        <div className={cn("h-full rounded-full transition-[width]", TONE[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
