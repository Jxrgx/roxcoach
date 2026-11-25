import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTimeProblems, effectiveAppUrl, ENV_VARS, formatEnvProblems, supabaseProjectRef, validateEnv } from "@/lib/config/env-rules";
import { headersAppUrl } from "@/lib/security/headers";

// Refs ficticios (20 caracteres, como los de Supabase). Ningún valor real.
const DEV = "devdevdevdevdevdevde";
const PROD = "prodprodprodprodprod";
const project = (ref: string) => ({
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ficticia",
  DATABASE_URL: `postgresql://postgres.${ref}:clave-ficticia@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true`,
});
const vercel = (env: "preview" | "production" | "development", extra: Record<string, string> = {}) => ({ VERCEL: "1", VERCEL_ENV: env, ...extra });
const names = (ps: { name: string }[]) => ps.map((p) => p.name).sort();

describe("origen público por ambiente de Vercel", () => {
  it("APP_URL explícita siempre manda", () => {
    expect(effectiveAppUrl({ APP_URL: "https://app.roxcoach.example", ...vercel("preview", { VERCEL_BRANCH_URL: "rama.vercel.app" }) })).toBe("https://app.roxcoach.example");
  });

  it("Preview sin APP_URL: URL estable de la rama (o la del despliegue), siempre https", () => {
    expect(effectiveAppUrl(vercel("preview", { VERCEL_BRANCH_URL: "roxcoach-git-rama-equipo.vercel.app", VERCEL_URL: "roxcoach-abc123.vercel.app" }))).toBe("https://roxcoach-git-rama-equipo.vercel.app");
    expect(effectiveAppUrl(vercel("preview", { VERCEL_URL: "roxcoach-abc123.vercel.app" }))).toBe("https://roxcoach-abc123.vercel.app");
  });

  it("Production y local nunca derivan el dominio de Vercel", () => {
    expect(effectiveAppUrl(vercel("production", { VERCEL_URL: "roxcoach-abc123.vercel.app" }))).toBeUndefined();
    expect(effectiveAppUrl({ VERCEL_URL: "roxcoach-abc123.vercel.app" })).toBeUndefined();
  });
});

