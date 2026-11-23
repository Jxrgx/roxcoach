"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { changeTemplateStatus, duplicateTemplate, saveTemplate } from "@/lib/db/templates";
import { toTemplateWriteData } from "@/lib/workouts/convert";
import type { TemplateStatusValue } from "@/lib/workouts/rules";
import { validateTemplate, type TemplateErrors, type TemplateInput } from "@/lib/validations";
import { logError } from "@/lib/log";

/**
 * Acciones del coach sobre sus plantillas. Todas verifican la sesión
 * (requireCoach), repiten la validación en servidor con la unidad del coach
 * y solo actúan sobre plantillas PROPIAS (filtro coachId en lib/db/templates).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No pudimos guardar la plantilla. Revisa tu conexión e inténtalo de nuevo.";

export type TemplateActionResult = { ok: false; message?: string; errors?: TemplateErrors; problems?: string[] };

function revalidateTemplates(id?: string) {
  revalidatePath("/coach/entrenamientos");
  if (id) revalidatePath(`/coach/entrenamientos/${id}`);
}

/** Crea (id null) o reemplaza una plantilla propia y abre su detalle. */
export async function saveTemplateAction(id: string | null, input: TemplateInput): Promise<TemplateActionResult> {
  const coach = await requireCoach();
  if (id !== null && !UUID_RE.test(id)) return { ok: false, message: "La plantilla no existe." };
  const errors = validateTemplate(input, { publish: false, weightUnit: coach.weightUnit });
  if (Object.keys(errors).length) return { ok: false, errors };

  let result;
  try {
    result = await saveTemplate(coach.id, id, toTemplateWriteData(input, coach.weightUnit));
  } catch (error) {
    logError("saveTemplateAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) {
    if (result.reason === "not-found") return { ok: false, message: "Solo puedes editar tus plantillas activas." };
    if (result.reason === "exercise-unavailable") return { ok: false, message: "Algún ejercicio ya no está disponible. Quítalo o elige otro." };
    return {
      ok: false,
      message: "Una plantilla publicada debe estar completa. Complétala o pásala a borrador.",
      problems: result.problems,
    };
  }
  revalidateTemplates(result.id);
  redirect(`/coach/entrenamientos/${result.id}?guardado=1`);
}

async function changeStatus(id: string, to: TemplateStatusValue): Promise<TemplateActionResult | { ok: true }> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "La plantilla no existe." };
  try {
    const result = await changeTemplateStatus(coach.id, id, to);
    if (!result.ok) {
      return result.reason === "incomplete"
        ? { ok: false, message: "Aún no se puede publicar.", problems: result.problems }
        : { ok: false, message: "La plantilla cambió o no es tuya. Recarga la página." };
    }
  } catch (error) {
    logError("changeStatus", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateTemplates(id);
  return { ok: true };
}

export async function publishTemplateAction(id: string) {
  return changeStatus(id, "publicada");
}
export async function unpublishTemplateAction(id: string) {
  return changeStatus(id, "borrador");
}
export async function archiveTemplateAction(id: string) {
  return changeStatus(id, "archivada");
}
/** Restaurar devuelve la plantilla a borrador (se revisa antes de publicarla otra vez). */
export async function restoreTemplateAction(id: string) {
  return changeStatus(id, "borrador");
}

export async function duplicateTemplateAction(id: string): Promise<TemplateActionResult> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "La plantilla no existe." };
  let result;
  try {
    result = await duplicateTemplate(coach.id, id);
  } catch (error) {
    logError("duplicateTemplateAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) return { ok: false, message: "La plantilla no existe." };
  revalidateTemplates();
  redirect(`/coach/entrenamientos/${result.id}/editar?copia=1`);
}
