import { describe, expect, it } from "vitest";
import { generateInvitationToken, hashInvitationToken, invitationExpiry, isWellFormedToken, INVITATION_TTL_DAYS } from "@/lib/invitations/token";
import {
  canCancelInvitation,
  canPauseRelation,
  canReactivateRelation,
  canRegenerateInvitation,
  coachCanEditAthlete,
  daysLeft,
  decideAcceptance,
  invitationState,
  maskEmail,
  normalizeEmail,
  type AcceptContext,
} from "@/lib/invitations/rules";
import { hasErrors, validateInvitation, validateSportsInfo } from "@/lib/validations";

const NOW = new Date("2026-11-22T12:00:00Z");

describe("tokens de invitación", () => {
  it("genera tokens únicos, bien formados y guarda solo el hash", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(isWellFormedToken(a.token)).toBe(true);
    expect(a.tokenHash).toBe(hashInvitationToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("rechaza tokens mal formados", () => {
    for (const bad of ["", "abc", "x".repeat(44), "../../etc/passwd", "a".repeat(42) + "!"]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("vence a los 7 días", () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiry(NOW).toISOString()).toBe("2026-11-29T12:00:00.000Z");
  });
});

describe("estado de la invitación", () => {
  it("una pendiente vencida se ve como expirada", () => {
    expect(invitationState({ status: "pending", expiresAt: new Date("2026-11-23T00:00:00Z") }, NOW)).toBe("pending");
    expect(invitationState({ status: "pending", expiresAt: new Date("2026-11-22T12:00:00Z") }, NOW)).toBe("expired");
    expect(invitationState({ status: "accepted", expiresAt: new Date("2020-01-01") }, NOW)).toBe("accepted");
    expect(invitationState({ status: "cancelled", expiresAt: new Date("2030-01-01") }, NOW)).toBe("cancelled");
  });

  it("el coach puede cancelar o regenerar solo las abiertas", () => {
    expect(canCancelInvitation("pending")).toBe(true);
    expect(canCancelInvitation("expired")).toBe(true);
    expect(canCancelInvitation("accepted")).toBe(false);
    expect(canRegenerateInvitation("expired")).toBe(true);
    expect(canRegenerateInvitation("cancelled")).toBe(false);
  });
});

describe("decideAcceptance", () => {
  const base: AcceptContext = {
    state: "pending",
    invitationEmail: "ana@example.com",
    invitationCoachId: "coach-1",
    account: { role: "athlete", email: "Ana@Example.com" },
    currentCoachId: null,
    acceptedByAccount: false,
  };

  it("permite aceptar al atleta del correo invitado (sin distinguir mayúsculas)", () => {
    expect(decideAcceptance(base)).toEqual({ type: "can-accept" });
  });

  it("pide iniciar sesión a visitantes", () => {
    expect(decideAcceptance({ ...base, account: null })).toEqual({ type: "needs-login" });
  });

  it("bloquea cuentas de coach, otros correos y atletas con otro coach", () => {
    expect(decideAcceptance({ ...base, account: { role: "coach", email: "ana@example.com" } })).toEqual({ type: "blocked", reason: "not-athlete" });
    expect(decideAcceptance({ ...base, account: { role: "athlete", email: "otra@example.com" } })).toEqual({ type: "blocked", reason: "email-mismatch" });
    expect(decideAcceptance({ ...base, currentCoachId: "coach-2" })).toEqual({ type: "blocked", reason: "has-other-coach" });
  });

  it("permite re-unirse al mismo coach (p. ej. tras una relación retirada)", () => {
    expect(decideAcceptance({ ...base, currentCoachId: "coach-1" })).toEqual({ type: "can-accept" });
  });

  it("respeta estados finales", () => {
    expect(decideAcceptance({ ...base, state: "expired" })).toEqual({ type: "blocked", reason: "expired" });
    expect(decideAcceptance({ ...base, state: "cancelled" })).toEqual({ type: "blocked", reason: "cancelled" });
    expect(decideAcceptance({ ...base, state: "accepted" })).toEqual({ type: "blocked", reason: "already-accepted" });
    expect(decideAcceptance({ ...base, state: "accepted", acceptedByAccount: true })).toEqual({ type: "accepted" });
  });
});

describe("relación coach–atleta", () => {
  it("transiciones válidas", () => {
    expect(canPauseRelation("active")).toBe(true);
    expect(canPauseRelation("paused")).toBe(false);
    expect(canReactivateRelation("paused")).toBe(true);
    expect(canReactivateRelation("active")).toBe(false);
    expect(canReactivateRelation("removed")).toBe(false);
  });

  it("el coach solo edita con la relación activa", () => {
    expect(coachCanEditAthlete("active")).toBe(true);
    expect(coachCanEditAthlete("paused")).toBe(false);
    expect(coachCanEditAthlete("removed")).toBe(false);
  });
});

describe("utilidades", () => {
  it("enmascara correos y normaliza", () => {
    expect(maskEmail("jorge@gmail.com")).toBe("j•••@gmail.com");
    expect(maskEmail("sin-arroba")).toBe("•••");
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("cuenta días restantes", () => {
    expect(daysLeft(new Date("2026-11-29T12:00:00Z"), NOW)).toBe(7);
    expect(daysLeft(new Date("2026-11-22T13:00:00Z"), NOW)).toBe(1);
    expect(daysLeft(new Date("2026-11-20T12:00:00Z"), NOW)).toBe(0);
  });
});

describe("validaciones de la fase 3", () => {
  it("invitación: correo obligatorio y válido, nombre opcional", () => {
    expect(hasErrors(validateInvitation({ email: "ana@example.com", name: "" }))).toBe(false);
    expect(validateInvitation({ email: "", name: "" }).email).toBe("Escribe el correo del atleta.");
    expect(validateInvitation({ email: "ana@", name: "" }).email).toBe("Revisa el formato del correo.");
    expect(validateInvitation({ email: "ana@example.com", name: "x".repeat(81) }).name).toBeDefined();
  });

  it("información deportiva compartida por atleta y coach", () => {
    expect(hasErrors(validateSportsInfo({ division: "Pro Men", raceDate: "2027-01-08", availableDays: ["Lun"], equipment: ["Trineo"] }))).toBe(false);
    const e = validateSportsInfo({ division: "Elite", raceDate: "2027-13-01", availableDays: ["X"], equipment: ["Y"] });
    expect(Object.keys(e).sort()).toEqual(["availableDays", "division", "equipment", "raceDate"]);
  });
});
