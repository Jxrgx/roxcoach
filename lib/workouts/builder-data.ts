import "server-only";

import { listLibrary } from "@/lib/db/exercises";
import type { ExerciseOption } from "@/components/coach/exercise-picker-sheet";

/** Ejercicios elegibles en el constructor: sistema + propios, no archivados. */
export async function builderExerciseOptions(coachId: string): Promise<ExerciseOption[]> {
  const library = await listLibrary(coachId);
  return library
    .filter((e) => !e.archived)
    .map((e) => ({ id: e.id, name: e.name, category: e.category, equipment: e.equipment, own: e.origin === "own" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
