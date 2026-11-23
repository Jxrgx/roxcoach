import { randomBytes } from "node:crypto";
import type { APIResponse, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { EXPECTED_DOCUMENT_404, expect, test } from "./fixtures";
import { ATHLETE_STATE, COACH_STATE, dbQuery, e2eEnv, readSeedIds } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Estados HTTP reales (cierre de la fase 14). Con Cache Components, un
 * notFound()/redirect() dentro de la página llega después del shell y queda en
 * 200; por eso:
 * - sin sesión y rol incorrecto: 307 desde el proxy;
 * - recursos inexistentes o AJENOS en carga directa: 404 desde el proxy, con el
 *   mismo shell y mensaje que la ruta;
 * - recursos propios: 200.
 * Cada prueba verifica estado, URL final, UI y (con el fixture común) consola.
 */

const BASE_URL = "http://localhost:3100";
const NIL = "00000000-0000-4000-8000-00000000ffff";
const SYSTEM_EXERCISE = "00000000-0000-4000-8000-000000000001";

/** Estado de una carga de documento sin seguir redirecciones (con las cookies del contexto). */
async function documentStatus(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(path, { maxRedirects: 0, headers: { accept: "text/html", "sec-fetch-dest": "document" } });
}

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createUser(data: TestData, role: "coach" | "athlete", name: string) {
  const email = `http.${role}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const { data: created, error } = await admin().auth.admin.createUser({
    email,
    password: `E2e-${randomBytes(9).toString("base64url")}`,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario de prueba");
  data.users.push(created.user.id);
  return created.user.id;
}

/** Datos de OTRO coach: su atleta, una sesión asignada a ese atleta y un ejercicio propio. */
async function foreignData(data: TestData) {
  const coachId = await createUser(data, "coach", "Coach Ajeno HTTP");
  const athleteId = await createUser(data, "athlete", "Atleta Ajeno HTTP");
  const [rel] = await dbQuery<{ id: string }>(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active') returning id`, [coachId, athleteId]);
  data.relations.push(rel!.id);
  const snapshot = JSON.stringify({
    version: 1,
    templateName: "Ajena",
    focus: null,
    intensity: "moderada",
    estimatedMinutes: 30,
    blocks: [
      {
        name: "Bloque",
        notes: null,
        exercises: [{ exerciseId: SYSTEM_EXERCISE, name: "Carrera 1 km", category: "carrera", equipment: [], sets: 1, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: null, notes: null }],
      },
    ],
  });
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, 'Sesión Ajena HTTP', current_date, $2) returning id`,
    [coachId, snapshot],
  );
  data.sessions.push(s!.id);
  await dbQuery(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2)`, [s!.id, athleteId]);
  const [ex] = await dbQuery<{ id: string }>(
    `insert into exercises (id, coach_id, name, category, difficulty, instructions, equipment) values (gen_random_uuid(), $1, 'Ejercicio Ajeno HTTP', 'fuerza', 'intermedio', 'Instrucciones de prueba para E2E.', '{}') returning id`,
    [coachId],
  );
  data.exercises.push(ex!.id);
  return { coachId, athleteId, sessionId: s!.id, exerciseId: ex!.id };
}

test.describe("sin sesión y sesión expirada", () => {
  test("sin sesión: 307 al login conservando el destino", async ({ page }) => {
    const res = await documentStatus(page, "/coach/atletas");
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toBe("/login?next=%2Fcoach%2Fatletas");
    await page.goto("/atleta/perfil");
    await expect(page).toHaveURL(/\/login\?next=%2Fatleta%2Fperfil$/);
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("sesión expirada o alterada: 307 al login", async ({ browser }) => {
    // Cookies de sesión con un token inválido (como uno caducado que ya no se puede refrescar).
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: COACH_STATE });
    const cookies = (await ctx.cookies()).filter((c) => /auth-token/.test(c.name));
    expect(cookies.length).toBeGreaterThan(0);
    await ctx.clearCookies();
    await ctx.addCookies(cookies.map((c) => ({ ...c, value: "base64-eyJpbnZhbGlkbyI6dHJ1ZX0" })));
    const page = await ctx.newPage();
    const res = await documentStatus(page, "/coach/sesiones/nueva");
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/^\/login\?next=/);
    await page.goto("/coach/inicio");
    await expect(page).toHaveURL(/\/login\?next=%2Fcoach%2Finicio$/);
    await ctx.close();
  });
});

