"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Enlace de solo lectura con botón "Copiar enlace". Si el portapapeles no está
 * disponible, selecciona el texto para que la persona lo copie a mano.
 */
export function CopyLink({ link, label = "Enlace de invitación" }: { link: string; label?: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      inputRef.current?.select();
      setState("manual");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3.5 font-mono text-sm text-ink"
      />
      <Button
        variant={state === "copied" ? "secondary" : "primary"}
        onClick={copy}
        icon={state === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        fullWidth
      >
        {state === "copied" ? "Enlace copiado" : "Copiar enlace"}
      </Button>
      <p aria-live="polite" className="text-sm text-muted">
        {state === "manual" && "No pudimos copiar automáticamente. El enlace quedó seleccionado: cópialo con tu teclado."}
      </p>
    </div>
  );
}
