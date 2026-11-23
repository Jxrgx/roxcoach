"use server";

import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/auth/session";
import { acceptInvitation } from "@/lib/db/invitations";
import type { AcceptBlock } from "@/lib/invitations/rules";
import { logError } from "@/lib/log";

export type AcceptActionResult = { ok: false; reason: AcceptBlock | "invalid" | "error" };

/** El atleta autenticado acepta la invitación y completa su perfil. */
export async function acceptInvitationAction(token: string): Promise<AcceptActionResult> {
  const athlete = await requireAthlete();
  let result;
  try {
    result = await acceptInvitation(token, { id: athlete.id, email: athlete.email });
  } catch (error) {
    logError("acceptInvitationAction", error);
    return { ok: false, reason: "error" };
  }
  if (!result.ok) {
    const decision = result.decision;
    return { ok: false, reason: decision?.type === "blocked" ? decision.reason : "invalid" };
  }
  redirect("/atleta/perfil?bienvenida=1");
}
