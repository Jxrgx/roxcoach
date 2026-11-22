"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** id del panel controlado por las pestañas. */
  panelId?: string;
  className?: string;
}

/**
 * Pestañas accesibles (patrón WAI-ARIA con roving tabindex).
 * Flechas izquierda/derecha, Inicio y Fin para moverse con teclado.
 * En mobile se desplazan horizontalmente dentro de su propio contenedor.
 */
export function Tabs<T extends string>({ items, value, onChange, label, panelId, className }: TabsProps<T>) {
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusAt(index: number) {
    const total = items.length;
    const next = (index + total) % total;
    const item = items[next];
    if (!item) return;
    onChange(item.value);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight") focusAt(index + 1);
    else if (e.key === "ArrowLeft") focusAt(index - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(items.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <div role="tablist" aria-label={label} className="inline-flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1">
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              id={`${baseId}-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors",
                selected ? "bg-surface-2 font-semibold text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className={cn("tabular-nums text-xs", selected ? "text-acid" : "text-muted")}>{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
