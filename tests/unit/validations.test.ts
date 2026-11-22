import { describe, expect, it } from "vitest";
import {
  hasErrors,
  validateCoachSettings,
  validateLogin,
  validateSchedule,
  validateRegister,
  validateDiscomfort,
  validateSessionFeedback,
  validateSetLog,
} from "@/lib/validations";
import { canAccessPath, ROLE_HOME } from "@/lib/permissions";

describe("validateSetLog", () => {
  const distance = { targetType: "distance" as const, loadKg: 152 };

  it("acepta un resultado válido y convierte comas decimales", () => {
    const r = validateSetLog({ load: "150,5", amount: "50", rpe: "8" }, distance, "kg");
    expect(r).toEqual({
      ok: true,
      value: { actualReps: null, actualDistanceMeters: 50, actualDurationSeconds: null, actualLoadKg: 150.5, rpe: 8 },
    });
  });

  it("convierte la carga en lb a kg y acepta tiempo mm:ss", () => {
    const r = validateSetLog({ load: "", amount: "1:30", rpe: "" }, { targetType: "time", loadKg: null }, "lb");
    expect(r.ok && r.value.actualDurationSeconds).toBe(90);
    const lb = validateSetLog({ load: "335", amount: "50", rpe: "" }, distance, "lb");
    expect(lb.ok && lb.value.actualLoadKg).toBeCloseTo(151.95, 1);
  });

  it("reporta errores por campo", () => {
    const r = validateSetLog({ load: "", amount: "2.5", rpe: "11" }, { targetType: "reps", loadKg: 24 }, "kg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.load).toBeDefined();
      expect(r.errors.amount).toBeDefined();
      expect(r.errors.rpe).toBeDefined();
    }
  });

  it("no exige carga cuando no está planeada; 0 reps es válido", () => {
    expect(validateSetLog({ load: "", amount: "0", rpe: "" }, { targetType: "reps", loadKg: null }, "kg").ok).toBe(true);
  });
});

describe("cierre y molestias", () => {
  it("valida RPE general y comentario opcionales", () => {
    expect(validateSessionFeedback({ rpe: "", comment: "  " })).toEqual({ ok: true, value: { rpe: null, comment: null } });
    expect(validateSessionFeedback({ rpe: "7", comment: "Bien" })).toEqual({ ok: true, value: { rpe: 7, comment: "Bien" } });
    const bad = validateSessionFeedback({ rpe: "0", comment: "x".repeat(1001) });
    expect(!bad.ok && bad.errors.rpe && bad.errors.comment).toBeTruthy();
  });

  it("valida zona e intensidad de la molestia", () => {
    expect(validateDiscomfort({ zone: "rodilla", intensity: "leve", note: "" }).ok).toBe(true);
    const bad = validateDiscomfort({ zone: "oreja", intensity: "terrible", note: "" });
    expect(!bad.ok && bad.errors.zone && bad.errors.intensity).toBeTruthy();
  });
});

describe("acceso", () => {
  it("valida login", () => {
    expect(hasErrors(validateLogin({ email: "", password: "" }))).toBe(true);
    expect(validateLogin({ email: "malo", password: "x" }).email).toBeDefined();
    expect(hasErrors(validateLogin({ email: "coach@gym.mx", password: "x" }))).toBe(false);
  });

  it("valida registro con rol y contraseña mínima", () => {
    const errors = validateRegister({ name: "A", email: "a@b.mx", password: "123", role: "" });
    expect(errors.name).toBeDefined();
    expect(errors.password).toBeDefined();
    expect(errors.role).toBeDefined();
    expect(hasErrors(validateRegister({ name: "Ana", email: "a@b.mx", password: "12345678", role: "athlete" }))).toBe(false);
  });
});

describe("formularios del coach", () => {
  it("valida configuración", () => {
    expect(hasErrors(validateCoachSettings({ name: "Alex", gym: "Pista Central" }))).toBe(false);
    expect(validateCoachSettings({ name: " ", gym: "" }).gym).toBeDefined();
  });

  it("valida la programación de una sesión", () => {
    const opts = { today: "2026-11-24", maxDate: "2027-11-25" };
    const e = validateSchedule({ templateId: "", date: "2026-11-23", time: "25:00", title: "x", notes: "", athleteIds: [] }, opts);
    expect(Object.keys(e).sort()).toEqual(["athleteIds", "date", "templateId", "time", "title"]);
  });
});

describe("permisos", () => {
  it("cada rol solo accede a su área", () => {
    expect(canAccessPath("coach", "/coach/atletas")).toBe(true);
    expect(canAccessPath("coach", "/atleta/inicio")).toBe(false);
    expect(canAccessPath("athlete", "/coach")).toBe(false);
    expect(canAccessPath("athlete", "/atleta/agenda")).toBe(true);
    expect(ROLE_HOME.athlete).toBe("/atleta/inicio");
  });
});
