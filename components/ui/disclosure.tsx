import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DisclosureProps {
  title: ReactNode;
  /** Resumen visible con el acordeón cerrado. */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Acordeón para información de nivel 3 (instrucciones, detalle de bloques).
 * Usa <details>/<summary> nativos: accesible por teclado y sin JavaScript.
 */
export function Disclosure({ title, meta, children, defaultOpen, className }: DisclosureProps) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-2xl border border-line bg-surface open:bg-surface", className)}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{title}</div>
          {meta && <div className="mt-0.5 text-sm text-muted">{meta}</div>}
        </div>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}
