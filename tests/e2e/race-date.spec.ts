import { randomBytes } from "node:crypto";
import { type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test } from "./fixtures";
import { dbQuery, e2eEnv, horizontalOverflow, loginViaUi } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Fecha de competencia opcional (fase 16). Usuarios propios de cada prueba:
 * no toca a los atletas del dataset demo ni a los compartidos.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

function dayKey(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

let data: TestData;
test.beforeEach(() => {
  data = new TestData();
});
test.afterEach(() => data.cleanup());

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.carrera.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, name, email, password };
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

const raceDateOf = async (athleteId: string) =>
  (await dbQuery<{ d: string | null }>(`select to_char(race_date, 'YYYY-MM-DD') d from athlete_profiles where profile_id = $1`, [athleteId]))[0]?.d ?? null;

test.describe("fecha de competencia", () => {
  test("atleta: sin fecha muestra «Entrenamiento continuo»; con fecha, cuenta regresiva; una fecha pasada se rechaza", async ({ browser }) => {
    const athlete = await createUser("athlete", `Ana Carrera ${Math.random().toString(36).slice(2, 6)}`);
    const { ctx, page } = await loggedIn(browser, athlete);

    // Sin fecha (estado inicial al crearse).
    await page.goto("/atleta/inicio");
    await expect(page.getByText("Entrenamiento continuo")).toBeVisible();
    await expect(page.getByText(/Faltan .* para tu carrera/)).toHaveCount(0);

    // Una fecha pasada: error junto al campo y el valor se conserva; no se guarda.
    await page.goto("/atleta/perfil", { waitUntil: "networkidle" });
    const field = page.getByLabel(/Fecha de competencia/);
    await field.fill(dayKey(-1));
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("La fecha de competencia debe ser hoy o posterior.")).toBeVisible();
    await expect(field).toHaveValue(dayKey(-1));
    expect(await raceDateOf(athlete.id)).toBeNull();

    // Fecha futura: se guarda y aparece la cuenta regresiva.
    await field.fill(dayKey(30));
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBe(dayKey(30));
    await page.goto("/atleta/inicio");
    await expect(page.getByText("Faltan 30 días para tu carrera")).toBeVisible();

    // Quitar la fecha: vuelve a «Entrenamiento continuo».
    await page.goto("/atleta/perfil", { waitUntil: "networkidle" });
    await page.getByLabel(/Fecha de competencia/).fill("");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBeNull();
    await page.goto("/atleta/inicio");
    await expect(page.getByText("Entrenamiento continuo")).toBeVisible();

    // Una fecha pasada YA guardada se conserva al editar otro campo.
    await dbQuery(`update athlete_profiles set race_date = $2 where profile_id = $1`, [athlete.id, dayKey(-10)]);
    await page.goto("/atleta/perfil", { waitUntil: "networkidle" });
    await page.getByLabel("División HYROX").selectOption("Pro Men");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBe(dayKey(-10));
    await ctx.close();
  });

  test("coach: guarda la información deportiva sin fecha, rechaza una pasada y acepta una futura", async ({ browser }) => {
    const suffix = Math.random().toString(36).slice(2, 6);
    const coach = await createUser("coach", `Coach Carrera ${suffix}`);
    const athlete = await createUser("athlete", `Beto Carrera ${suffix}`);
    const [r] = await dbQuery<{ id: string }>(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active') returning id`, [
      coach.id,
      athlete.id,
    ]);
    data.relations.push(r!.id);
    const { ctx, page } = await loggedIn(browser, coach);
    await page.goto(`/coach/atletas/${athlete.id}`, { waitUntil: "networkidle" });
    const field = page.getByLabel(/Fecha de competencia/);
    const save = page.getByRole("button", { name: "Guardar cambios" });

    await page.getByLabel("División HYROX").selectOption("Pro Men");
    await save.click();
    await expect(page.getByText("Información deportiva actualizada")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBeNull();

    await field.fill(dayKey(-2));
    await save.click();
    await expect(page.getByText("La fecha de competencia debe ser hoy o posterior.")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBeNull();

    await field.fill(dayKey(45));
    await save.click();
    await expect(page.getByText("Información deportiva actualizada")).toBeVisible();
    expect(await raceDateOf(athlete.id)).toBe(dayKey(45));
    await ctx.close();
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 390, height: 844 },
  ]) {
    test(`inicio del atleta con y sin fecha, responsive en ${vp.width}px`, async ({ browser }) => {
      const athlete = await createUser("athlete", `Carla Carrera ${Math.random().toString(36).slice(2, 6)}`);
      const { ctx, page } = await loggedIn(browser, athlete, vp);
      await page.goto("/atleta/inicio", { waitUntil: "networkidle" });
      await expect(page.getByText("Entrenamiento continuo")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await dbQuery(`update athlete_profiles set race_date = $2 where profile_id = $1`, [athlete.id, dayKey(12)]);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByText("Faltan 12 días para tu carrera")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }
});
