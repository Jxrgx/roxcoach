"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import { addAthletesToSession, cancelSession, createSession, removeAthleteFromSession, updateSessionDetails } from "@/lib/db/sessions";
import { addDaysKey, todayKey } from "@/lib/scheduling/dates";
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
    console.error("scheduleSessionAction", error);
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
    console.error("updateSessionDetailsAction", error);
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
    console.error("cancelSessionAction", error);
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
    console.error("addAthletesAction", error);
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
    console.error("removeAthleteAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateSchedule(id);
  return { ok: true };
}