describe("validación por ambiente", () => {
  it("Production en Vercel: exige APP_URL explícita (el dominio real)", () => {
    const problems = validateEnv({ ...project(PROD), ...vercel("production", { VERCEL_URL: "x.vercel.app" }) }, "production");
    expect(problems).toEqual([{ name: "APP_URL", reason: "falta (en Production debe ser el dominio real, explícito)" }]);
    expect(validateEnv({ ...project(PROD), APP_URL: "https://app.roxcoach.example", ...vercel("production") }, "production")).toEqual([]);
  });

  it("Preview en Vercel: válido sin APP_URL gracias a la URL de la rama", () => {
    expect(validateEnv({ ...project(DEV), ...vercel("preview", { VERCEL_BRANCH_URL: "rama.vercel.app" }) }, "production")).toEqual([]);
  });

  it("variables de pruebas: rechazadas en CUALQUIER ambiente de Vercel (también las obsoletas TEST_*)", () => {
    const tests = { SUPABASE_SECRET_KEY: "x", E2E_COACH_EMAIL: "a@b.c", E2E_COACH_PASSWORD: "x", TEST_COACH_PASSWORD: "x", TEST_ATHLETE_PASSWORD: "x" };
    const expected = ["E2E_COACH_EMAIL", "E2E_COACH_PASSWORD", "SUPABASE_SECRET_KEY", "TEST_ATHLETE_PASSWORD", "TEST_COACH_PASSWORD"];
    expect(names(validateEnv({ ...project(DEV), ...tests, ...vercel("preview", { VERCEL_BRANCH_URL: "r.vercel.app" }) }, "production"))).toEqual(expected);
    expect(names(validateEnv({ ...project(PROD), APP_URL: "https://app.roxcoach.example", ...tests, ...vercel("production") }, "production"))).toEqual(expected);
    // En local siguen permitidas (las usan las e2e).
    expect(validateEnv({ ...project(DEV), ...tests }, "development")).toEqual([]);
  });

  it("Production: sin DIRECT_URL ni orígenes http, sin herramientas de medición", () => {
    const env = {
      ...project(PROD),
      APP_URL: "https://app.roxcoach.example",
      DIRECT_URL: `postgresql://postgres.${PROD}:clave@aws-0-us-west-2.pooler.supabase.com:5432/postgres`,
      ALLOWED_ORIGINS: "http://otro.example",
      ROXCOACH_CATALOG: "1",
      ROXCOACH_DB_TRACE: "1",
      ...vercel("production"),
    };
    expect(names(validateEnv(env, "production"))).toEqual(["ALLOWED_ORIGINS", "DIRECT_URL", "ROXCOACH_CATALOG", "ROXCOACH_DB_TRACE"]);
  });

  it("detecta proyectos mezclados (API de prod con base de dev) sin revelar valores", () => {
    const env = { ...project(PROD), DATABASE_URL: project(DEV).DATABASE_URL, APP_URL: "https://app.roxcoach.example", ...vercel("production") };
    const problems = validateEnv(env, "production");
    expect(problems).toEqual([{ name: "DATABASE_URL", reason: expect.stringMatching(/proyecto Supabase distinto/) }]);
    const message = formatEnvProblems(problems);
    expect(message).not.toContain(DEV);
    expect(message).not.toContain(PROD);
    expect(message).not.toContain("clave-ficticia");
    // También en local y para DIRECT_URL.
    expect(names(validateEnv({ ...project(DEV), DIRECT_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` }, "development"))).toEqual(["DIRECT_URL"]);
  });

  it("reconoce el ref en URL de API, conexión directa y pooler; ignora dominios propios", () => {
    expect(supabaseProjectRef(`https://${DEV}.supabase.co`)).toBe(DEV);
    expect(supabaseProjectRef(`postgresql://postgres:x@db.${DEV}.supabase.co:5432/postgres`)).toBe(DEV);
    expect(supabaseProjectRef(project(DEV).DATABASE_URL)).toBe(DEV);
    expect(supabaseProjectRef("https://api.midominio.com")).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
  });
});

describe("next.config.ts no importa módulos de la app", () => {
  it("evita el bucle de recargas de next dev (comprobado en la fase 15)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    const imports = [...config.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== "next")).toEqual(["./lib/security/headers"]);
  });

  it("headersAppUrl (para HSTS/CSP) coincide con effectiveAppUrl en todos los ambientes", () => {
    const cases: Record<string, string | undefined>[] = [
      {},
      { APP_URL: "https://app.roxcoach.example" },
      { APP_URL: " http://localhost:3100 " },
      vercel("preview", { VERCEL_BRANCH_URL: "rama.vercel.app", VERCEL_URL: "x.vercel.app" }),
      vercel("preview", { VERCEL_URL: "https://x.vercel.app" }),
      vercel("production", { VERCEL_URL: "x.vercel.app" }),
      vercel("production", { APP_URL: "https://app.roxcoach.example" }),
      vercel("development", { VERCEL_URL: "x.vercel.app" }),
    ];
    for (const env of cases) expect(headersAppUrl(env), JSON.stringify(env)).toBe(effectiveAppUrl(env));
  });
});

describe("validación en el build", () => {
  it("solo en Vercel (Preview/Production); los builds locales no se bloquean", () => {
    expect(buildTimeProblems({})).toEqual([]);
    expect(buildTimeProblems({ ...project(DEV) })).toEqual([]);
    expect(buildTimeProblems(vercel("development"))).toEqual([]);
  });

  it("en Vercel, una variable obligatoria faltante hace fallar el build con un mensaje seguro", () => {
    const problems = buildTimeProblems({ ...vercel("production"), NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` });
    expect(names(problems)).toEqual(["APP_URL", "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
    expect(formatEnvProblems(problems)).toMatch(/^Configuración inválida: /);
  });
});

describe("configuración de Vercel en el repositorio", () => {
  it("región de funciones junto a Supabase (us-west-2 → pdx1) y Node fijado", () => {
    const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8")) as { regions?: string[]; framework?: string };
    expect(vercelJson.regions).toEqual(["pdx1"]);
    expect(vercelJson.framework).toBe("nextjs");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string }; scripts: Record<string, string> };
    expect(pkg.engines?.node).toBe("24.x");
    // El build valida las variables y compila; nunca migra (las migraciones van aparte con prisma migrate deploy).
    expect(pkg.scripts.build).toMatch(/^node .*scripts\/check-build-env\.mjs && next build$/);
    expect(Object.values(pkg.scripts).join(" ")).not.toMatch(/migrate (reset|dev)|db push/);
  });

  it("las variables de Vercel están catalogadas como gestionadas por la plataforma", () => {
    const platform = ENV_VARS.filter((v) => v.managedByPlatform).map((v) => v.name);
    expect(platform).toEqual(expect.arrayContaining(["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]));
    expect(ENV_VARS.filter((v) => v.deprecated).map((v) => v.name).sort()).toEqual(["TEST_ATHLETE_PASSWORD", "TEST_COACH_PASSWORD"]);
  });

  it("el health check no toca la base de datos, la sesión ni revela configuración", () => {
    const source = readFileSync("app/api/health/route.ts", "utf8");
    expect(source).not.toMatch(/lib\/db|prisma|supabase|cookies\(|headers\(/);
    expect(source).not.toMatch(/process\.env|version/i);
    expect(source).toMatch(/Response\.json\(\{ status: "ok" \}/);
    expect(source).toMatch(/"Cache-Control": "no-store"/);
  });
});

describe("URL de producción de Vercel (sin dominio propio en el piloto)", () => {
  const PROD_URL = "roxcoach.vercel.app";
  const prodVercel = (extra: Record<string, string> = {}) => ({ ...project(PROD), ...vercel("production", { VERCEL_PROJECT_PRODUCTION_URL: PROD_URL, ...extra }) });

  it("Production con APP_URL = https://roxcoach.vercel.app es válida (HSTS incluido)", () => {
    expect(validateEnv({ ...prodVercel(), APP_URL: "https://roxcoach.vercel.app" }, "production")).toEqual([]);
    expect(validateEnv({ ...prodVercel(), APP_URL: "https://roxcoach.vercel.app/" }, "production")).toEqual([]);
  });

  it("Production rechaza la URL de un deployment o de Preview como APP_URL", () => {
    for (const appUrl of ["https://roxcoach-abc123-equipo.vercel.app", "https://roxcoach-git-rama-equipo.vercel.app", "http://roxcoach.vercel.app"]) {
      expect(names(validateEnv({ ...prodVercel({ VERCEL_URL: "roxcoach-abc123-equipo.vercel.app" }), APP_URL: appUrl }, "production")), appUrl).toContain("APP_URL");
    }
  });

  it("Preview nunca apunta a producción; sin APP_URL usa la URL de su rama", () => {
    const preview = { ...project(DEV), ...vercel("preview", { VERCEL_PROJECT_PRODUCTION_URL: PROD_URL, VERCEL_BRANCH_URL: "roxcoach-git-rama-equipo.vercel.app" }) };
    expect(validateEnv(preview, "production")).toEqual([]);
    expect(effectiveAppUrl(preview)).toBe("https://roxcoach-git-rama-equipo.vercel.app");
    expect(validateEnv({ ...preview, APP_URL: "https://roxcoach.vercel.app" }, "production")).toEqual([
      { name: "APP_URL", reason: expect.stringMatching(/no debe apuntar a la URL de producción/) },
    ]);
  });

  it("si Vercel asigna otro nombre al proyecto, APP_URL desactualizada hace fallar el build", () => {
    const problems = buildTimeProblems({ ...prodVercel({ VERCEL_PROJECT_PRODUCTION_URL: "roxcoach-xyz.vercel.app" }), APP_URL: "https://roxcoach.vercel.app" });
    expect(names(problems)).toEqual(["APP_URL"]);
  });
});
