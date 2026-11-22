"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/auth/session";
import {
  findAthleteExecution,
  finishExecution,
  logSet,
  pauseExecution,
  reportDiscomfort,
  resumeExecution,
  saveFeedback,
  startExecution,
  type ExecutionLogDTO,
} from "@/lib/db/execution";
import type { LoggedSet, SetPosition } from "@/lib/execution/progress";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import {
  validateDiscomfort,
  validateSessionFeedback,
  validateSetLog,
  type DiscomfortInput,
  type FieldErrors,
  type SessionFeedbackInput,
  type SetLogInput,
} from "@/lib/validations";

/**
 * Acciones del atleta sobre la ejecución de sus sesiones. Todas verifican la
 * sesión del usuario (requireAthlete), validan otra vez en servidor y operan
 * solo sobre su asignación vigente. Nunca tocan el snapshot.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No se pudo guardar. Revisa tu conexión; tus datos siguen aquí.";
const NOT_IN_PROGRESS = "Esta sesión ya no está en curso. Recarga la página.";

type Fail = { ok: false; message: string };

function revalidateExecution(sessionId: string) {
  revalidatePath("/atleta/inicio");
  revalidatePath("/atleta/agenda");
  revalidatePath("/atleta/sesiones");
  revalidatePath(`/atleta/sesiones/${sessionId}`);
  revalidatePath(`/atleta/sesiones/${sessionId}/resumen`);
  revalidatePath(`/coach/sesiones/${sessionId}`);
}

const isPosition = (p: SetPosition) =>
  [p.blockIndex, p.exerciseIndex, p.setNumber].every((n) => Number.isInteger(n) && n >= 0 && n < 10_000);

export async function startSessionAction(sessionId: string): Promise<Fail> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  let result;
  try {
    result = await startExecution(athlete.id, sessionId, todayKey(APP_TIME_ZONE));
  } catch (error) {
    console.error("startSessionAction", error);
    return { ok: false, message: "No pudimos comenzar la sesión. Revisa tu conexión e inténtalo de nuevo." };
  }
  if (!result.ok) {
    const message = {
      "not-found": "Esta sesión ya no está en tu agenda.",
      cancelled: "Tu coach canceló esta sesión.",
      future: "Podrás comenzarla el día programado.",
    }[result.reason];
    return { ok: false, message };
  }
  revalidateExecution(sessionId);
  redirect(`/atleta/sesiones/${sessionId}/ejecutar`);
}

export async function logSetAction(
  sessionId: string,
  at: SetPosition,
  input: SetLogInput,
): Promise<{ ok: true; set: LoggedSet } | { ok: false; message: string; errors?: FieldErrors<keyof SetLogInput> }> {
  const athlete = await requireAthlete();
  const position = { blockIndex: Number(at?.blockIndex), exerciseIndex: Number(at?.exerciseIndex), setNumber: Number(at?.setNumber) };
  if (!UUID_RE.test(sessionId) || !isPosition(position)) return { ok: false, message: "La serie no existe en esta sesión." };
  try {
    // El objetivo planeado sale del snapshot (no del cliente).
    const execution = await findAthleteExecution(athlete.id, sessionId);
    const planned = execution?.snapshot.blocks[position.blockIndex]?.exercises[position.exerciseIndex];
    if (!execution || !planned) return { ok: false, message: "La serie no existe en esta sesión." };
    const validated = validateSetLog(input, planned, athlete.weightUnit);
    if (!validated.ok) return { ok: false, message: "Revisa los datos de la serie.", errors: validated.errors };
    const result = await logSet(athlete.id, sessionId, position, validated.value);
    if (!result.ok) {
      const message = {
        "not-found": "Esta sesión ya no está en tu agenda.",
        "not-in-progress": NOT_IN_PROGRESS,
        paused: "La sesión está en pausa. Reanúdala para registrar.",
        "invalid-position": "La serie no existe en esta sesión.",
      }[result.reason];
      return { ok: false, message };
    }
    revalidatePath(`/coach/sesiones/${sessionId}`);
    return result;
  } catch (error) {
    console.error("logSetAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

type TimesOk = { ok: true; log: Pick<ExecutionLogDTO, "pausedAt" | "pausedSeconds"> };

export async function pauseSessionAction(sessionId: string): Promise<TimesOk | Fail> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  try {
    const result = await pauseExecution(athlete.id, sessionId);
    return result.ok ? result : { ok: false, message: NOT_IN_PROGRESS };
  } catch (error) {
    console.error("pauseSessionAction", error);
    return { ok: false, message: "No se pudo pausar. Revisa tu conexión." };
  }
}

export async function resumeSessionAction(sessionId: string): Promise<TimesOk | Fail> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  try {
    const result = await resumeExecution(athlete.id, sessionId);
    return result.ok ? result : { ok: false, message: NOT_IN_PROGRESS };
  } catch (error) {
    console.error("resumeSessionAction", error);
    return { ok: false, message: "No se pudo reanudar. Revisa tu conexión." };
  }
}

export async function finishSessionAction(sessionId: string): Promise<Fail> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  try {
    const result = await finishExecution(athlete.id, sessionId);
    if (!result.ok) return { ok: false, message: NOT_IN_PROGRESS };
  } catch (error) {
    console.error("finishSessionAction", error);
    return { ok: false, message: "No se pudo finalizar. Revisa tu conexión e inténtalo de nuevo." };
  }
  revalidateExecution(sessionId);
  redirect(`/atleta/sesiones/${sessionId}/resumen?finalizada=1`);
}

export async function saveFeedbackAction(
  sessionId: string,
  input: SessionFeedbackInput,
): Promise<{ ok: true } | { ok: false; message?: string; errors?: FieldErrors<keyof SessionFeedbackInput> }> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  const validated = validateSessionFeedback(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  try {
    if (!(await saveFeedback(athlete.id, sessionId, validated.value))) return { ok: false, message: "Primero finaliza la sesión." };
  } catch (error) {
    console.error("saveFeedbackAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateExecution(sessionId);
  return { ok: true };
}

export async function reportDiscomfortAction(
  sessionId: string,
  input: DiscomfortInput,
  at: { blockIndex: number; exerciseIndex: number } | null,
): Promise<{ ok: true } | { ok: false; message?: string; errors?: FieldErrors<keyof DiscomfortInput> }> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  const validated = validateDiscomfort(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const position = at && Number.isInteger(at.blockIndex) && Number.isInteger(at.exerciseIndex) && at.blockIndex >= 0 && at.exerciseIndex >= 0 ? at : null;
  try {
    const saved = await reportDiscomfort(athlete.id, sessionId, {
      ...validated.value,
      blockIndex: position?.blockIndex ?? null,
      exerciseIndex: position?.exerciseIndex ?? null,
    });
    if (!saved) return { ok: false, message: "Comienza la sesión para reportar una molestia." };
  } catch (error) {
    console.error("reportDiscomfortAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateExecution(sessionId);
  return { ok: true };
}
