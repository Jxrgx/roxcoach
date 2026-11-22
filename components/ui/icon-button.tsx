import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface IconButtonProps extends Omit<ComponentProps<"button">, "children" | "aria-label"> {
  /** Nombre accesible obligatorio: el icono solo no comunica la acción. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary";
}

/**
 * Botón de solo icono con área táctil de 44 × 44 px.
 * Usar únicamente para acciones secundarias; las críticas deben llevar texto.
 */
export function IconButton({ label, icon, variant = "ghost", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        variant === "ghost" ? "hover:bg-surface-2" : "bg-surface-2 border border-line hover:border-muted/50",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="[&>svg]:size-5">
        {icon}
      </span>
    </button>
  );
}
