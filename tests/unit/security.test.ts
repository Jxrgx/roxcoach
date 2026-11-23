import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedOrigins,
  ENV_VARS,
  formatEnvProblems,
  misclassifiedVars,
  parseOrigin,
  resolvePublicOrigin,
  validateEnv,
} from "@/lib/config/env-rules";
import { confirmNextPath, isSafeInternalPath, safeNextPath } from "@/lib/permissions";
import { redact, toLogRecord } from "@/lib/log";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

const PROD_OK = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  DATABASE_URL: "postgresql://u:p@host:6543/postgres",
  APP_URL: "https://app.roxcoach.example",
};

describe("variables de entorno", () => {
  it("producción válida no reporta problemas", () => {
    expect(validateEnv(PROD_OK, "production")).toEqual([]);
  });

  it("producción: faltantes e inválidas se reportan por NOMBRE, nunca por valor", () => {
    const problems = validateEnv({ ...PROD_OK, APP_URL: "", DATABASE_URL: "mysql://secreto-123@x" }, "production");
    expect(problems.map((p) => p.name).sort()).toEqual(["APP_URL", "DATABASE_URL"]);
    const message = formatEnvProblems(problems);
    expect(message).toMatch(/APP_URL \(falta\)/);
    expect(message).not.toMatch(/secreto-123|mysql/);
  });

  it("producción exige https en APP_URL (salvo localhost para probar el build)", () => {
    expect(validateEnv({ ...PROD_OK, APP_URL: "http://app.roxcoach.example" }, "production")).toEqual([
      { name: "APP_URL", reason: "en producción debe usar https" },
    ]);
    expect(validateEnv({ ...PROD_OK, APP_URL: "http://localhost:3100" }, "production")).toEqual([]);
    expect(validateEnv({ ...PROD_OK, APP_URL: "https://user:pw@app.example" }, "production")[0]?.name).toBe("APP_URL");
    expect(validateEnv({ ...PROD_OK, APP_URL: "javascript:alert(1)" }, "production")[0]?.name).toBe("APP_URL");
  });

  it("desarrollo no exige APP_URL, pero sí valida lo que viene", () => {
    expect(validateEnv({}, "development")).toEqual([]);
    expect(validateEnv({ NEXT_PUBLIC_SUPABASE_URL: "no-es-url", ALLOWED_ORIGINS: "https://ok.example, ftp://x" }, "development").map((p) => p.name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "ALLOWED_ORIGINS",
    ]);
  });

  it("el catálogo de componentes no se permite en producción real", () => {
    expect(validateEnv({ ...PROD_OK, ROXCOACH_CATALOG: "1" }, "production").map((p) => p.name)).toEqual(["ROXCOACH_CATALOG"]);
  });

  it("detecta secretos con prefijo público (terminarían en el navegador)", () => {
    expect(validateEnv({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: "x", NEXT_PUBLIC_DATABASE_URL: "y" }, "development").map((p) => p.name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
      "NEXT_PUBLIC_DATABASE_URL",
    ]);
  });

  it("clasificación: solo las públicas llevan NEXT_PUBLIC_ y ninguna pública es secreta", () => {
    expect(misclassifiedVars()).toEqual([]);
    expect(misclassifiedVars([{ name: "NEXT_PUBLIC_X", scope: "server", requiredInProduction: false, secret: false, description: "" }])).toEqual(["NEXT_PUBLIC_X"]);
    const secrets = ENV_VARS.filter((v) => v.secret).map((v) => v.name);
    expect(secrets).toEqual(expect.arrayContaining(["DATABASE_URL", "DIRECT_URL", "SUPABASE_SECRET_KEY"]));
  });

  it(".env.example documenta exactamente las variables del catálogo, sin valores reales", () => {
    const example = readFileSync(".env.example", "utf8");
    const names = [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(ENV_VARS.map((v) => v.name).sort());
    // Solo marcadores: nada que parezca una llave o una contraseña real.
    expect(example).not.toMatch(/sb_(secret|publishable)_(?!xxx\b)\w+/);
    expect(example).not.toMatch(/eyJ[\w-]{10,}/);
    expect(example).toMatch(/<password>/);
  });
});

/** Archivos que se ejecutan en el navegador ("use client") dentro de app/, components/ y lib/. */
function clientFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") continue;
    if (statSync(path).isDirectory()) clientFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name) && /^\s*["']use client["']/.test(readFileSync(path, "utf8"))) out.push(path);
  }
  return out;
}

