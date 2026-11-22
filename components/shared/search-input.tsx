"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

/** Buscador con etiqueta accesible y botón para limpiar. */
export function SearchInput({ label, placeholder, value, onChange }: SearchInputProps) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-12 w-full rounded-xl border border-line bg-surface pr-12 pl-11 text-base text-ink placeholder:text-muted/70 hover:border-muted/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
