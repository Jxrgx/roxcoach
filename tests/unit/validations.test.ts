import { describe, expect, it } from "vitest";
import {
  hasErrors,
  validateCoachSettings,
  validateLogin,
  validateSchedule,
  validateRegister,
  validateSetResult,
} from "@/lib/validations";
import { canAccessPath, ROLE_HOME } from "@/lib/permissions";

describe("validateSetResult", () => {
  const opts = { requiresLoad: true, amountLabel: "Distancia" };

  it("acepta un resultado válido y convierte comas decimales", () => {
    const r = validateSetResult({ load: "152,5", amount: "12.5", rpe: "8" }, opts);
    expect(r).toEqual({ ok: true, value: { actualLoadKg: 152.5, actualAmount: 12.5, rpe: 8 } });
  });

  it("RPE es opcional", () => {
    const r = validateSetResult({ load: "100", amount: "10", rpe: "" }, opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rpe).toBeUndefined();
  });

  it("reporta errores por campo", () => {
    const r = validateSetResult({ load: "", amount: "0", rpe: "11" }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.load).toBeDefined();
      expect(r.errors.amount).toBeDefined();
      expect(r.errors.rpe).toBeDefined();
    }
  });

  it("no exige carga cuando no está planeada", () => {
    const r = validateSetResult({ load: "", amount: "15", rpe: "" }, { requiresLoad: false, amountLabel: "Repeticiones" });
    expect(r.ok).toBe(true);
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
