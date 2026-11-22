import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de invitación. El token viaja solo en el enlace; en la base de datos
 * se guarda su hash SHA-256, así una filtración de la tabla no permite aceptar
 * invitaciones. 32 bytes aleatorios = 256 bits de entropía.
 */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Formato válido de token (evita consultas con basura). */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const INVITATION_TTL_DAYS = 7;

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
}
