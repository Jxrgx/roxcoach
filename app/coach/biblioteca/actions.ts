"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { createExercise, duplicateSystemExercise, setExerciseArchived, updateExercise, type ExerciseWriteData } from "@/lib/db/exercises";
import { SUBSTITUTION_ERROR_MESSAGE, type ExerciseCategoryValue, type ExerciseDifficultyValue, type MediaTypeValue } from "@/lib/exercises/rules";
import { hasErrors, validateExercise, type ActionResult, type ExerciseInput } from "@/lib/validations";

/**
 * Acciones del coach sobre su biblioteca. Todas verifican la sesión
 * (requireCoach), repiten la validación en servidor y solo actúan sobre
 * ejercicios PROPIOS (filtro coachId en lib/db/exercises).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No pudimos guardar el ejercicio. Revisa tu conexión e inténtalo de nuevo.";

function toWriteData(input: ExerciseInput): ExerciseWriteData {
  const mediaType = input.mediaType === "video" || input.mediaType === "imagen" ? (input.mediaType as MediaTypeValue) : null;
  return {
    name: input.name.trim(),
    category: input.category as ExerciseCategoryValue,
    difficulty: input.difficulty as ExerciseDifficultyValue,
    instructions: input.instructions.trim(),
    cue: input.cue.trim() || null,
    equipment: input.equipment,
    mediaType,
    mediaUrl: mediaType ? input.mediaUrl.trim() : null,
    substituteIds: input.substituteIds,
  };
}

function revalidateLibrary(id?: string) {
  revalidatePath("/coach/biblioteca");
  if (id) revalidatePath(`/coach/biblioteca/${id}`);
}

export async function createExerciseAction(input: ExerciseInput): Promise<ActionResult<keyof ExerciseInput>> {
  const coach = await requireCoach();
  const errors = validateExercise(input);
  if (hasErrors(errors)) return { ok: false, errors };
  let result;
  try {
    result = await createExercise(coach.id, toWriteData(input));
  } catch (error) {
    console.error("createExerciseAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) {
    return { ok: false, errors: { substituteIds: result.reason === "not-found" ? GENERIC_ERROR : SUBSTITUTION_ERROR_MESSAGE[result.reason] } };
  }
  revalidateLibrary();
  redirect(`/coach/biblioteca/${result.id}?guardado=1`);
}

export async function updateExerciseAction(id: string, input: ExerciseInput): Promise<ActionResult<keyof ExerciseInput>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "El ejercicio no existe." };
  const errors = validateExercise(input);
  if (hasErrors(errors)) return { ok: false, errors };
  let result;
  try {
    result = await updateExercise(coach.id, id, toWriteData(input));
  } catch (error) {
    console.error("updateExerciseAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) {
    if (result.reason === "not-found") return { ok: false, message: "Solo puedes editar tus ejercicios activos." };
    return { ok: false, errors: { substituteIds: SUBSTITUTION_ERROR_MESSAGE[result.reason] } };
  }
  revalidateLibrary(id);
  redirect(`/coach/biblioteca/${id}?guardado=1`);
}

async function changeArchived(id: string, archived: boolean): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "El ejercicio no existe." };
  try {
    const ok = await setExerciseArchived(coach.id, id, archived);
    if (!ok) return { ok: false, message: "El ejercicio cambió o no es tuyo. Recarga la página." };
  } catch (error) {
    console.error("changeArchived", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateLibrary(id);
  return { ok: true };
}

export async function archiveExerciseAction(id: string) {
  return changeArchived(id, true);
}

export async function restoreExerciseAction(id: string) {
  return changeArchived(id, false);
}

/** Duplica un ejercicio del sistema como propio y abre la copia para editarla. */
export async function duplicateExerciseAction(id: string): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "El ejercicio no existe." };
  let result;
  try {
    result = await duplicateSystemExercise(coach.id, id);
  } catch (error) {
    console.error("duplicateExerciseAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) return { ok: false, message: "Solo puedes duplicar ejercicios de RoxCoach." };
  revalidateLibrary();
  redirect(`/coach/biblioteca/${result.id}/editar?copia=1`);
}
