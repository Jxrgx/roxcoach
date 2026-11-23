/**
 * Reglas de configuración por ambiente (funciones puras, sin leer process.env).
 * Las usan `lib/env.ts`, `lib/http/origin.ts`, `instrumentation.ts`,
 * `next.config.ts` y las pruebas. Nunca devuelven ni registran VALORES de
 * variables: solo nombres y motivos.
 */

export type EnvScope = "public" | "server" | "migrations" | "tests";

export interface EnvVarSpec {
  name: string;
  scope: EnvScope;
  /** Obligatoria para que la app arranque en producción. */
  requiredInProduction: boolean;
  /** Contiene un secreto (nunca debe llegar al navegador ni a los logs). */
  secret: boolean;
  description: string;
}

/**
 * Catálogo único de variables. Si agregas una variable, regístrala aquí y en
 * `.env.example` (la prueba unitaria compara ambos).
 */
export const ENV_VARS: readonly EnvVarSpec[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", scope: "public", requiredInProduction: true, secret: false, description: "URL del proyecto Supabase." },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", scope: "public", requiredInProduction: true, secret: false, description: "Publishable key (protegida por RLS)." },
  { name: "DATABASE_URL", scope: "server", requiredInProduction: true, secret: true, description: "Conexión de la app (pooler, modo transacción)." },
  { name: "APP_URL", scope: "server", requiredInProduction: true, secret: false, description: "Origen público de la app (enlaces de correo e invitación)." },
  { name: "ALLOWED_ORIGINS", scope: "server", requiredInProduction: false, secret: false, description: "Orígenes extra permitidos, separados por coma." },
  { name: "ROXCOACH_CATALOG", scope: "server", requiredInProduction: false, secret: false, description: "Habilita /componentes. Nunca en producción." },
  { name: "ROXCOACH_DB_TRACE", scope: "server", requiredInProduction: false, secret: false, description: "Registra las consultas (SQL parametrizado, sin valores) para medir. Nunca en producción." },
  { name: "DIRECT_URL", scope: "migrations", requiredInProduction: false, secret: true, description: "Conexión directa para prisma migrate deploy." },
  { name: "SUPABASE_SECRET_KEY", scope: "tests", requiredInProduction: false, secret: true, description: "Solo pruebas E2E (crea usuarios de prueba)." },
  { name: "E2E_COACH_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Coach de prueba." },
  { name: "E2E_ATHLETE_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Atleta de prueba." },
  { name: "E2E_COACH_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña del coach de prueba." },
  { name: "E2E_ATHLETE_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña del atleta de prueba." },
  { name: "E2E_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña compartida de respaldo para pruebas." },
];

/** Solo las variables públicas pueden llevar el prefijo NEXT_PUBLIC_ (y viceversa). */
export function misclassifiedVars(vars: readonly EnvVarSpec[] = ENV_VARS): string[] {
  return vars
    .filter((v) => v.name.startsWith("NEXT_PUBLIC_") !== (v.scope === "public") || (v.scope === "public" && v.secret))
    .map((v) => v.name);
}

/** Origen normalizado (`https://app.ejemplo.com`) o null si no es http(s) válido. */
export function parseOrigin(raw: string | undefined | null): string | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Lista de orígenes permitidos: APP_URL + ALLOWED_ORIGINS (válidos, sin duplicados). */
export function allowedOrigins(env: { APP_URL?: string; ALLOWED_ORIGINS?: string }): string[] {
  const list = [env.APP_URL, ...(env.ALLOWED_ORIGINS ?? "").split(",")].map(parseOrigin).filter((o): o is string => o !== null);
  return [...new Set(list)];
}

export type EnvProblem = { name: string; reason: string };

/**
 * Valida la configuración para un ambiente. En producción exige las variables
 * obligatorias, APP_URL en https (salvo localhost, p. ej. para pruebas del
 * build) y que el catálogo de componentes esté apagado.
 */
export function validateEnv(env: Record<string, string | undefined>, mode: "development" | "production"): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const has = (name: string) => Boolean(env[name] && env[name]!.trim() !== "");

  if (mode === "production") {
    for (const v of ENV_VARS) if (v.requiredInProduction && !has(v.name)) problems.push({ name: v.name, reason: "falta" });
  }
  if (has("NEXT_PUBLIC_SUPABASE_URL") && !parseOrigin(env.NEXT_PUBLIC_SUPABASE_URL)) {
    problems.push({ name: "NEXT_PUBLIC_SUPABASE_URL", reason: "no es una URL http(s) válida" });
  }
  if (has("DATABASE_URL") && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL!.trim())) {
    problems.push({ name: "DATABASE_URL", reason: "debe empezar con postgresql://" });
  }
  if (has("APP_URL")) {
    const origin = parseOrigin(env.APP_URL);
    if (!origin) problems.push({ name: "APP_URL", reason: "no es una URL http(s) válida (solo el origen, sin credenciales)" });
    else if (mode === "production" && origin.startsWith("http:") && !isLocalOrigin(origin)) {
      problems.push({ name: "APP_URL", reason: "en producción debe usar https" });
    }
  }
  if (has("ALLOWED_ORIGINS")) {
    const bad = env.ALLOWED_ORIGINS!.split(",").filter((o) => o.trim() !== "" && !parseOrigin(o));
    if (bad.length > 0) problems.push({ name: "ALLOWED_ORIGINS", reason: `${bad.length} origen(es) inválido(s)` });
  }
  // Herramientas de desarrollo y medición: solo en local (también al probar el build).
  const local = isLocalOrigin(parseOrigin(env.APP_URL) ?? "https://x.invalid");
  if (mode === "production" && has("ROXCOACH_CATALOG") && !local) {
    problems.push({ name: "ROXCOACH_CATALOG", reason: "el catálogo de componentes no debe activarse en producción" });
  }
  if (mode === "production" && has("ROXCOACH_DB_TRACE") && !local) {
    problems.push({ name: "ROXCOACH_DB_TRACE", reason: "la traza de consultas es solo para medir en local" });
  }
  // Un secreto con prefijo público terminaría en el bundle del navegador.
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SECRET|PASSWORD|DATABASE|DIRECT_URL|SERVICE_ROLE/i.test(name)) {
      problems.push({ name, reason: "parece un secreto con prefijo NEXT_PUBLIC_ (se expondría al navegador)" });
    }
  }
  return problems;
}

/** Mensaje seguro (solo nombres y motivos, nunca valores). */
export function formatEnvProblems(problems: EnvProblem[]): string {
  return `Configuración inválida: ${problems.map((p) => `${p.name} (${p.reason})`).join("; ")}. Revisa .env.example y docs/deployment.md.`;
}

/**
 * Origen público para enlaces absolutos (correo de confirmación, invitaciones).
 * - Con APP_URL: siempre APP_URL (las cabeceras Host/Origin se ignoran: evita
 *   inyección de host en los enlaces).
 * - Sin APP_URL y fuera de producción: el origen de la petición SOLO si es
 *   local o está en ALLOWED_ORIGINS; si no, http://localhost:3000.
 * - Sin APP_URL en producción: null (el llamador falla de forma segura).
 */
export function resolvePublicOrigin(input: {
  appUrl?: string;
  allowedOrigins?: string;
  requestOrigin: string | null;
  production: boolean;
}): string | null {
  const app = parseOrigin(input.appUrl);
  if (app) return app;
  if (input.production) return null;
  const req = parseOrigin(input.requestOrigin);
  if (req && (isLocalOrigin(req) || allowedOrigins({ ALLOWED_ORIGINS: input.allowedOrigins }).includes(req))) return req;
  return "http://localhost:3000";
}
