"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { updateCoachProfile } from "@/lib/db/profiles";
import { hasErrors, validateCoachSettings, type ActionResult, type CoachSettingsInput } from "@/lib/validations";
import { logError } from "@/lib/log";

/** Guarda la configuración del coach autenticado (validación repetida en servidor). */
export async function saveCoachSettings(input: CoachSettingsInput): Promise<ActionResult<keyof CoachSettingsInput>> {
  const coach = await requireCoach();
  const errors = validateCoachSettings(input);
  if (hasErrors(errors)) return { ok: false, errors };

  try {
    await updateCoachProfile(coach.id, {
      name: input.name.trim(),
      gymName: input.gym.trim(),
      weightUnit: input.weightUnit === "lb" ? "lb" : "kg",
      distanceUnit: input.distanceUnit === "mi" ? "mi" : "km",
    });
  } catch (error) {
    logError("saveCoachSettings", error);
    return { ok: false, message: "No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo." };
  }

  // Actualiza el nombre del coach en la barra lateral.
  revalidatePath("/coach", "layout");
  return { ok: true };
}
