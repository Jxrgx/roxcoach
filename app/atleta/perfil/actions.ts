"use server";

import { revalidatePath } from "next/cache";
import { requireAthlete } from "@/lib/auth/session";
import { updateAthleteProfile } from "@/lib/db/profiles";
import { hasErrors, validateAthleteProfile, type ActionResult, type AthleteProfileInput } from "@/lib/validations";
import { logError } from "@/lib/log";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";

/** Guarda el perfil del atleta autenticado (validación repetida en servidor). */
export async function saveAthleteProfile(input: AthleteProfileInput): Promise<ActionResult<keyof AthleteProfileInput>> {
  const athlete = await requireAthlete();
  const errors = validateAthleteProfile(input, { today: todayKey(APP_TIME_ZONE), savedRaceDate: athlete.raceDate });
  if (hasErrors(errors)) return { ok: false, errors };

  try {
    await updateAthleteProfile(athlete.id, {
      name: input.name.trim(),
      division: input.division || null,
      raceDate: input.raceDate || null,
      availableDays: [...new Set(input.availableDays)],
      equipment: [...new Set(input.equipment)],
      weightUnit: input.weightUnit === "lb" ? "lb" : "kg",
    });
  } catch (error) {
    logError("saveAthleteProfile", error);
    return { ok: false, message: "No pudimos guardar tu perfil. Revisa tu conexión e inténtalo de nuevo." };
  }

  revalidatePath("/atleta", "layout");
  return { ok: true };
}
