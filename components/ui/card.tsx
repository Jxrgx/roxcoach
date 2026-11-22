import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface CardProps extends ComponentProps<"div"> {
  as?: ElementType;
  /** Superficie elevada para destacar un único bloque por pantalla. */
  elevated?: boolean;
  padding?: "none" | "sm" | "md";
}

const PADDING = { none: "", sm: "p-4", md: "p-5" } as const;

export function Card({ as: Tag = "div", elevated, padding = "md", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-line shadow-card",
        elevated ? "bg-surface-2" : "bg-surface",
        PADDING[padding],
        className,
      )}
      {...props}
    />
  );
}

/** Encabezado de sección dentro de una página: título + acción opcional. */
export function SectionHeader({
  title,
  action,
  id,
  className,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="text-base font-semibold text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}
