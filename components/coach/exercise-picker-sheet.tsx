"use client";

import { useState } from "react";
import { Plus, SearchX } from "lucide-react";
import { CATEGORY_LABEL, EXERCISE_CATEGORIES, type ExerciseCategoryValue } from "@/lib/exercises/rules";
import { normalizeSearch } from "@/lib/utils/format";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tabs } from "@/components/ui/tabs";
import { SearchInput } from "@/components/shared/search-input";

export interface ExerciseOption {
  id: string;
  name: string;
  category: ExerciseCategoryValue;
  equipment: string[];
  own: boolean;
}

/**
 * Elegir un ejercicio de la biblioteca (sistema + propios, no archivados).
 * Panel inferior: buscador y categorías al alcance del pulgar.
 */
export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
  options,
  blockName,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (option: ExerciseOption) => void;
  options: ExerciseOption[];
  blockName: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExerciseCategoryValue | "todas">("todas");
  const q = normalizeSearch(query);
  const visible = options.filter(
    (o) => (category === "todas" || o.category === category) && (q === "" || normalizeSearch(`${o.name} ${o.equipment.join(" ")}`).includes(q)),
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Agregar ejercicio" description={`Al bloque “${blockName}”.`}>
      <div className="flex flex-col gap-3">
        <SearchInput label="Buscar en la biblioteca" placeholder="Buscar por nombre o equipo" value={query} onChange={setQuery} />
        <Tabs
          label="Categorías"
          value={category}
          onChange={setCategory}
          items={[{ value: "todas" as const, label: "Todas" }, ...EXERCISE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
        />
        {visible.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <SearchX aria-hidden className="size-4" /> No hay ejercicios que coincidan.
          </p>
        ) : (
          <ul aria-label="Ejercicios de la biblioteca" className="flex flex-col gap-1">
            {visible.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onPick(o)}
                  aria-label={`Agregar ${o.name}`}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left hover:bg-surface-2"
                >
                  <Plus aria-hidden className="size-4 shrink-0 text-electric" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{o.name}</span>
                    <span className="block text-xs text-muted">
                      {CATEGORY_LABEL[o.category]}
                      {o.own ? " · Personalizado" : ""}
                      {o.equipment.length ? ` · ${o.equipment.join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
