import "server-only";

import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { generateInvitationToken, hashInvitationToken, invitationExpiry, isWellFormedToken } from "@/lib/invitations/token";
import { decideAcceptance, invitationState, normalizeEmail, type AcceptDecision, type InvitationState } from "@/lib/invitations/rules";

/**
 * Invitaciones. Las operaciones del coach filtran por su coachId.
 * El token en claro solo existe al crearlo/regenerarlo (se devuelve una vez).
 */

export interface InvitationDTO {
  id: string;
  email: string;
  name: string;
  state: InvitationState;
  expiresAt: string;
  createdAt: string;
}

export type CreateInvitationResult =
  | { ok: true; token: string; invitation: InvitationDTO }
  | { ok: false; reason: "already-linked" | "linked-to-other-coach" | "is-coach" | "pending-exists" };

function toDTO(inv: { id: string; email: string; name: string | null; status: "pending" | "accepted" | "cancelled"; expiresAt: Date; createdAt: Date }, now: Date): InvitationDTO {
  return {
    id: inv.id,
    email: inv.email,
    name: inv.name ?? "",
    state: invitationState(inv, now),
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  };
}

/** Invitaciones abiertas del coach (pendientes y vencidas sin aceptar). */
export async function listOpenInvitations(coachId: string): Promise<InvitationDTO[]> {
  const now = new Date();
  const rows = await db().invitation.findMany({ where: { coachId, status: "pending" }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => toDTO(r, now));
}

export async function createInvitation(coachId: string, input: { email: string; name: string }): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);

  // ¿El correo ya pertenece a una cuenta?
  const existing = await db().profile.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, role: true } });
  if (existing?.role === "coach") return { ok: false, reason: "is-coach" };
  if (existing) {
    const current = await db().coachAthlete.findFirst({ where: { athleteId: existing.id, status: { in: ["active", "paused"] } } });
    if (current) return { ok: false, reason: current.coachId === coachId ? "already-linked" : "linked-to-other-coach" };
  }

  const now = new Date();
  const { token, tokenHash } = generateInvitationToken();
  try {
    const inv = await db().invitation.create({
      data: { coachId, email, name: input.name.trim() || null, tokenHash, expiresAt: invitationExpiry(now) },
    });
    return { ok: true, token, invitation: toDTO(inv, now) };
  } catch (error) {
    // Índice único parcial: ya hay una pendiente para este correo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "pending-exists" };
    throw error;
  }
}

/** Emite un token nuevo (el anterior deja de servir) y renueva el vencimiento. */
export async function regenerateInvitation(coachId: string, invitationId: string): Promise<{ token: string; invitation: InvitationDTO } | null> {
  const now = new Date();
  const { token, tokenHash } = generateInvitationToken();
  const result = await db().invitation.updateMany({
    where: { id: invitationId, coachId, status: "pending" },
    data: { tokenHash, expiresAt: invitationExpiry(now) },
  });
  if (result.count !== 1) return null;
  const inv = await db().invitation.findUniqueOrThrow({ where: { id: invitationId } });
  return { token, invitation: toDTO(inv, now) };
}

export async function cancelInvitation(coachId: string, invitationId: string): Promise<boolean> {
  const result = await db().invitation.updateMany({ where: { id: invitationId, coachId, status: "pending" }, data: { status: "cancelled" } });
  return result.count === 1;
}

export interface PublicInvitationView {
  coachName: string;
  gymName: string;
  email: string;
  name: string;
  decision: AcceptDecision;
}

/** Vista pública de una invitación para quien abre el enlace (o null si no existe). */
export async function viewInvitation(
  token: string,
  account: { id: string; role: "coach" | "athlete"; email: string } | null,
): Promise<PublicInvitationView | null> {
  if (!isWellFormedToken(token)) return null;
  const inv = await db().invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { coach: { include: { profile: true } } },
  });
  if (!inv) return null;

  const current = account?.role === "athlete" ? await db().coachAthlete.findFirst({ where: { athleteId: account.id, status: { in: ["active", "paused"] } }, select: { coachId: true } }) : null;

  return {
    coachName: inv.coach.profile.name,
    gymName: inv.coach.gymName ?? "",
    email: inv.email,
    name: inv.name ?? "",
    decision: decideAcceptance({
      state: invitationState(inv, new Date()),
      invitationEmail: inv.email,
      invitationCoachId: inv.coachId,
      account: account ? { role: account.role, email: account.email } : null,
      currentCoachId: current?.coachId ?? null,
      acceptedByAccount: Boolean(account && inv.acceptedById === account.id),
    }),
  };
}

export type AcceptResult = { ok: true } | { ok: false; decision: AcceptDecision | null };

/**
 * Acepta la invitación en una transacción: vuelve a evaluar todas las reglas
 * con datos frescos y crea (o reactiva) la relación. El índice único parcial
 * impide dos coaches actuales aunque haya peticiones simultáneas.
 */
export async function acceptInvitation(token: string, athlete: { id: string; email: string }): Promise<AcceptResult> {
  if (!isWellFormedToken(token)) return { ok: false, decision: null };
  const tokenHash = hashInvitationToken(token);
  try {
    return await db().$transaction(async (tx) => {
      const inv = await tx.invitation.findUnique({ where: { tokenHash } });
      if (!inv) return { ok: false, decision: null } as const;
      const current = await tx.coachAthlete.findFirst({ where: { athleteId: athlete.id, status: { in: ["active", "paused"] } }, select: { coachId: true } });
      const decision = decideAcceptance({
        state: invitationState(inv, new Date()),
        invitationEmail: inv.email,
        invitationCoachId: inv.coachId,
        account: { role: "athlete", email: athlete.email },
        currentCoachId: current?.coachId ?? null,
        acceptedByAccount: inv.acceptedById === athlete.id,
      });
      if (decision.type === "accepted") return { ok: true } as const;
      if (decision.type !== "can-accept") return { ok: false, decision } as const;

      const now = new Date();
      // Marca aceptada solo si sigue pendiente (evita doble aceptación).
      const marked = await tx.invitation.updateMany({
        where: { id: inv.id, status: "pending" },
        data: { status: "accepted", acceptedAt: now, acceptedById: athlete.id },
      });
      if (marked.count !== 1) return { ok: false, decision: null } as const;

      await tx.coachAthlete.upsert({
        where: { coachId_athleteId: { coachId: inv.coachId, athleteId: athlete.id } },
        create: { coachId: inv.coachId, athleteId: athlete.id, status: "active", joinedAt: now },
        update: { status: "active", joinedAt: now, pausedAt: null, removedAt: null },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, decision: { type: "blocked", reason: "has-other-coach" } };
    }
    throw error;
  }
}
