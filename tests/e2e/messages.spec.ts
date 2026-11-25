import { randomBytes } from "node:crypto";
import { type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test } from "./fixtures";
import { dbQuery, e2eEnv, horizontalOverflow, loginViaUi, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Mensajes uno a uno atleta–coach (fase 16). Cada prueba crea su PROPIO coach,
 * sus atletas y un coach ajeno; nada usa el coach del dataset demo ni los
 * usuarios compartidos. Al borrar los usuarios, sus mensajes se borran en
 * cascada (FK a los perfiles).
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

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
  const email = `${role}.mensajes.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, name, email, password };
}

async function relate(coachId: string, athleteId: string, status: "active" | "paused" = "active") {
  const [r] = await dbQuery<{ id: string }>(
    `insert into coach_athletes (id, coach_id, athlete_id, status, paused_at) values (gen_random_uuid(), $1, $2, $3, ${status === "paused" ? "now()" : "null"}) returning id`,
    [coachId, athleteId, status],
  );
  data.relations.push(r!.id);
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

async function setup() {
  const suffix = Math.random().toString(36).slice(2, 6);
  const coach = await createUser("coach", `Coach Mensajes ${suffix}`);
  const ana = await createUser("athlete", `Ana Mensajes ${suffix}`);
  const beto = await createUser("athlete", `Beto Mensajes ${suffix}`);
  const otherCoach = await createUser("coach", `Coach Ajeno ${suffix}`);
  await relate(coach.id, ana.id);
  await relate(coach.id, beto.id);
  return { coach, ana, beto, otherCoach };
}

const messagesOf = (coachId: string, athleteId: string) =>
  dbQuery<{ sender: string; body: string; read_at: string | null }>(
    `select sender::text, body, read_at from messages where coach_id = $1 and athlete_id = $2 order by created_at`,
    [coachId, athleteId],
  );

test.describe("mensajes atleta–coach", () => {
  test("el atleta escribe, el coach lee y responde; leído / no leído; aislamiento entre atletas y coaches", async ({ browser }) => {
    test.slow();
    const { coach, ana, beto, otherCoach } = await setup();

    // Atleta: acceso desde el encabezado; conversación vacía con su coach.
    const a = await loggedIn(browser, ana);
    await a.page.goto("/atleta/inicio");
    await a.page.getByRole("link", { name: "Mensajes" }).filter({ visible: true }).first().click();
    await expect(a.page).toHaveURL(/\/atleta\/mensajes$/);
    await expect(a.page.getByRole("heading", { name: coach.name })).toBeVisible();
    await expect(a.page.getByText("Todavía no hay mensajes")).toBeVisible();

    const box = a.page.getByLabel(`Mensaje para ${coach.name}`);
    await box.fill("Hola coach, ¿subo la carga del sled?");
    await a.page.getByRole("button", { name: "Enviar" }).click();
    await expect(box).toHaveValue("");
    const sent = a.page.getByRole("listitem").filter({ hasText: "¿subo la carga del sled?" });
    await expect(sent).toContainText("Enviado");
    expect(await messagesOf(coach.id, ana.id)).toEqual([{ sender: "athlete", body: "Hola coach, ¿subo la carga del sled?", read_at: null }]);

    // Coach: lista con no leídos; Beto aparece sin mensajes (se le puede escribir).
    const c = await loggedIn(browser, coach);
    await c.page.goto("/coach/mensajes");
    await expect(c.page.getByText("1 mensaje sin leer.")).toBeVisible();
    const anaItem = c.page.getByRole("link", { name: new RegExp(ana.name) });
    await expect(anaItem).toContainText("1 mensaje sin leer");
    await expect(c.page.getByRole("link", { name: new RegExp(beto.name) })).toContainText("Sin mensajes todavía");

    // Abrir la conversación la marca como leída.
    await anaItem.click();
    await expect(c.page).toHaveURL(new RegExp(`/coach/mensajes\\?atleta=${ana.id}$`));
    await expect(c.page.getByRole("list", { name: "Mensajes" }).getByText("¿subo la carga del sled?")).toBeVisible();
    await expect.poll(async () => (await messagesOf(coach.id, ana.id))[0]?.read_at).not.toBeNull();

    await c.page.getByLabel(`Mensaje para ${ana.name}`).fill("Sí, 5 kg más.");
    await c.page.getByRole("button", { name: "Enviar" }).click();
    await expect(c.page.getByLabel(`Mensaje para ${ana.name}`)).toHaveValue("");
    await expect(c.page.getByRole("listitem").filter({ hasText: "Sí, 5 kg más." })).toContainText("Enviado");

    // Atleta: indicador de no leídos en el encabezado; al abrir ve la respuesta y su mensaje como leído.
    await a.page.goto("/atleta/inicio");
    await expect(a.page.getByRole("link", { name: "Mensajes, 1 sin leer" }).filter({ visible: true }).first()).toBeVisible();
    await a.page.goto("/atleta/mensajes");
    await expect(a.page.getByRole("list", { name: "Mensajes" }).getByText("Sí, 5 kg más.")).toBeVisible();
    await expect(a.page.getByRole("listitem").filter({ hasText: "¿subo la carga del sled?" })).toContainText("Leído");
    await expect.poll(async () => (await messagesOf(coach.id, ana.id))[1]?.read_at).not.toBeNull();

    // Otro atleta del mismo coach no ve la conversación de Ana.
    const b = await loggedIn(browser, beto);
    await b.page.goto("/atleta/mensajes");
    await expect(b.page.getByText("Todavía no hay mensajes")).toBeVisible();
    await expect(b.page.getByText("¿subo la carga del sled?")).toHaveCount(0);

    // Un coach ajeno no abre la conversación aunque conozca el id del atleta.
    const o = await loggedIn(browser, otherCoach);
    await o.page.goto(`/coach/mensajes?atleta=${ana.id}`);
    await expect(o.page.getByText("Esta conversación no está disponible")).toBeVisible();
    await expect(o.page.getByText("¿subo la carga del sled?")).toHaveCount(0);
    await expect(o.page.getByLabel(`Mensaje para ${ana.name}`)).toHaveCount(0);
    expect(await messagesOf(otherCoach.id, ana.id)).toEqual([]);

    for (const ctx of [a.ctx, b.ctx, c.ctx, o.ctx]) await ctx.close();
  });

  test("sin conexión: avisa, conserva el texto y lo envía al volver", async ({ browser }) => {
    const { coach, ana } = await setup();
    const a = await loggedIn(browser, ana, { width: 390, height: 844 });
    await a.page.goto("/atleta/mensajes", { waitUntil: "networkidle" });
    const box = a.page.getByLabel(`Mensaje para ${coach.name}`);
    await box.fill("Mensaje escrito sin señal");
    await a.ctx.setOffline(true);
    await expect(a.page.getByText(/Enviar un mensaje requiere conexión; tu texto se queda aquí/)).toBeVisible();
    await expect(a.page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await expect(box).toHaveValue("Mensaje escrito sin señal");
    expect(await messagesOf(coach.id, ana.id)).toEqual([]);

    await a.ctx.setOffline(false);
    await expect(a.page.getByRole("button", { name: "Enviar" })).toBeEnabled();
    await a.page.getByRole("button", { name: "Enviar" }).click();
    await expect(box).toHaveValue("");
    await expect.poll(async () => (await messagesOf(coach.id, ana.id)).map((m) => m.body)).toEqual(["Mensaje escrito sin señal"]);
    await a.ctx.close();
  });

  test("relación en pausa: historial de solo lectura; la base rechaza escribir y editar", async ({ browser }) => {
    const { coach, ana } = await setup();
    await dbQuery(
      `insert into messages (id, coach_id, athlete_id, sender, body, client_id) values (gen_random_uuid(), $1, $2, 'coach', 'Mensaje previo', gen_random_uuid())`,
      [coach.id, ana.id],
    );
    await dbQuery(`update coach_athletes set status = 'paused', paused_at = now() where coach_id = $1 and athlete_id = $2`, [coach.id, ana.id]);

    const a = await loggedIn(browser, ana);
    await a.page.goto("/atleta/mensajes");
    await expect(a.page.getByRole("list", { name: "Mensajes" }).getByText("Mensaje previo")).toBeVisible();
    await expect(a.page.getByRole("note")).toContainText("Tu coach pausó tu plan");
    await expect(a.page.getByRole("button", { name: "Enviar" })).toHaveCount(0);

    const c = await loggedIn(browser, coach);
    await c.page.goto(`/coach/mensajes?atleta=${ana.id}`);
    await expect(c.page.getByRole("list", { name: "Mensajes" }).getByText("Mensaje previo")).toBeVisible();
    await expect(c.page.getByRole("note")).toContainText("está en pausa");
    await expect(c.page.getByLabel(`Mensaje para ${ana.name}`)).toHaveCount(0);

    // Defensa en la base (trigger messages_check), aunque la app lo impida antes.
    await expect(
      dbQuery(`insert into messages (id, coach_id, athlete_id, sender, body, client_id) values (gen_random_uuid(), $1, $2, 'athlete', 'x', gen_random_uuid())`, [coach.id, ana.id]),
    ).rejects.toThrow(/relación activa/);
    await expect(dbQuery(`update messages set body = 'editado' where coach_id = $1 and athlete_id = $2`, [coach.id, ana.id])).rejects.toThrow(/no se modifica/);
    await expect(dbQuery(`insert into messages (id, coach_id, athlete_id, sender, body, client_id) values (gen_random_uuid(), $1, $2, 'coach', '   ', gen_random_uuid())`, [coach.id, ana.id])).rejects.toThrow(
      /messages_body_check|relación activa/,
    );
    await a.ctx.close();
    await c.ctx.close();
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 390, height: 844 },
  ]) {
    test(`mensajes responsive en ${vp.width}px (atleta y coach)`, async ({ browser }) => {
      const { coach, ana } = await setup();
      await dbQuery(
        `insert into messages (id, coach_id, athlete_id, sender, body, client_id) values (gen_random_uuid(), $1, $2, 'athlete', $3, gen_random_uuid())`,
        [coach.id, ana.id, `Mensaje largo para probar el ajuste de línea ${"sin-espacios-".repeat(12)}fin`],
      );

      const a = await loggedIn(browser, ana, vp);
      await a.page.goto("/atleta/mensajes", { waitUntil: "networkidle" });
      await expect(a.page.getByRole("button", { name: "Enviar" })).toBeVisible();
      expect(await horizontalOverflow(a.page)).toBeLessThanOrEqual(0);
      expect(await smallTargets(a.page)).toEqual([]);

      // Coach en mobile: una vista a la vez (la conversación con "volver a la lista").
      const c = await loggedIn(browser, coach, vp);
      await c.page.goto(`/coach/mensajes?atleta=${ana.id}`, { waitUntil: "networkidle" });
      await expect(c.page.getByRole("link", { name: "Conversaciones" })).toBeVisible();
      await expect(c.page.getByRole("list", { name: "Conversaciones" })).toBeHidden();
      expect(await horizontalOverflow(c.page)).toBeLessThanOrEqual(0);
      await c.page.getByRole("link", { name: "Conversaciones" }).click();
      await expect(c.page.getByRole("list", { name: "Conversaciones" })).toBeVisible();
      expect(await horizontalOverflow(c.page)).toBeLessThanOrEqual(0);
      await a.ctx.close();
      await c.ctx.close();
    });
  }
});
