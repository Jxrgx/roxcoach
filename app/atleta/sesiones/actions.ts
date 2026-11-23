"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/auth/session";
import { reportDiscomfort, saveFeedback, startExecution } from "@/lib/db/execution";
import { processExecutionOps } from "@/lib/db/execution-sync";
import type { OpResult } from "@/lib/offline/queue";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import {
  validateDiscomfort,
  validateSessionFeedback,
  type DiscomfortInput,
  type FieldErrors,
  type SessionFeedbackInput,
} from "@/lib/validations";

/**
 * Acciones del atleta sobre la ejecución de sus sesiones. Todas verifican la
 * sesión del usuario (requireAthlete), validan otra vez en servidor y operan
 * solo sobre su asignación vigente. Nunca tocan el snapshot.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No se pudo guardar. Revisa tu conexión; tus datos siguen aquí.";

type Fail = { ok: false; message: string };

function revalidateExecution(sessionId: string) {
  revalidatePath("/atleta/inicio");
  revalidatePath("/atleta/agenda");
  revalidatePath("/atleta/sesiones");
  revalidatePath(`/atleta/sesiones/${sessionId}`);
  revalidatePath(`/atleta/sesiones/${sessionId}/resumen`);
  revalidatePath(`/coach/sesiones/${sessionId}`);
}

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

/**
 * Sincroniza la cola local de la ejecución (fase 11): registrar o corregir
 * series, pausar, reanudar y finalizar. Se procesa en orden y de forma
 * idempotente (execution_ops); el resultado de cada operación indica si se
 * aplicó, ya estaba, entró en conflicto, se rechazó o debe reintentarse.
 */
export async function syncExecutionAction(sessionId: string, ops: unknown): Promise<{ ok: true; results: OpResult[] } | Fail> {
  const athlete = await requireAthlete();
  if (!UUID_RE.test(sessionId)) return { ok: false, message: "La sesión no existe." };
  let results: OpResult[];
  try {
    results = await processExecutionOps(athlete, sessionId, ops);
  } catch (error) {
    console.error("syncExecutionAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (results.some((r) => r.outcome === "applied")) {
    if (results.some((r) => r.finished)) revalidateExecution(sessionId);
    else revalidatePath(`/coach/sesiones/${sessionId}`);
  }
  return { ok: true, results };
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
