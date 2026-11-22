"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  filterLibrary,
  type ExerciseCategoryValue,
  type ExerciseDifficultyValue,
  type OriginFilter,
} from "@/lib/exercises/rules";
import type { ExerciseListItemDTO } from "@/lib/db/exercises";
import { SearchInput } from "@/components/shared/search-input";
import { Tabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { ExerciseCard } from "@/components/workouts/exercise-card";

type CategoryFilter = ExerciseCategoryValue | "todas";

const ORIGIN_LABEL: Record<OriginFilter, string> = {
  todos: "Todos",
  system: "RoxCoach",
  own: "Mis ejercicios",
  archivados: "Archivados",
};

export function ExerciseLibrary({ exercises }: { exercises: ExerciseListItemDTO[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("todas");
  const [difficulty, setDifficulty] = useState<ExerciseDifficultyValue | "todas">("todas");
  const [origin, setOrigin] = useState<OriginFilter>("todos");

  const visible = filterLibrary(exercises, { query, category, difficulty, origin });
  const countFor = (c: CategoryFilter) => filterLibrary(exercises, { query: "", category: c, difficulty: "todas", origin }).length;
  const filtered = query !== "" || category !== "todas" || difficulty !== "todas";

  return (
    <div className="flex flex-col gap-4">
      <SearchInput label="Buscar ejercicio" placeholder="Buscar por nombre o equipo" value={query} onChange={setQuery} />
      <Tabs
        label="Categorías"
        panelId="lista-ejercicios"
        value={category}
        onChange={setCategory}
        items={[
          { value: "todas" as const, label: "Todas", count: countFor("todas") },
          ...EXERCISE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c], count: countFor(c) })),
        ]}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Select label="Dificultad" value={difficulty} onChange={(e) => setDifficulty(e.target.value as ExerciseDifficultyValue | "todas")}>
          <option value="todas">Todas</option>
          {EXERCISE_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </Select>
        <Select label="Origen" value={origin} onChange={(e) => setOrigin(e.target.value as OriginFilter)}>
          {(Object.keys(ORIGIN_LABEL) as OriginFilter[]).map((o) => (
            <option key={o} value={o}>
              {ORIGIN_LABEL[o]}
            </option>
          ))}
        </Select>
      </div>

      <div id="lista-ejercicios" role="tabpanel" aria-live="polite">
        {visible.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={
              origin === "archivados" && !filtered
                ? "No tienes ejercicios archivados"
                : origin === "own" && !filtered
                  ? "Aún no tienes ejercicios personalizados"
                  : "No encontramos ejercicios"
            }
            description={
              query
                ? `Nada coincide con “${query}”. Revisa la ortografía o cambia los filtros.`
                : origin === "own" && !filtered
                  ? "Crea uno nuevo o duplica un ejercicio de RoxCoach para personalizarlo."
                  : "Prueba con otra categoría o dificultad."
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((e) => (
              <li key={e.id}>
                <ExerciseCard exercise={e} href={`/coach/biblioteca/${e.id}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
