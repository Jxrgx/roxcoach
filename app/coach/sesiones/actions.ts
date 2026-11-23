"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { addAthletesToSession, cancelSession, createSession, removeAthleteFromSession, updateSessionDetails } from "@/lib/db/sessions";
import { addDaysKey, todayKey } from "@/lib/scheduling/dates";
import { findAssignmentForOverride, listReplacementOptions, saveAssignmentOverrides } from "@/lib/db/overrides";
import { LOCK_MESSAGE, validateOverrideForm, type OverrideFieldErrors, type OverrideFormItem } from "@/lib/overrides/apply";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import {
  hasErrors,
  validateSchedule,
  validateSessionDetails,
  type ActionResult,
  type FieldErrors,
  type ScheduleInput,
  type SessionDetailsInput,
} from "@/lib/validations";
import { logError } from "@/lib/log";

/**
 * Acciones del coach sobre sus sesiones programadas. Todas verifican la sesión
 * (requireCoach), repiten la validación en servidor y filtran por su coachId.
 * "Hoy" se calcula en la zona horaria de la app.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No pudimos guardar la sesión. Revisa tu conexión e inténtalo de nuevo.";
const ATHLETES_UNAVAILABLE = "Algún atleta ya no está activo en tu equipo. Actualiza la selección.";

function dateLimits() {
  const today = todayKey(APP_TIME_ZONE);
  return { today, maxDate: addDaysKey(today, 366) };
}

function revalidateSchedule(id?: string) {
  revalidatePath("/coach/calendario");
  revalidatePath("/coach/inicio");
  if (id) revalidatePath(`/coach/sesiones/${id}`);
}

export async function scheduleSessionAction(input: ScheduleInput): Promise<{ ok: false; message?: string; errors?: FieldErrors<keyof ScheduleInput> }> {
  const coach = await requireCoach();
  const errors = validateSchedule(input, dateLimits());
  if (hasErrors(errors)) return { ok: false, errors };
  let result;
  try {
    result = await createSession(coach.id, {
      templateId: input.templateId,
      date: input.date,
      startTime: input.time.trim() || null,
      title: input.title.trim(),
      notes: input.notes.trim() || null,
      athleteIds: input.athleteIds,
    });
  } catch (error) {
    logError("scheduleSessionAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!result.ok) {
    return result.reason === "template-unavailable"
      ? { ok: false, errors: { templateId: "La plantilla ya no está publicada. Elige otra." } }
      : { ok: false, errors: { athleteIds: ATHLETES_UNAVAILABLE } };
  }
  revalidateSchedule();
  redirect(`/coach/sesiones/${result.id}?creada=1`);
}

export async function updateSessionDetailsAction(id: string, input: SessionDetailsInput): Promise<ActionResult<keyof SessionDetailsInput>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "La sesión no existe." };
  const errors = validateSessionDetails(input, dateLimits());
  if (hasErrors(errors)) return { ok: false, errors };
  try {
    const ok = await updateSessionDetails(coach.id, id, {
      date: input.date,
      startTime: input.time.trim() || null,
      title: input.title.trim(),
      notes: input.notes.trim() || null,
    });
    if (!ok) return { ok: false, message: "Solo puedes editar sesiones programadas de tu calendario." };
  } catch (error) {
    logError("updateSessionDetailsAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateSchedule(id);
  return { ok: true };
}

export async function cancelSessionAction(id: string): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "La sesión no existe." };
  try {
    if (!(await cancelSession(coach.id, id))) return { ok: false, message: "La sesión ya no está programada." };
  } catch (error) {
    logError("cancelSessionAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateSchedule(id);
  return { ok: true };
}

export async function addAthletesAction(id: string, athleteIds: string[]): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "La sesión no existe." };
  if (athleteIds.length === 0) return { ok: false, message: "Elige al menos un atleta." };
  if (athleteIds.length > 50 || athleteIds.some((a) => !UUID_RE.test(a))) return { ok: false, message: "Hay atletas no válidos." };
  try {
    const result = await addAthletesToSession(coach.id, id, [...new Set(athleteIds)]);
    if (!result.ok) return { ok: false, message: result.reason === "not-found" ? "La sesión ya no está programada." : ATHLETES_UNAVAILABLE };
  } catch (error) {
    logError("addAthletesAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateSchedule(id);
  return { ok: true };
}

export async function removeAthleteAction(id: string, athleteId: string): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id) || !UUID_RE.test(athleteId)) return { ok: false, message: "La sesión no existe." };
  try {
    const result = await removeAthleteFromSession(coach.id, id, athleteId);
    if (result === "started") return { ok: false, message: "Este atleta ya comenzó la sesión; se conserva para no perder su historial." };
    if (result === "not-found") return { ok: false, message: "El atleta ya no está en esta sesión." };
  } catch (error) {
    logError("removeAthleteAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateSchedule(id);
  return { ok: true };
}

/* ---------- Personalización por atleta (fase 10) ---------- */

/**
 * Guarda la personalización de UN atleta en una sesión propia. Los reemplazos
 * se validan contra la biblioteca del coach en el servidor y el plan contra el
 * snapshot; nunca se confía en nombres, categorías ni valores del cliente.
 * Una lista vacía restaura el plan original.
 */
export async function saveOverridesAction(
  sessionId: string,
  athleteId: string,
  items: OverrideFormItem[],
): Promise<{ ok: true } | { ok: false; message: string; errors?: OverrideFieldErrors }> {
  const coach = await requireCoach();
  if (!UUID_RE.test(sessionId) || !UUID_RE.test(athleteId) || !Array.isArray(items) || items.length > 600) return { ok: false, message: "La sesión no existe." };
  try {
    const target = await findAssignmentForOverride(coach.id, sessionId, athleteId);
    if (!target) return { ok: false, message: "La sesión no existe." };
    if (target.lock !== "editable") return { ok: false, message: LOCK_MESSAGE[target.lock] };
    const originalIds = target.snapshot.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId));
    const { options } = await listReplacementOptions(coach.id, originalIds);
    const clean = items.map((it) => ({
      blockIndex: Number(it.blockIndex),
      exerciseIndex: Number(it.exerciseIndex),
      skipped: it.skipped === true,
      sets: String(it.sets ?? ""),
      target: String(it.target ?? ""),
      load: String(it.load ?? ""),
      removeLoad: it.removeLoad === true,
      rest: String(it.rest ?? ""),
      note: String(it.note ?? ""),
      replacementId: String(it.replacementId ?? ""),
    }));
    const validated = validateOverrideForm(clean, target.snapshot, coach.weightUnit, new Map(options.map((o) => [o.id, o])));
    if (!validated.ok) return { ok: false, message: "Revisa los campos marcados.", errors: validated.errors };
    const saved = await saveAssignmentOverrides(coach.id, sessionId, athleteId, validated.rows);
    if (!saved.ok) return { ok: false, message: saved.reason === "not-found" ? "La sesión no existe." : LOCK_MESSAGE[saved.reason] };
  } catch (error) {
    logError("saveOverridesAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidatePath(`/coach/sesiones/${sessionId}`);
  revalidatePath(`/coach/sesiones/${sessionId}/atletas/${athleteId}`);
  revalidatePath(`/coach/sesiones/${sessionId}/atletas/${athleteId}/personalizar`);
  revalidatePath("/atleta", "layout");
  return { ok: true };
}
