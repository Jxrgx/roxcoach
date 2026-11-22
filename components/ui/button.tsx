import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

interface StyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

const VARIANT: Record<ButtonVariant, string> = {
  // Amarillo ácido reservado para la acción principal de la pantalla.
  primary: "bg-acid text-on-acid hover:bg-acid-strong font-semibold",
  secondary: "bg-surface-2 text-ink border border-line hover:border-muted/50 font-medium",
  ghost: "bg-transparent text-ink hover:bg-surface-2 font-medium",
  danger: "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20 font-semibold",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm gap-2",
  lg: "min-h-13 px-6 text-base gap-2.5",
};

/** Clases de botón reutilizables para <button> y <Link>. */
export function buttonStyles({ variant = "primary", size = "md", fullWidth, className }: StyleOptions = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-xl transition-colors select-none",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    fullWidth && "w-full",
    className,
  );
}

interface ButtonProps extends ComponentProps<"button">, Omit<StyleOptions, "className"> {
  loading?: boolean;
  /** Texto para lectores de pantalla y botón mientras `loading` es true. */
  loadingLabel?: string;
  icon?: ReactNode;
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingLabel = "Guardando…",
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link>, Omit<StyleOptions, "className"> {
  icon?: ReactNode;
}

export function ButtonLink({ variant, size, fullWidth, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
