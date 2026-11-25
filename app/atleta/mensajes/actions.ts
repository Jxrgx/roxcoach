"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "@/lib/auth/session";
import { markThreadRead, sendMessage } from "@/lib/db/messages";
import { parseSendInput, SEND_GENERIC_ERROR, sendFailure, type SendMessageResult } from "@/lib/messages/actions-shared";
import { logError } from "@/lib/log";

/**
 * Mensajes del atleta con su coach. El atleta sale de su sesión y su coach se
 * resuelve en el servidor (lib/db/messages): el cliente nunca elige con quién escribe.
 */

export async function sendAthleteMessageAction(input: unknown): Promise<SendMessageResult> {
  const athlete = await requireAthlete();
  const parsed = parseSendInput(input);
  if (!parsed.ok) return parsed;
  try {
    const result = await sendMessage({ role: "athlete", id: athlete.id }, null, parsed.value);
    if (!result.ok) return sendFailure(result);
    revalidatePath("/atleta/mensajes");
    revalidatePath("/coach/mensajes");
    return { ok: true, message: result.message };
  } catch (error) {
    logError("sendAthleteMessageAction", error);
    return { ok: false, message: SEND_GENERIC_ERROR };
  }
}

export async function markAthleteThreadReadAction(): Promise<void> {
  const athlete = await requireAthlete();
  try {
    const changed = await markThreadRead({ role: "athlete", id: athlete.id }, null);
    // El contador vive en el encabezado del área.
    if (changed) revalidatePath("/atleta", "layout");
  } catch (error) {
    logError("markAthleteThreadReadAction", error);
  }
}
