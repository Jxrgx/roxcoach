import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  ATHLETE_STATE,
  COACH_STATE,
  collectErrors,
  dbQuery,
  e2eEnv,
  horizontalOverflow,
  loginViaUi,
  readSeedIds,
  smallTargets,
} from "./helpers";

const BASE_URL = "http://localhost:3100";

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Crea un usuario confirmado de prueba; devuelve id y contraseña (solo en memoria). */
async function createUser(email: string, role: "coach" | "athlete", name: string) {
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !data.user) throw error ?? new Error("No se creó el usuario de prueba");
  return { id: data.user.id, email, password };
}

/** Borra un usuario de prueba; falla si no se pudo (p. ej. por una restricción de la BD). */
async function deleteUser(id: string | undefined) {
  if (!id) return;
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
}

async function newContext(browser: Browser, storageState?: string): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState });
}

/** Inserta una invitación directamente (estados difíciles de producir por UI). */
async function insertInvitation(email: string, opts: { expiresAt?: Date; coachId?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await dbQuery(
    `insert into invitations (id, coach_id, email, token_hash, expires_at) values (gen_random_uuid(), $1, $2, $3, $4)`,
    [opts.coachId ?? readSeedIds().coachId, email, tokenHash, (opts.expiresAt ?? new Date(Date.now() + 86_400_000)).toISOString()],
  );
  return `/invitacion/${token}`;
}

async function cancelInvitationsFor(email: string) {
  await dbQuery(`update invitations set status = 'cancelled' where email = $1 and status = 'pending'`, [email]);
}

/** Desde /coach/atletas: crea una invitación por la UI y devuelve el enlace. */
async function inviteFromUi(page: Page, email: string, name = "") {
  await page.goto("/coach/atletas");
  await page.getByRole("main").getByRole("button", { name: "Invitar atleta" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Invitar atleta" });
  await dialog.getByLabel("Correo del atleta").fill(email);
  if (name) await dialog.getByLabel(/^Nombre/).fill(name);
  await dialog.getByRole("button", { name: "Crear invitación" }).click();
  return dialog;
}

test.describe("coach: invitar y gestionar atletas", () => {
  test.use({ storageState: COACH_STATE, permissions: ["clipboard-read", "clipboard-write"] });

  test("flujo completo: invitar → copiar → aceptar → editar → pausar → reactivar", async ({ page, browser }) => {
    const email = uniqueEmail("invitado");
    const athlete = await createUser(email, "athlete", "Atleta Invitado");
    try {
      const dialog = await inviteFromUi(page, email, "Atleta Invitado");
      const ready = page.getByRole("dialog", { name: "Invitación lista" });
      await expect(ready).toBeVisible();
      const link = await ready.getByLabel("Enlace de invitación").inputValue();
      expect(link).toMatch(/^http:\/\/localhost:3100\/invitacion\/[A-Za-z0-9_-]{43}$/);
      await ready.getByRole("button", { name: "Copiar enlace" }).click();
      await expect(ready.getByRole("button", { name: "Enlace copiado" })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await ready.getByRole("button", { name: "Listo" }).click();
      await expect(dialog).toBeHidden();

      // Aparece como invitación pendiente.
      await page.getByRole("tab", { name: /Invitaciones/ }).click();
      await expect(page.getByRole("tabpanel").getByText(email, { exact: true })).toBeVisible();
      await expect(page.getByRole("tabpanel").getByText("Pendiente").first()).toBeVisible();

      // El atleta abre el enlace sin sesión, entra y acepta.
      const athleteCtx = await newContext(browser);
      const athletePage = await athleteCtx.newPage();
      await athletePage.goto(link);
      await expect(athletePage.getByRole("heading", { level: 1, name: /te invita a entrenar/ })).toBeVisible();
      await expect(athletePage.getByText(/i•••@example\.com/)).toBeVisible();
      await athletePage.getByRole("link", { name: "Ya tengo cuenta" }).click();
      await athletePage.getByLabel("Correo").fill(athlete.email);
      await athletePage.getByLabel("Contraseña").fill(athlete.password);
      await athletePage.getByRole("button", { name: "Iniciar sesión" }).click();
      await expect(athletePage).toHaveURL(link);
      await athletePage.getByRole("button", { name: /Unirme al equipo de/ }).click();
      await expect(athletePage).toHaveURL(/\/atleta\/perfil\?bienvenida=1$/);
      await expect(athletePage.getByText(/Ya estás en el equipo de/)).toBeVisible();
      await expect(athletePage.getByRole("region", { name: "Tu coach" })).toBeVisible();

      // El enlace ya usado reconoce al atleta y no se puede reutilizar.
      await athletePage.goto(link);
      await expect(athletePage.getByText(/Ya formas parte del equipo de/)).toBeVisible();

      // El coach lo ve en su lista y abre el detalle.
      await page.goto("/coach/atletas");
      await page.getByRole("link", { name: /Atleta Invitado/ }).click();
      await expect(page).toHaveURL(new RegExp(`/coach/atletas/${athlete.id}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Atleta Invitado" })).toBeVisible();

      // Actualiza la información deportiva.
      await page.getByLabel("División HYROX").selectOption("Pro Women");
      await page.getByText("Lun", { exact: true }).click();
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Información deportiva actualizada")).toBeVisible();
      const [row] = await dbQuery<{ division: string }>(`select division from athlete_profiles where profile_id = $1`, [athlete.id]);
      expect(row?.division).toBe("Pro Women");

      // Pausa (con confirmación): solo lectura.
      await page.getByRole("button", { name: "Pausar atleta" }).click();
      await page.getByRole("dialog", { name: /Pausar a Atleta Invitado/ }).getByRole("button", { name: "Sí, pausar" }).click();
      await expect(page.getByRole("button", { name: "Reactivar atleta" })).toBeVisible();
      await expect(page.getByLabel("División HYROX")).toBeDisabled();
      await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);

      // El atleta ve la pausa.
      await athletePage.goto("/atleta/inicio");
      await expect(athletePage.getByText(/pausó tu plan/)).toBeVisible();

      // Reactivar.
      await page.getByRole("button", { name: "Reactivar atleta" }).click();
      await expect(page.getByRole("button", { name: "Pausar atleta" })).toBeVisible();
      await expect(page.getByLabel("División HYROX")).toBeEnabled();
      await athleteCtx.close();

      // Regresión: un atleta que aceptó una invitación puede eliminar su cuenta
      // y la invitación conserva su historial (aceptada, sin atleta).
      await deleteUser(athlete.id);
      const history = await dbQuery<{ status: string; accepted_by_id: string | null }>(
        `select status, accepted_by_id from invitations where email = $1`,
        [email],
      );
      expect(history).toEqual([{ status: "accepted", accepted_by_id: null }]);
      const relations = await dbQuery(`select 1 from coach_athletes where athlete_id = $1`, [athlete.id]);
      expect(relations).toHaveLength(0);
    } finally {
      await cancelInvitationsFor(email);
      const [still] = await dbQuery(`select id from profiles where id = $1`, [athlete.id]);
      if (still) await deleteUser(athlete.id);
    }
  });

  test("regenerar invalida el enlace anterior y cancelar lo desactiva", async ({ page, browser }) => {
    const email = uniqueEmail("regenera");
    await inviteFromUi(page, email);
    const ready = page.getByRole("dialog", { name: "Invitación lista" });
    const link1 = await ready.getByLabel("Enlace de invitación").inputValue();
    await ready.getByRole("button", { name: "Listo" }).click();

    await page.getByRole("tab", { name: /Invitaciones/ }).click();
    await page.getByRole("button", { name: `Regenerar enlace de ${email}` }).click();
    const fresh = page.getByRole("dialog", { name: "Nuevo enlace listo" });
    const link2 = await fresh.getByLabel("Enlace de invitación").inputValue();
    expect(link2).not.toBe(link1);
    await fresh.getByRole("button", { name: "Listo" }).click();

    const visitor = await newContext(browser);
    const v = await visitor.newPage();
    await v.goto(link1);
    await expect(v.getByText("Invitación no válida")).toBeVisible();
    await v.goto(link2);
    await expect(v.getByRole("heading", { level: 1, name: /te invita a entrenar/ })).toBeVisible();

    await page.getByRole("button", { name: `Cancelar invitación de ${email}` }).click();
    await page.getByRole("dialog", { name: "¿Cancelar invitación?" }).getByRole("button", { name: "Sí, cancelar invitación" }).click();
    await expect(page.getByText("Invitación cancelada")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText(email, { exact: true })).toHaveCount(0);

    await v.goto(link2);
    await expect(v.getByText("Esta invitación fue cancelada")).toBeVisible();
    await visitor.close();
  });

  test("no permite invitar a su propio atleta, a un coach ni duplicar pendientes", async ({ page }) => {
    const env = e2eEnv();
    await inviteFromUi(page, env.athleteEmail);
    await expect(page.getByText("Este atleta ya está en tu equipo.")).toBeVisible();

    await inviteFromUi(page, env.coachEmail);
    await expect(page.getByText("Este correo pertenece a una cuenta de coach.")).toBeVisible();

    const email = uniqueEmail("duplicada");
    await inviteFromUi(page, email);
    await expect(page.getByRole("dialog", { name: "Invitación lista" })).toBeVisible();
    await inviteFromUi(page, email);
    await expect(page.getByText(/Ya hay una invitación pendiente para este correo/)).toBeVisible();
    await cancelInvitationsFor(email);
  });

  test("valida el formulario de invitación en cliente", async ({ page }) => {
    await page.goto("/coach/atletas");
    await page.getByRole("main").getByRole("button", { name: "Invitar atleta" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Invitar atleta" });
    await dialog.getByRole("button", { name: "Crear invitación" }).click();
    await expect(dialog.getByText("Escribe el correo del atleta.")).toBeVisible();
    await dialog.getByLabel("Correo del atleta").fill("no-es-correo");
    await dialog.getByRole("button", { name: "Crear invitación" }).click();
    await expect(dialog.getByText("Revisa el formato del correo.")).toBeVisible();
  });

  test("una invitación vencida se marca como expirada para el coach y el atleta", async ({ page, browser }) => {
    const email = uniqueEmail("vencida");
    const path = await insertInvitation(email, { expiresAt: new Date(Date.now() - 60_000) });
    try {
      await page.goto("/coach/atletas");
      await page.getByRole("tab", { name: /Invitaciones/ }).click();
      const item = page.getByRole("tabpanel").getByRole("article").filter({ hasText: email });
      await expect(item.getByText("Expirada")).toBeVisible();

      const visitor = await newContext(browser);
      const v = await visitor.newPage();
      await v.goto(path);
      await expect(v.getByText("Esta invitación venció")).toBeVisible();
      await visitor.close();
    } finally {
      await cancelInvitationsFor(email);
    }
  });
});

test.describe("enlace de invitación: casos de bloqueo", () => {
  test("enlace inexistente o mal formado", async ({ page }) => {
    await page.goto("/invitacion/no-existe");
    await expect(page.getByText("Invitación no válida")).toBeVisible();
    await page.goto(`/invitacion/${randomBytes(32).toString("base64url")}`);
    await expect(page.getByText("Invitación no válida")).toBeVisible();
  });

  test("otro atleta (correo distinto) no puede aceptarla", async ({ browser }) => {
    const email = uniqueEmail("ajena");
    const path = await insertInvitation(email);
    try {
      const ctx = await newContext(browser, ATHLETE_STATE);
      const p = await ctx.newPage();
      await p.goto(path);
      await expect(p.getByText("Esta invitación es para otro correo")).toBeVisible();
      await expect(p.getByText(/a•••@example\.com/)).toBeVisible();
      await expect(p.getByRole("button", { name: /Unirme/ })).toHaveCount(0);
      await ctx.close();
    } finally {
      await cancelInvitationsFor(email);
    }
  });

  test("una cuenta de coach no puede aceptarla", async ({ browser }) => {
    const email = uniqueEmail("para-atleta");
    const path = await insertInvitation(email);
    try {
      const ctx = await newContext(browser, COACH_STATE);
      const p = await ctx.newPage();
      await p.goto(path);
      await expect(p.getByText("Esta invitación es para atletas")).toBeVisible();
      await ctx.close();
    } finally {
      await cancelInvitationsFor(email);
    }
  });

  test("un atleta con otro coach no puede aceptar (un coach a la vez)", async ({ browser }) => {
    const coach2 = await createUser(uniqueEmail("coach2"), "coach", "Coach Dos");
    const athlete = await createUser(uniqueEmail("con-coach"), "athlete", "Atleta Con Coach");
    try {
      await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [coach2.id, athlete.id]);
      const path = await insertInvitation(athlete.email);
      const ctx = await newContext(browser);
      const p = await ctx.newPage();
      await loginViaUi(p, athlete.email, athlete.password);
      await expect(p).toHaveURL(/\/atleta\/inicio$/);
      await p.goto(path);
      await expect(p.getByText("Ya entrenas con otro coach")).toBeVisible();
      await expect(p.getByRole("button", { name: /Unirme/ })).toHaveCount(0);
      await ctx.close();
    } finally {
      await cancelInvitationsFor(athlete.email);
      await deleteUser(athlete.id);
      await deleteUser(coach2.id);
    }
  });

  test("el registro desde una invitación preselecciona el rol de atleta", async ({ page }) => {
    await page.goto(`/registro?rol=athlete&next=${encodeURIComponent("/invitacion/abc")}`);
    await expect(page.getByRole("radio", { name: "Atleta" })).toBeChecked();
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`la página de invitación es responsive en ${vp.width}px`, async ({ browser }) => {
      const email = uniqueEmail(`responsive${vp.width}`);
      const path = await insertInvitation(email);
      try {
        const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: vp, locale: "es-MX" });
        const p = await ctx.newPage();
        const errors = collectErrors(p);
        await p.goto(path, { waitUntil: "networkidle" });
        await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(p), "sin scroll horizontal").toBeLessThanOrEqual(0);
        expect(await smallTargets(p), "áreas táctiles ≥ 44 px").toEqual([]);
        await p.screenshot({ path: `test-results/screens/${vp.width}/invitacion.png`, fullPage: true });
        expect(errors, "sin errores de consola").toEqual([]);
        await ctx.close();
      } finally {
        await cancelInvitationsFor(email);
      }
    });
  }
});

test.describe("aislamiento entre coaches", () => {
  test("un coach no ve ni gestiona atletas de otro coach", async ({ browser }) => {
    const coach2 = await createUser(uniqueEmail("coach-ajeno"), "coach", "Coach Ajeno");
    try {
      const ctx = await newContext(browser);
      const p = await ctx.newPage();
      await loginViaUi(p, coach2.email, coach2.password);
      await expect(p).toHaveURL(/\/coach\/inicio$/);

      await p.goto("/coach/atletas");
      await expect(p.getByText("Todavía no tienes atletas registrados")).toBeVisible();
      await expect(p.getByText("Atleta Pruebas")).toHaveCount(0);

      // El detalle de un atleta ajeno se ve como inexistente.
      await p.goto(`/coach/atletas/${readSeedIds().athleteId}`);
      await expect(p.getByText("Este atleta no está en tu equipo")).toBeVisible();

      // No puede invitar a un atleta que ya tiene coach.
      await inviteFromUi(p, e2eEnv().athleteEmail);
      await expect(p.getByText("Este correo ya pertenece a un atleta con otro coach.")).toBeVisible();
      await ctx.close();
    } finally {
      await deleteUser(coach2.id);
    }
  });

  test("sin sesión, el detalle de un atleta redirige al login", async ({ page }) => {
    await page.goto(`/coach/atletas/${readSeedIds().athleteId}`);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
