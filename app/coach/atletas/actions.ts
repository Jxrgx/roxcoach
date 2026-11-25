"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http/origin";
import { cancelInvitation, createInvitation, regenerateInvitation } from "@/lib/db/invitations";
import { setRelationStatus, updateSportsInfoAsCoach } from "@/lib/db/athletes";
import {
  hasErrors,
  validateInvitation,
  validateSportsInfo,
  type ActionResult,
  type InvitationInput,
  type SportsInfoInput,
} from "@/lib/validations";
import { logError } from "@/lib/log";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";

/**
 * Acciones del coach sobre sus atletas e invitaciones.
 * Todas verifican la sesión (requireCoach) y filtran por su coachId en la capa
 * de datos: no es posible actuar sobre atletas o invitaciones ajenos.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_ERROR = "No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.";

export type InvitationLinkResult =
  | { ok: true; link: string; email: string; expiresAt: string }
  | { ok: false; message?: string; errors?: Partial<Record<keyof InvitationInput, string>> };

const CREATE_ERRORS = {
  "already-linked": "Este atleta ya está en tu equipo.",
  "linked-to-other-coach": "Este correo ya pertenece a un atleta con otro coach.",
  "is-coach": "Este correo pertenece a una cuenta de coach.",
  "pending-exists": "Ya hay una invitación pendiente para este correo. Usa “Regenerar enlace” en la lista.",
} as const;

async function invitationLink(token: string) {
  return `${await publicOrigin()}/invitacion/${token}`;
}

export async function inviteAthlete(input: InvitationInput): Promise<InvitationLinkResult> {
  const coach = await requireCoach();
  const errors = validateInvitation(input);
  if (hasErrors(errors)) return { ok: false, errors };
  try {
    const result = await createInvitation(coach.id, input);
    if (!result.ok) return { ok: false, errors: { email: CREATE_ERRORS[result.reason] } };
    revalidatePath("/coach/atletas");
    return { ok: true, link: await invitationLink(result.token), email: result.invitation.email, expiresAt: result.invitation.expiresAt };
  } catch (error) {
    logError("inviteAthlete", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function regenerateInvitationLink(invitationId: string): Promise<InvitationLinkResult> {
  const coach = await requireCoach();
  if (!UUID_RE.test(invitationId)) return { ok: false, message: "La invitación no existe." };
  try {
    const result = await regenerateInvitation(coach.id, invitationId);
    if (!result) return { ok: false, message: "Esta invitación ya no se puede regenerar." };
    revalidatePath("/coach/atletas");
    return { ok: true, link: await invitationLink(result.token), email: result.invitation.email, expiresAt: result.invitation.expiresAt };
  } catch (error) {
    logError("regenerateInvitationLink", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function cancelInvitationAction(invitationId: string): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(invitationId)) return { ok: false, message: "La invitación no existe." };
  try {
    const ok = await cancelInvitation(coach.id, invitationId);
    if (!ok) return { ok: false, message: "Esta invitación ya no está pendiente." };
    revalidatePath("/coach/atletas");
    return { ok: true };
  } catch (error) {
    logError("cancelInvitationAction", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

async function changeRelation(athleteId: string, from: "active" | "paused", to: "active" | "paused"): Promise<ActionResult<never>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(athleteId)) return { ok: false, message: "El atleta no existe." };
  try {
    const ok = await setRelationStatus(coach.id, athleteId, from, to);
    if (!ok) return { ok: false, message: "El estado del atleta cambió. Recarga la página." };
    revalidatePath("/coach/atletas", "layout");
    return { ok: true };
  } catch (error) {
    logError("changeRelation", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function pauseAthlete(athleteId: string) {
  return changeRelation(athleteId, "active", "paused");
}

export async function reactivateAthlete(athleteId: string) {
  return changeRelation(athleteId, "paused", "active");
}

export async function saveAthleteSportsInfo(athleteId: string, input: SportsInfoInput): Promise<ActionResult<keyof SportsInfoInput>> {
  const coach = await requireCoach();
  if (!UUID_RE.test(athleteId)) return { ok: false, message: "El atleta no existe." };
  // Formato aquí; la regla "hoy o posterior" necesita la fecha guardada y se aplica en la transacción.
  const errors = validateSportsInfo(input);
  if (hasErrors(errors)) return { ok: false, errors };
  try {
    const result = await updateSportsInfoAsCoach(coach.id, athleteId, todayKey(APP_TIME_ZONE), {
      division: input.division || null,
      raceDate: input.raceDate || null,
      availableDays: [...new Set(input.availableDays)],
      equipment: [...new Set(input.equipment)],
    });
    if (result === "no-relation") return { ok: false, message: "Solo puedes editar atletas activos de tu equipo." };
    if (result !== "ok") return { ok: false, errors: { raceDate: result.raceDateError } };
    revalidatePath(`/coach/atletas/${athleteId}`);
    return { ok: true };
  } catch (error) {
    logError("saveAthleteSportsInfo", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}