describe("ningún secreto llega al código del cliente", () => {
  it("los componentes de cliente no leen variables de servidor", () => {
    const files = ["app", "components", "lib"].flatMap((d) => clientFiles(d));
    expect(files.length).toBeGreaterThan(10);
    const serverVars = ENV_VARS.filter((v) => v.scope !== "public").map((v) => v.name);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const name of serverVars) expect(source.includes(`process.env.${name}`), `${file} lee ${name}`).toBe(false);
    }
  });

  it("lib/env.ts (importable desde el cliente) solo referencia variables públicas o DATABASE_URL detrás de una función", () => {
    const source = readFileSync("lib/env.ts", "utf8");
    const used = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(used.filter((n) => !n?.startsWith("NEXT_PUBLIC_"))).toEqual(["DATABASE_URL"]);
  });
});

describe("origen público de los enlaces (inyección de cabecera Host)", () => {
  it("con APP_URL se ignoran Host/Origin de la petición", () => {
    expect(resolvePublicOrigin({ appUrl: "https://app.example/ruta/", requestOrigin: "https://evil.example", production: true })).toBe("https://app.example");
  });

  it("en producción sin APP_URL no hay origen (falla seguro)", () => {
    expect(resolvePublicOrigin({ requestOrigin: "https://evil.example", production: true })).toBeNull();
  });

  it("en desarrollo solo acepta orígenes locales o permitidos", () => {
    expect(resolvePublicOrigin({ requestOrigin: "http://localhost:3000", production: false })).toBe("http://localhost:3000");
    expect(resolvePublicOrigin({ requestOrigin: "http://127.0.0.1:3100", production: false })).toBe("http://127.0.0.1:3100");
    expect(resolvePublicOrigin({ requestOrigin: "https://evil.example", production: false })).toBe("http://localhost:3000");
    expect(resolvePublicOrigin({ requestOrigin: "https://tunel.example", allowedOrigins: "https://tunel.example", production: false })).toBe("https://tunel.example");
  });

  it("parseOrigin y allowedOrigins normalizan y descartan basura", () => {
    expect(parseOrigin("https://App.Example:443/x?y")).toBe("https://app.example");
    expect(parseOrigin("ftp://x")).toBeNull();
    expect(allowedOrigins({ APP_URL: "https://a.example/", ALLOWED_ORIGINS: "https://b.example, nope, https://a.example" })).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("redirecciones seguras", () => {
  it("bloquea trucos de parser: tabuladores, saltos de línea, espacios y codificación de control", () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", " /evil", "/ /x", "/\u0000x", "//evil", "/\\evil", "https://evil.example"]) {
      expect(isSafeInternalPath(bad), JSON.stringify(bad)).toBe(false);
      expect(safeNextPath(bad, "coach")).toBe("/coach/inicio");
    }
    expect(isSafeInternalPath("/" + "a".repeat(3000))).toBe(false);
  });

  it("normaliza `..` antes de decidir el área del rol", () => {
    expect(safeNextPath("/coach/../atleta/inicio", "coach")).toBe("/coach/inicio");
    expect(safeNextPath("/atleta/../coach/atletas", "coach")).toBe("/coach/atletas");
  });

  it("confirmNextPath: acepta ruta o URL del propio origen y desenvuelve /auth/confirm anidado", () => {
    const origins = ["https://app.example"];
    expect(confirmNextPath("/invitacion/abc", origins)).toBe("/invitacion/abc");
    // Plantilla: next={{ .RedirectTo }} = emailRedirectTo con su propio ?next=
    expect(confirmNextPath("https://app.example/auth/confirm?next=/invitacion/abc", origins)).toBe("/invitacion/abc");
    expect(confirmNextPath("https://app.example/auth/confirm?next=%2Finvitacion%2Fabc", origins)).toBe("/invitacion/abc");
    expect(confirmNextPath("https://app.example/auth/confirm", origins)).toBeNull();
    expect(confirmNextPath("https://app.example", origins)).toBeNull();
    expect(confirmNextPath(null, origins)).toBeNull();
  });

  it("confirmNextPath: nunca devuelve otro origen", () => {
    const origins = ["https://app.example"];
    for (const bad of [
      "https://evil.example/coach/inicio",
      "https://app.example.evil.example/x",
      "https://app.example/auth/confirm?next=https://evil.example",
      "https://app.example/auth/confirm?next=//evil.example",
      "https://app.example/auth/confirm?next=/%09/evil.example",
      "javascript:alert(1)",
    ]) {
      const path = confirmNextPath(bad, origins);
      expect(path === null || (path.startsWith("/") && !path.startsWith("//")), bad).toBe(true);
      expect(safeNextPath(path, "athlete")).toMatch(/^\/(?!\/)/);
    }
    expect(confirmNextPath("https://evil.example/coach/inicio", origins)).toBeNull();
    // Anidado infinito: se corta.
    const deep = "https://app.example/auth/confirm?next=" + encodeURIComponent("/auth/confirm?next=" + encodeURIComponent("/auth/confirm?next=" + encodeURIComponent("/auth/confirm?next=/x")));
    expect(confirmNextPath(deep, origins)).toBeNull();
  });
});

describe("registro seguro (logs)", () => {
  it("no registra correos, tokens, JWT, llaves ni cadenas de conexión", () => {
    const text = redact(
      "fallo para ana@example.com con postgresql://postgres.ref:Sup3r@host:5432/db token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk sb_secret_abc123 " +
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2",
    );
    expect(text).not.toMatch(/ana@example|Sup3r|eyJhbGci|sb_secret_abc|a1b2c3d4e5f6/);
    expect(text).toMatch(/\[correo\].*\[url\].*\[jwt\].*\[key\].*\[token\]/);
  });

  it("errores de Prisma: solo nombre y código (su mensaje incluye los valores de la consulta)", () => {
    const err = Object.assign(new Error("Invalid `db.setLog.create()` invocation: { notes: \"me duele la rodilla\" }"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    expect(toLogRecord("error", "saveFeedbackAction", err)).toEqual({ level: "error", ctx: "saveFeedbackAction", name: "PrismaClientKnownRequestError", code: "P2002" });
  });

  it("otros errores: primera línea recortada y saneada; nunca el stack", () => {
    const err = new Error("No se pudo conectar a db.example.com\n    at secret (/srv/app/lib/x.ts:1:1)");
    const record = toLogRecord("error", "ctx", err);
    expect(record.msg).toBe("No se pudo conectar a db.example.com");
    expect(JSON.stringify(record)).not.toMatch(/\bat secret|\/srv\/app/);
    expect(toLogRecord("warn", "ctx", "texto largo ".repeat(50)).msg).toHaveLength(160);
    expect(toLogRecord("info", "contexto con espacios <script>").ctx).toBe("app");
    expect(toLogRecord("error", "ctx", { password: "x" })).toEqual({ level: "error", ctx: "ctx", name: "object" });
  });
});

describe("cabeceras de seguridad", () => {
  const prod = { supabaseUrl: "https://abc.supabase.co/rest/v1/", appUrl: "https://app.example", development: false };
  const find = (opts: Parameters<typeof securityHeaders>[0], key: string) => securityHeaders(opts).find((h) => h.key === key)?.value;

  it("producción https: CSP estricta (sin eval), HSTS y el resto de cabeceras", () => {
    const csp = contentSecurityPolicy(prod);
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/worker-src 'self'/);
    expect(csp).toMatch(/manifest-src 'self'/);
    expect(csp).toMatch(/upgrade-insecure-requests/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(find(prod, "Strict-Transport-Security")).toMatch(/max-age=63072000/);
    expect(find(prod, "Strict-Transport-Security")).not.toMatch(/preload/);
    expect(find(prod, "X-Content-Type-Options")).toBe("nosniff");
    expect(find(prod, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(find(prod, "Permissions-Policy")).toMatch(/camera=\(\)/);
  });

  it("sin https (local) no hay HSTS ni upgrade-insecure-requests; dev permite eval", () => {
    const local = { ...prod, appUrl: "http://localhost:3100" };
    expect(find(local, "Strict-Transport-Security")).toBeUndefined();
    expect(contentSecurityPolicy(local)).not.toMatch(/upgrade-insecure-requests/);
    expect(contentSecurityPolicy({ ...local, development: true })).toMatch(/'unsafe-eval'/);
    expect(find({ ...prod, development: true }, "Strict-Transport-Security")).toBeUndefined();
  });

  it("sin Supabase configurado la CSP sigue siendo válida", () => {
    expect(contentSecurityPolicy({ development: false })).toMatch(/connect-src 'self';/);
  });
});
