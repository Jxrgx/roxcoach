"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";

/** Sección de formulario (tarjeta con título): divide formularios largos. */
export function FormSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id}>
      <h2 id={id} className="text-base font-semibold text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

/** Opción seleccionable tipo "chip" con área táctil de 44 px y estado no solo por color. */
export function ToggleChip({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={cn("relative", disabled && "pointer-events-none opacity-60")}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-sm transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-electric",
          checked ? "border-electric bg-electric/15 font-semibold text-ink" : "border-line bg-surface-2 text-muted",
        )}
      >
        {checked && <Check aria-hidden className="size-4" />}
        {label}
      </span>
    </label>
  );
}
