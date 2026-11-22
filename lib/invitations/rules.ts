/**
 * Reglas de invitaciones y de la relación coach–atleta (funciones puras).
 * Las usan las Server Actions y la capa de datos; la base de datos además
 * garantiza las reglas críticas con índices y restricciones.
 */

export type InvitationStoredStatus = "pending" | "accepted" | "cancelled";
export type InvitationState = "pending" | "expired" | "accepted" | "cancelled";
export type RelationStatus = "active" | "paused" | "removed";

/** Estado visible: una invitación pendiente vencida se muestra como expirada. */
export function invitationState(inv: { status: InvitationStoredStatus; expiresAt: Date }, now: Date): InvitationState {
  if (inv.status === "pending" && inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return inv.status;
}

export type AcceptBlock =
  | "invalid"
  | "expired"
  | "cancelled"
  | "already-accepted"
  | "not-athlete"
  | "email-mismatch"
  | "has-other-coach";

export interface AcceptContext {
  state: InvitationState;
  invitationEmail: string;
  invitationCoachId: string;
  account: { role: "coach" | "athlete"; email: string } | null;
  /** Coach actual del atleta (relación activa o en pausa), si tiene. */
  currentCoachId: string | null;
  /** La invitación ya fue aceptada por esta misma cuenta. */
  acceptedByAccount: boolean;
}

export type AcceptDecision =
  | { type: "needs-login" }
  | { type: "can-accept" }
  | { type: "accepted" }
  | { type: "blocked"; reason: AcceptBlock };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Qué puede hacer quien abre el enlace de invitación. */
export function decideAcceptance(ctx: AcceptContext): AcceptDecision {
  if (ctx.state === "accepted") {
    return ctx.acceptedByAccount ? { type: "accepted" } : { type: "blocked", reason: "already-accepted" };
  }
  if (ctx.state === "cancelled") return { type: "blocked", reason: "cancelled" };
  if (ctx.state === "expired") return { type: "blocked", reason: "expired" };
  if (!ctx.account) return { type: "needs-login" };
  if (ctx.account.role !== "athlete") return { type: "blocked", reason: "not-athlete" };
  if (normalizeEmail(ctx.account.email) !== normalizeEmail(ctx.invitationEmail)) {
    return { type: "blocked", reason: "email-mismatch" };
  }
  if (ctx.currentCoachId && ctx.currentCoachId !== ctx.invitationCoachId) {
    return { type: "blocked", reason: "has-other-coach" };
  }
  return { type: "can-accept" };
}

/** Acciones del coach sobre una invitación según su estado visible. */
export function canCancelInvitation(state: InvitationState): boolean {
  return state === "pending" || state === "expired";
}

export function canRegenerateInvitation(state: InvitationState): boolean {
  return state === "pending" || state === "expired";
}

/** Transiciones de la relación. "removed" no se gestiona todavía desde la UI. */
export function canPauseRelation(status: RelationStatus): boolean {
  return status === "active";
}

export function canReactivateRelation(status: RelationStatus): boolean {
  return status === "paused";
}

/** El coach solo edita la información deportiva con la relación activa. */
export function coachCanEditAthlete(status: RelationStatus): boolean {
  return status === "active";
}

/** "j•••@gmail.com": muestra a quién va dirigida sin revelar el correo completo. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Días completos restantes (0 si vence hoy o ya venció). */
export function daysLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
}
