import { describe, expect, it } from "vitest";
import { profileAccess, ROLE_HOME } from "@/lib/permissions";
import { validateEnv } from "@/lib/config/env-rules";

describe("decisión final de acceso por rol (lectura única de la sesión)", () => {
  it("permite solo el rol esperado, leído de la base de datos", () => {
    expect(profileAccess("coach", "coach")).toEqual({ type: "allow" });
    expect(profileAccess("athlete", "athlete")).toEqual({ type: "allow" });
  });

  it("rol incorrecto: al inicio de SU rol (nunca al área pedida)", () => {
    expect(profileAccess("coach", "athlete")).toEqual({ type: "redirect", to: ROLE_HOME.athlete });
    expect(profileAccess("athlete", "coach")).toEqual({ type: "redirect", to: ROLE_HOME.coach });
  });

  it("sesión válida sin perfil: cierra la sesión para evitar un bucle", () => {
    expect(profileAccess("coach", null)).toEqual({ type: "redirect", to: "/auth/salir?error=perfil" });
    expect(profileAccess("athlete", null)).toEqual({ type: "redirect", to: "/auth/salir?error=perfil" });
  });
});

describe("traza de consultas (ROXCOACH_DB_TRACE)", () => {
  const PROD = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    DATABASE_URL: "postgresql://u:p@host:6543/postgres",
  };

  it("se rechaza en producción real y se permite al medir en local", () => {
    expect(validateEnv({ ...PROD, APP_URL: "https://app.example", ROXCOACH_DB_TRACE: "1" }, "production").map((p) => p.name)).toEqual(["ROXCOACH_DB_TRACE"]);
    expect(validateEnv({ ...PROD, APP_URL: "http://localhost:3100", ROXCOACH_DB_TRACE: "1" }, "production")).toEqual([]);
    expect(validateEnv({ ROXCOACH_DB_TRACE: "1" }, "development")).toEqual([]);
  });
});
