"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { CATEGORY_LABEL, MAX_SUBSTITUTIONS, type ExerciseCategoryValue } from "@/lib/exercises/rules";
import { normalizeSearch } from "@/lib/utils/format";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/shared/search-input";

export interface SubstitutionOption {
  id: string;
  name: string;
  category: ExerciseCategoryValue;
}

interface SubstitutionPickerProps {
  options: SubstitutionOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** El propio ejercicio (al editar) no puede ser su sustitución. */
  excludeId?: string;
  error?: string;
}

/**
 * Sustituciones en orden de preferencia (máx. 5). Lista elegida arriba
 * (reordenar/quitar) y buscador para agregar. Botones de 44 px con nombre accesible.
 */
export function SubstitutionPicker({ options, value, onChange, excludeId, error }: SubstitutionPickerProps) {
  const [query, setQuery] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const full = value.length >= MAX_SUBSTITUTIONS;
  const q = normalizeSearch(query);
  const candidates = options
    .filter((o) => o.id !== excludeId && !value.includes(o.id))
    .filter((o) => q === "" || normalizeSearch(o.name).includes(q))
    .slice(0, 8);

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-ink">
          Elegidas <span className="font-normal text-muted">({value.length} de {MAX_SUBSTITUTIONS})</span>
        </p>
        {value.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">Sin sustituciones. Agrega alternativas por si falta equipo o hay molestias.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {value.map((id, index) => {
              const option = byId.get(id);
              const name = option?.name ?? "Ejercicio no disponible";
              return (
                <li key={id} className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-3">
                  <span className="mr-1 text-sm tabular-nums text-muted">{index + 1}.</span>
                  <span className="min-w-0 flex-1 py-1">
                    <span className="block text-sm font-medium text-ink">{name}</span>
                    {option && <span className="block text-xs text-muted">{CATEGORY_LABEL[option.category]}</span>}
                  </span>
                  <IconButton label={`Subir ${name}`} icon={<ArrowUp />} onClick={() => move(index, -1)} disabled={index === 0} />
                  <IconButton label={`Bajar ${name}`} icon={<ArrowDown />} onClick={() => move(index, 1)} disabled={index === value.length - 1} />
                  <IconButton label={`Quitar ${name}`} icon={<X />} onClick={() => onChange(value.filter((v) => v !== id))} />
                </li>
              );
            })}
          </ol>
        )}
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {full ? (
        <p className="text-sm text-muted">Llegaste al máximo de {MAX_SUBSTITUTIONS}. Quita una para agregar otra.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <SearchInput label="Buscar ejercicio para sustituir" placeholder="Buscar ejercicio" value={query} onChange={setQuery} />
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">No hay ejercicios que coincidan.</p>
          ) : (
            <ul aria-label="Ejercicios disponibles" className="flex flex-col gap-1">
              {candidates.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onChange([...value, o.id])}
                    aria-label={`Agregar ${o.name} como sustitución`}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-surface-2"
                  >
                    <Plus aria-hidden className="size-4 shrink-0 text-electric" />
                    {/* Sin truncar: el nombre completo se ajusta en varias líneas. */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{o.name}</span>
                      <span className="block text-xs text-muted">{CATEGORY_LABEL[o.category]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
