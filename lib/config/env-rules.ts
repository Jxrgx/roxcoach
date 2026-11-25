/**
 * Reglas de configuración por ambiente (funciones puras, sin leer process.env).
 * Las usan `lib/env.ts`, `lib/http/origin.ts`, `instrumentation.ts`,
 * `next.config.ts` y las pruebas. Nunca devuelven ni registran VALORES de
 * variables: solo nombres y motivos.
 */

export type EnvScope = "public" | "server" | "migrations" | "tests" | "vercel";

export interface EnvVarSpec {
  name: string;
  scope: EnvScope;
  /** Obligatoria para que la app arranque en producción. */
  requiredInProduction: boolean;
  /** Contiene un secreto (nunca debe llegar al navegador ni a los logs). */
  secret: boolean;
  description: string;
  /** La define la plataforma (Vercel) automáticamente: no va en .env.example ni se configura a mano. */
  managedByPlatform?: boolean;
  /** Ya no la usa el código; se documenta para retirarla y la validación la rechaza en Vercel. */
  deprecated?: boolean;
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
  { name: "TEST_COACH_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, deprecated: true, description: "Obsoleta: ningún archivo la usa (las e2e usan E2E_COACH_PASSWORD). Retírala; nunca en Vercel." },
  { name: "TEST_ATHLETE_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, deprecated: true, description: "Obsoleta: ningún archivo la usa (las e2e usan E2E_ATHLETE_PASSWORD). Retírala; nunca en Vercel." },
  // Dataset de demostración (scripts/demo): solo locales, nunca en Vercel.
  { name: "DEMO_TARGET_PROJECT_REF", scope: "tests", requiredInProduction: false, secret: false, description: "Ref del proyecto donde se permite el dataset demo (roxcoach-dev)." },
  { name: "DEMO_EXISTING_COACH_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Coach existente dueño del dataset demo." },
  { name: "DEMO_ATHLETE_ACTIVE_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Atleta demo activo." },
  { name: "DEMO_ATHLETE_ACTIVE_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña del atleta demo activo." },
  { name: "DEMO_ATHLETE_PAUSED_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Atleta demo en pausa." },
  { name: "DEMO_ATHLETE_PAUSED_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña del atleta demo en pausa." },
  { name: "DEMO_ATHLETE_PROGRESS_EMAIL", scope: "tests", requiredInProduction: false, secret: false, description: "Atleta demo con progreso." },
  { name: "DEMO_ATHLETE_PROGRESS_PASSWORD", scope: "tests", requiredInProduction: false, secret: true, description: "Contraseña del atleta demo con progreso." },
  // Variables del sistema de Vercel (las define Vercel en build y runtime; no se configuran a mano).
  { name: "VERCEL", scope: "vercel", requiredInProduction: false, secret: false, managedByPlatform: true, description: "\"1\" cuando el build o la función corren en Vercel." },
  { name: "VERCEL_ENV", scope: "vercel", requiredInProduction: false, secret: false, managedByPlatform: true, description: "development | preview | production." },
  { name: "VERCEL_URL", scope: "vercel", requiredInProduction: false, secret: false, managedByPlatform: true, description: "Host del despliegue (sin https://)." },
  { name: "VERCEL_BRANCH_URL", scope: "vercel", requiredInProduction: false, secret: false, managedByPlatform: true, description: "Host estable de la rama (Preview)." },
  { name: "VERCEL_PROJECT_PRODUCTION_URL", scope: "vercel", requiredInProduction: false, secret: false, managedByPlatform: true, description: "Host de producción del proyecto (p. ej. roxcoach.vercel.app), en todos los ambientes." },
];

/** Variables que NUNCA deben configurarse en Vercel (solo pruebas locales). */
const LOCAL_ONLY = ENV_VARS.filter((v) => v.scope === "tests").map((v) => v.name);

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

/**
 * Origen público efectivo. APP_URL manda siempre. Solo en Preview de Vercel, si
 * falta, se usa la URL estable de la rama (o la del despliegue): las URLs de
 * Preview cambian con cada rama. En Production debe definirse APP_URL a mano.
 */
export function effectiveAppUrl(env: Record<string, string | undefined>): string | undefined {
  const explicit = env.APP_URL?.trim();
  if (explicit) return explicit;
  if (env.VERCEL === "1" && env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim();
    if (host) return `https://${host.replace(/^https?:\/\//, "")}`;
  }
  return undefined;
}

/** Ref del proyecto Supabase en una URL de API o de base de datos (null si no se reconoce). */
export function supabaseProjectRef(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const api = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(url.hostname);
    if (api) return api[1]!;
    const direct = /^db\.([a-z0-9]{20})\.supabase\.(co|in)$/.exec(url.hostname);
    if (direct) return direct[1]!;
    const pooled = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username));
    if (pooled && /\.pooler\.supabase\.com$/.test(url.hostname)) return pooled[1]!;
  } catch {
    /* no es una URL */
  }
  return null;
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

  const onVercel = env.VERCEL === "1";
  const vercelEnv = onVercel ? env.VERCEL_ENV : undefined;
  if (mode === "production") {
    for (const v of ENV_VARS) {
      if (!v.requiredInProduction || has(v.name)) continue;
      // En Preview, APP_URL puede derivarse de la URL de la rama.
      if (v.name === "APP_URL" && vercelEnv !== "production" && effectiveAppUrl(env)) continue;
      problems.push({ name: v.name, reason: v.name === "APP_URL" && vercelEnv === "production" ? "falta (en Production debe ser el dominio real, explícito)" : "falta" });
    }
  }
  // Vercel: las variables de pruebas nunca se configuran ahí (ningún ambiente).
  if (onVercel) {
    for (const name of LOCAL_ONLY) if (has(name)) problems.push({ name, reason: "es solo para pruebas locales: no la configures en Vercel" });
  }
  // APP_URL frente a la URL de producción del proyecto (la define Vercel en todos los ambientes):
  // Production debe usar exactamente la URL estable (nunca la de un deployment o de Preview),
  // y Preview nunca debe apuntar a producción (sus correos e invitaciones irían a prod).
  const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const appOrigin = parseOrigin(env.APP_URL);
  if (onVercel && productionHost && appOrigin) {
    const appHost = new URL(appOrigin).host;
    if (vercelEnv === "production" && appHost !== productionHost) {
      problems.push({ name: "APP_URL", reason: "no coincide con la URL de producción del proyecto (VERCEL_PROJECT_PRODUCTION_URL): no uses la URL de un deployment ni de Preview" });
    }
    if (vercelEnv === "preview" && appHost === productionHost) {
      problems.push({ name: "APP_URL", reason: "en Preview no debe apuntar a la URL de producción (omítela: se usa la URL de la rama)" });
    }
  }
  if (vercelEnv === "production") {
    if (has("DIRECT_URL")) problems.push({ name: "DIRECT_URL", reason: "no hace falta en el runtime: las migraciones se ejecutan fuera de Vercel" });
    if (has("ALLOWED_ORIGINS") && env.ALLOWED_ORIGINS!.split(",").some((o) => parseOrigin(o)?.startsWith("http:"))) {
      problems.push({ name: "ALLOWED_ORIGINS", reason: "en Production solo se aceptan orígenes https" });
    }
  }
  // Nunca mezclar proyectos: la API y la base de datos deben ser del MISMO proyecto Supabase.
  const apiRef = supabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const dbRef = supabaseProjectRef(env.DATABASE_URL);
  if (apiRef && dbRef && apiRef !== dbRef) {
    problems.push({ name: "DATABASE_URL", reason: "apunta a un proyecto Supabase distinto de NEXT_PUBLIC_SUPABASE_URL (¿claves de dev y prod mezcladas?)" });
  }
  const directRef = supabaseProjectRef(env.DIRECT_URL);
  if (apiRef && directRef && apiRef !== directRef) {
    problems.push({ name: "DIRECT_URL", reason: "apunta a un proyecto Supabase distinto de NEXT_PUBLIC_SUPABASE_URL" });
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
  const local = !onVercel && isLocalOrigin(parseOrigin(effectiveAppUrl(env)) ?? "https://x.invalid");
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

/**
 * Validación en el BUILD (next.config.ts): solo en Vercel, donde Preview y
 * Production compilan con sus propias variables. Los builds locales (dev, e2e)
 * no se bloquean. [] = sin problemas.
 */
export function buildTimeProblems(env: Record<string, string | undefined>): EnvProblem[] {
  if (env.VERCEL !== "1" || env.VERCEL_ENV === "development") return [];
  return validateEnv(env, "production");
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
