"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { normalizeSearch } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/shared/avatar";
import { SearchInput } from "@/components/shared/search-input";

export interface SelectableAthlete {
  athleteId: string;
  name: string;
  division: string;
}

/**
 * Selección múltiple de atletas activos: buscador, "Seleccionar todos" y filas
 * de 44 px con casilla real (accesible por teclado y lector de pantalla).
 */
export function AthleteMultiSelect({
  athletes,
  value,
  onChange,
  error,
  legend = "Atletas",
}: {
  athletes: SelectableAthlete[];
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  legend?: string;
}) {
  const [query, setQuery] = useState("");
  const errorId = useId();
  const q = normalizeSearch(query);
  const visible = athletes.filter((a) => q === "" || normalizeSearch(`${a.name} ${a.division}`).includes(q));
  const allVisibleSelected = visible.length > 0 && visible.every((a) => value.includes(a.athleteId));

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const toggleAll = () =>
    onChange(
      allVisibleSelected
        ? value.filter((id) => !visible.some((a) => a.athleteId === id))
        : [...new Set([...value, ...visible.map((a) => a.athleteId)])],
    );

  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-3">
      <legend className="sr-only">{legend}</legend>
      {athletes.length > 6 && <SearchInput label="Buscar atleta" placeholder="Buscar atleta" value={query} onChange={setQuery} />}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {value.length} de {athletes.length} seleccionados
        </p>
        {visible.length > 1 && (
          <button type="button" onClick={toggleAll} className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-medium text-electric hover:underline">
            {allVisibleSelected ? "Quitar todos" : "Seleccionar todos"}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted">No hay atletas que coincidan.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((a) => {
            const checked = value.includes(a.athleteId);
            return (
              <li key={a.athleteId}>
                <label
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-electric",
                    checked ? "border-electric bg-electric/10" : "border-line bg-surface hover:border-muted/50",
                  )}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(a.athleteId)} className="sr-only" />
                  <Avatar name={a.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{a.name}</span>
                    <span className="block text-xs text-muted">{a.division || "División sin definir"}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border", checked ? "border-electric bg-electric text-bg" : "border-line")}
                  >
                    {checked && <Check className="size-4" />}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