test.describe("rol incorrecto", () => {
  test.describe(() => {
    test.use({ storageState: ATHLETE_STATE });
    test("un atleta que pide el panel del coach: 307 a su inicio", async ({ page }) => {
      const res = await documentStatus(page, "/coach/atletas");
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toBe("/atleta/inicio");
      await page.goto("/coach/sesiones/nueva");
      await expect(page).toHaveURL(/\/atleta\/inicio$/);
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /^Hola,/ })).toBeVisible();
    });
  });

  test.describe(() => {
    test.use({ storageState: COACH_STATE });
    test("un coach que pide la app del atleta: 307 a su inicio", async ({ page }) => {
      const res = await documentStatus(page, "/atleta/progreso");
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toBe("/coach/inicio");
      await page.goto("/atleta/perfil");
      await expect(page).toHaveURL(/\/coach\/inicio$/);
    });

    test("?next a otro dominio o inválido no sale de RoxCoach", async ({ page }) => {
      // Con sesión, /login lleva al inicio del rol e ignora `next`.
      for (const next of ["https://evil.example/robar", "//evil.example", "/\t/evil.example"]) {
        const res = await documentStatus(page, `/login?next=${encodeURIComponent(next)}`);
        expect(res.status()).toBe(307);
        expect(res.headers()["location"]).toBe("/coach/inicio");
      }
      // Confirmación con token inválido y next externo: error en el propio sitio.
      await page.context().clearCookies();
      await page.goto(`/auth/confirm?token_hash=invalido&type=email&next=${encodeURIComponent("https://evil.example")}`);
      await expect(page).toHaveURL(`${BASE_URL}/login?error=confirmacion`);
    });
  });
});

test.describe("recursos inexistentes, mal formados y ajenos: 404 real", () => {
  let data: TestData;
  test.beforeEach(({ consoleGuard }) => {
    data = new TestData();
    // Chromium registra en consola cada documento que responde 404: es lo que se prueba aquí.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
  });
  test.afterEach(async () => {
    await data.cleanup();
  });

  test("ruta inexistente: 404 con el mensaje genérico", async ({ page }) => {
    const res = await page.goto("/ruta-que-no-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("No encontramos esta página")).toBeVisible();
  });

  test.describe(() => {
    test.use({ storageState: COACH_STATE });

    test("coach: atleta, sesión, ejercicio y plantilla de OTRO coach → 404 con el shell y el mensaje de la ruta", async ({ page }) => {
      const other = await foreignData(data);
      const cases = [
        { path: `/coach/atletas/${other.athleteId}`, text: "Este atleta no está en tu equipo" },
        { path: `/coach/progreso/${other.athleteId}`, text: "Este atleta no está en tu equipo" },
        { path: `/coach/sesiones/${other.sessionId}`, text: "Esta sesión no está en tu calendario" },
        { path: `/coach/sesiones/${other.sessionId}/atletas/${other.athleteId}`, text: "Esta sesión no está en tu calendario" },
        { path: `/coach/biblioteca/${other.exerciseId}`, text: "Este ejercicio no está en tu biblioteca" },
        { path: `/coach/biblioteca/${other.exerciseId}/editar`, text: "Este ejercicio no está en tu biblioteca" },
        { path: `/coach/entrenamientos/${NIL}`, text: "Esta plantilla no está entre tus entrenamientos" },
        { path: "/coach/sesiones/no-es-un-id", text: "Esta sesión no está en tu calendario" },
      ];
      for (const c of cases) {
        const res = await page.goto(c.path);
        expect(res?.status(), c.path).toBe(404);
        await expect(page).toHaveURL(BASE_URL + c.path);
        await expect(page.getByText(c.text)).toBeVisible();
        // Mismo shell del panel (navegación), sin datos del recurso ajeno.
        await expect(page.getByRole("navigation", { name: "Navegación principal" }).first()).toBeAttached();
        await expect(page.getByText(/Ajen[oa] HTTP/)).toHaveCount(0);
      }
    });

    test("coach: lo propio y lo del sistema siguen en 200", async ({ page }) => {
      const { athleteId } = readSeedIds();
      for (const path of [`/coach/atletas/${athleteId}`, `/coach/biblioteca/${SYSTEM_EXERCISE}`]) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBe(200);
        await expect(page.getByRole("main").getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
      }
      // Un ejercicio del sistema no se edita: 404 real.
      expect((await page.goto(`/coach/biblioteca/${SYSTEM_EXERCISE}/editar`))?.status()).toBe(404);
    });
  });

  test.describe(() => {
    test.use({ storageState: ATHLETE_STATE });

    test("atleta: sesión no asignada y ejercicio de otro coach → 404 con su shell", async ({ page }) => {
      const other = await foreignData(data);
      const cases = [
        { path: `/atleta/sesiones/${other.sessionId}`, text: "Esta sesión no está en tu agenda" },
        { path: `/atleta/sesiones/${other.sessionId}/ejecutar`, text: "Esta sesión no está en tu agenda" },
        { path: `/atleta/sesiones/${NIL}/resumen`, text: "Esta sesión no está en tu agenda" },
        { path: `/atleta/ejercicios/${other.exerciseId}`, text: "Este ejercicio no está disponible" },
      ];
      for (const c of cases) {
        const res = await page.goto(c.path);
        expect(res?.status(), c.path).toBe(404);
        await expect(page.getByText(c.text)).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Navegación principal" }).first()).toBeAttached();
      }
      expect((await page.goto(`/atleta/ejercicios/${SYSTEM_EXERCISE}`))?.status()).toBe(200);
    });
  });
});
