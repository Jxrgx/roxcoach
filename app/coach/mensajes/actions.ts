"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { markThreadRead, sendMessage } from "@/lib/db/messages";
import { isUuid, parseSendInput, SEND_GENERIC_ERROR, sendFailure, type SendMessageResult } from "@/lib/messages/actions-shared";
import { logError } from "@/lib/log";

/**
 * Mensajes del coach con sus atletas. El coach sale de su sesión; el atleta de
 * la URL se verifica contra su coachId (un atleta ajeno se comporta como inexistente).
 */

export async function sendCoachMessageAction(athleteId: string, input: unknown): Promise<SendMessageResult> {
  const coach = await requireCoach();
  if (!isUuid(athleteId)) return { ok: false, message: "Esta conversación ya no está disponible." };
  const parsed = parseSendInput(input);
  if (!parsed.ok) return parsed;
  try {
    const result = await sendMessage({ role: "coach", id: coach.id }, athleteId, parsed.value);
    if (!result.ok) return sendFailure(result);
    revalidatePath("/coach/mensajes");
    revalidatePath("/atleta/mensajes");
    return { ok: true, message: result.message };
  } catch (error) {
    logError("sendCoachMessageAction", error);
    return { ok: false, message: SEND_GENERIC_ERROR };
  }
}

export async function markCoachThreadReadAction(athleteId: string): Promise<void> {
  const coach = await requireCoach();
  if (!isUuid(athleteId)) return;
  try {
    const changed = await markThreadRead({ role: "coach", id: coach.id }, athleteId);
    if (changed) revalidatePath("/coach/mensajes");
  } catch (error) {
    logError("markCoachThreadReadAction", error);
  }
}
