"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";
import type { Exercise, ExerciseCategory } from "@/lib/types/domain";
import { normalizeSearch } from "@/lib/utils/format";
import { SearchInput } from "@/components/shared/search-input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { CATEGORY_LABEL, ExerciseCard } from "@/components/workouts/exercise-card";

type Filter = "todas" | ExerciseCategory;

export function filterExercises(exercises: Exercise[], query: string, category: Filter) {
  const q = normalizeSearch(query);
  return exercises.filter(
    (e) => (category === "todas" || e.category === category) && (q === "" || normalizeSearch(e.name).includes(q)),
  );
}

export function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Filter>("todas");
  const visible = filterExercises(exercises, query, category);
  const categories = Object.keys(CATEGORY_LABEL) as ExerciseCategory[];

  return (
    <div className="flex flex-col gap-4">
      <SearchInput label="Buscar ejercicio" placeholder="Buscar ejercicio" value={query} onChange={setQuery} />
      <Tabs
        label="Categorías"
        panelId="lista-ejercicios"
        value={category}
        onChange={setCategory}
        items={[
          { value: "todas", label: "Todas", count: exercises.length },
          ...categories.map((c) => ({
            value: c,
            label: CATEGORY_LABEL[c],
            count: exercises.filter((e) => e.category === c).length,
          })),
        ]}
      />
      <div id="lista-ejercicios" role="tabpanel" aria-live="polite">
        {visible.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="No encontramos ejercicios"
            description={query ? `Nada coincide con “${query}”.` : "Aún no tienes ejercicios en esta categoría."}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((e) => (
              <li key={e.id}>
                <ExerciseCard exercise={e} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
