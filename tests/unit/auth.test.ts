import { describe, expect, it } from "vitest";
import { areaForPath, isRole, resolveRouteAccess, safeNextPath } from "@/lib/permissions";
import { authErrorMessage, LOGIN_ERROR_MESSAGES } from "@/lib/auth/errors";
import { daysUntil } from "@/lib/utils/format";
import { hasErrors, validateAthleteProfile, validateCoachSettings } from "@/lib/validations";

describe("resolveRouteAccess", () => {
  it("manda al login a quien no tiene sesión en un área protegida, conservando la ruta", () => {
    expect(resolveRouteAccess({ pathname: "/coach/atletas", search: "?q=ana", authenticated: false, role: null })).toEqual({
      type: "redirect",
      to: "/login?next=%2Fcoach%2Fatletas%3Fq%3Dana",
    });
    expect(resolveRouteAccess({ pathname: "/atleta", authenticated: false, role: null }).type).toBe("redirect");
  });

  it("permite rutas públicas sin sesión", () => {
    for (const pathname of ["/", "/login", "/registro", "/auth/confirm", "/componentes"]) {
      expect(resolveRouteAccess({ pathname, authenticated: false, role: null })).toEqual({ type: "allow" });
    }
  });

  it("cada rol solo entra a su área", () => {
    expect(resolveRouteAccess({ pathname: "/coach/inicio", authenticated: true, role: "coach" })).toEqual({ type: "allow" });
    expect(resolveRouteAccess({ pathname: "/atleta/perfil", authenticated: true, role: "coach" })).toEqual({
      type: "redirect",
      to: "/coach/inicio",
    });
    expect(resolveRouteAccess({ pathname: "/coach", authenticated: true, role: "athlete" })).toEqual({
      type: "redirect",
      to: "/atleta/inicio",
    });
  });

  it("no confunde prefijos parecidos", () => {
    expect(areaForPath("/coaching")).toBeNull();
    expect(areaForPath("/atletas")).toBeNull();
    expect(resolveRouteAccess({ pathname: "/coaching", authenticated: false, role: null })).toEqual({ type: "allow" });
  });

  it("saca de login/registro a quien ya tiene sesión", () => {
    expect(resolveRouteAccess({ pathname: "/login", authenticated: true, role: "athlete" })).toEqual({
      type: "redirect",
      to: "/atleta/inicio",
    });
    expect(resolveRouteAccess({ pathname: "/registro", authenticated: true, role: "coach" })).toEqual({
      type: "redirect",
      to: "/coach/inicio",
    });
  });

  it("sesión sin rol en área protegida → login con error de perfil", () => {
    expect(resolveRouteAccess({ pathname: "/coach/inicio", authenticated: true, role: null })).toEqual({
      type: "redirect",
      to: "/login?error=perfil",
    });
    // Sin rol no se le saca de /login (evita bucles).
    expect(resolveRouteAccess({ pathname: "/login", authenticated: true, role: null })).toEqual({ type: "allow" });
  });
});

describe("safeNextPath", () => {
  it("respeta rutas internas del área del rol", () => {
    expect(safeNextPath("/coach/atletas?q=ana", "coach")).toBe("/coach/atletas?q=ana");
    expect(safeNextPath("/", "athlete")).toBe("/");
  });

  it("bloquea redirecciones abiertas y rutas de otro rol", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", undefined, 42]) {
      expect(safeNextPath(bad, "coach")).toBe("/coach/inicio");
    }
    expect(safeNextPath("/atleta/inicio", "coach")).toBe("/coach/inicio");
    expect(safeNextPath("/login", "athlete")).toBe("/atleta/inicio");
  });
});

describe("isRole", () => {
  it("solo acepta roles conocidos", () => {
    expect(isRole("coach")).toBe(true);
    expect(isRole("athlete")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("traduce errores conocidos sin revelar si el correo existe", () => {
    expect(authErrorMessage("invalid_credentials")).toBe("Correo o contraseña incorrectos.");
    expect(authErrorMessage("email_not_confirmed")).toMatch(/Confirma tu correo/);
    expect(authErrorMessage("over_request_rate_limit")).toMatch(/Demasiados intentos/);
    expect(authErrorMessage("email_address_invalid")).toMatch(/dirección real/);
    expect(authErrorMessage(undefined)).toMatch(/No pudimos completar/);
    expect(authErrorMessage("user_already_exists")).not.toMatch(/existe/);
  });

  it("tiene mensajes para los errores de /login", () => {
    expect(LOGIN_ERROR_MESSAGES.perfil).toBeDefined();
    expect(LOGIN_ERROR_MESSAGES.confirmacion).toBeDefined();
  });
});

describe("validaciones de perfil", () => {
  const athlete = {
    name: "Jorge M.",
    division: "Pro Men",
    raceDate: "2027-01-08",
    availableDays: ["Lun", "Mié"],
    equipment: ["Trineo"],
    weightUnit: "kg",
  };

  it("acepta un perfil de atleta válido (campos opcionales vacíos)", () => {
    expect(hasErrors(validateAthleteProfile(athlete))).toBe(false);
    expect(hasErrors(validateAthleteProfile({ ...athlete, division: "", raceDate: "" }))).toBe(false);
  });

  it("rechaza valores fuera de catálogo o fechas imposibles", () => {
    const e = validateAthleteProfile({
      ...athlete,
      division: "Elite",
      raceDate: "2027-02-30",
      availableDays: ["Funday"],
      equipment: ["Cohete"],
      weightUnit: "stone",
    });
    expect(Object.keys(e).sort()).toEqual(["availableDays", "division", "equipment", "raceDate", "weightUnit"]);
  });

  it("valida unidades del coach en servidor", () => {
    expect(hasErrors(validateCoachSettings({ name: "Alex", gym: "Pista Central", weightUnit: "kg", distanceUnit: "km" }))).toBe(false);
    const e = validateCoachSettings({ name: "Alex", gym: "Pista Central", weightUnit: "oz", distanceUnit: "yd" });
    expect(e.weightUnit).toBeDefined();
    expect(e.distanceUnit).toBeDefined();
  });
});

describe("daysUntil", () => {
  const today = new Date(2026, 10, 21);
  it("cuenta días naturales hasta la carrera", () => {
    expect(daysUntil("2026-11-21", today)).toBe(0);
    expect(daysUntil("2027-01-07", today)).toBe(47);
  });
  it("devuelve null sin fecha o si ya pasó", () => {
    expect(daysUntil("", today)).toBeNull();
    expect(daysUntil("2026-11-20", today)).toBeNull();
  });
});
