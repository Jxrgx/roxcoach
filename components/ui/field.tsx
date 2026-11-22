"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface FieldBaseProps {
  label: string;
  hint?: string;
  error?: string;
  /** Oculta visualmente la etiqueta (sigue disponible para lectores). */
  hideLabel?: boolean;
  optional?: boolean;
}

const CONTROL =
  "w-full min-h-11 rounded-xl border bg-surface px-3.5 text-base text-ink placeholder:text-muted/70 " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-electric focus-visible:outline-offset-0 " +
  "disabled:opacity-60";

function controlClass(error?: string) {
  return cn(CONTROL, error ? "border-danger" : "border-line hover:border-muted/50");
}

function FieldShell({
  id,
  label,
  hint,
  error,
  hideLabel,
  optional,
  children,
}: FieldBaseProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn("text-sm font-medium text-ink", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(opcional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type InputProps = FieldBaseProps & Omit<ComponentProps<"input">, "id">;

export function Input({ label, hint, error, hideLabel, optional, className, ...props }: InputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} hideLabel={hideLabel} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClass(error), className)}
        {...props}
      />
    </FieldShell>
  );
}

type SelectProps = FieldBaseProps & Omit<ComponentProps<"select">, "id">;

export function Select({ label, hint, error, hideLabel, optional, className, children, ...props }: SelectProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} hideLabel={hideLabel} optional={optional}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClass(error), "appearance-none bg-[length:1rem] pr-10", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239BA3A8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.875rem center",
        }}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type TextareaProps = FieldBaseProps & Omit<ComponentProps<"textarea">, "id">;

export function Textarea({ label, hint, error, hideLabel, optional, className, rows = 4, ...props }: TextareaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} hideLabel={hideLabel} optional={optional}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClass(error), "py-2.5 leading-relaxed", className)}
        {...props}
      />
    </FieldShell>
  );
}
