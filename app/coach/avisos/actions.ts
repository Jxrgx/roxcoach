"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { markAlertRead, markAllAlertsRead } from "@/lib/db/alerts";
import type { ActionResult } from "@/lib/validations";
import { logError } from "@/lib/log";

/**
 * Acciones sobre los avisos del coach. El coach sale de su sesión
 * (requireCoach) y cada cambio filtra por su coachId: el id de un aviso ajeno
 * se comporta como inexistente.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = "No pudimos actualizar los avisos. Revisa tu conexión e inténtalo de nuevo.";

function revalidateAlerts() {
  // El contador vive en el layout del panel.
  revalidatePath("/coach", "layout");
}

export async function markAlertReadAction(id: string): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(id)) return { ok: false, message: "El aviso no existe." };
  try {
    if ((await markAlertRead(coach.id, id)) === "not-found") return { ok: false, message: "El aviso no existe." };
  } catch (error) {
    logError("markAlertReadAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateAlerts();
  return { ok: true };
}

export async function markAllAlertsReadAction(): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  try {
    await markAllAlertsRead(coach.id);
  } catch (error) {
    logError("markAllAlertsReadAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateAlerts();
  return { ok: true };
}
