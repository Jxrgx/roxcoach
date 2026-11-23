import { randomBytes } from "node:crypto";
import { type Browser, type Page } from "@playwright/test";
import { expect, test, EXPECTED_DOCUMENT_404 } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { ATHLETE_STATE, COACH_STATE, collectErrors, dbQuery, e2eEnv, field, horizontalOverflow, loginViaUi, readSeedIds, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

const BASE_URL = "http://localhost:3100";
/** Ejercicios del sistema con id fijo (migración add_exercises). */
const SYS = {
  skiErg: "00000000-0000-4000-8000-000000000003",
  sledPush: "00000000-0000-4000-8000-000000000004",
  remo: "00000000-0000-4000-8000-000000000007",
};

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function uniqueName(label: string) {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Datos creados por la prueba en curso (ids exactos; la app nunca borra ejercicios,
 * las pruebas sí). `afterEach` los borra aunque la prueba falle o agote el tiempo.
 */
let data = new TestData();
/** Ejercicios creados por la UI: se resuelven por (coach dueño, nombre único de la prueba). */
let createdByName: { coachId: string; name: string }[] = [];

test.beforeEach(() => {
  data = new TestData();
  createdByName = [];
});

test.afterEach(async () => {
  for (const { coachId, name } of createdByName) {
    const rows = await dbQuery<{ id: string }>(`select id from exercises where coach_id = $1 and name = $2`, [coachId, name]);
    data.exercises.push(...rows.map((r) => r.id));
  }
  await data.cleanup();
});

/** Inserta un ejercicio propio directamente (para casos de permisos); se registra su id. */
async function insertExercise(coachId: string, name: string, extra: { archived?: boolean } = {}) {
  const [row] = await dbQuery<{ id: string }>(
    `insert into exercises (id, coach_id, name, category, difficulty, instructions, equipment, archived_at)
     values (gen_random_uuid(), $1, $2, 'fuerza', 'intermedio', 'Instrucciones de prueba para E2E.', '{}', $3) returning id`,
    [coachId, name, extra.archived ? new Date().toISOString() : null],
  );
  data.exercises.push(row!.id);
  return row!.id;
}

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.ej.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, email, password };
}

async function loggedIn(browser: Browser, user: { email: string; password: string }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City" });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

async function addSubstitution(page: Page, name: string) {
  await field(page, "Buscar ejercicio para sustituir").fill(name);
  await page.getByRole("button", { name: `Agregar ${name} como sustitución` }).click();
  await field(page, "Buscar ejercicio para sustituir").fill("");
}

test.describe("biblioteca del coach", () => {
  test.use({ storageState: COACH_STATE });

  test("lista ejercicios del sistema con búsqueda y filtros", async ({ page }) => {
    await page.goto("/coach/biblioteca");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("link", { name: /Sled Push/ })).toBeVisible();

    await field(page, "Buscar ejercicio").fill("trineo");
    await expect(panel.getByRole("link", { name: /Sled Push/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Sled Pull/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /^Remo/ })).toHaveCount(0);
    await field(page, "Buscar ejercicio").fill("");

    await page.getByRole("tab", { name: /Movilidad/ }).click();
    await expect(panel.getByRole("link", { name: /Rotación torácica/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Sled Push/ })).toHaveCount(0);

    await page.getByRole("tab", { name: /Todas/ }).click();
    await field(page, "Dificultad").selectOption("principiante");
    await expect(panel.getByRole("link", { name: /SkiErg/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Sled Push/ })).toHaveCount(0);

    await field(page, "Origen").selectOption("system");
    await expect(panel.getByText("RoxCoach").first()).toBeVisible();
  });

  test("crear → ver → editar sustituciones → archivar → restaurar", async ({ page, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    const name = uniqueName("Sentadilla con salto");
    createdByName.push({ coachId: readSeedIds().coachId, name });
    await page.goto("/coach/biblioteca");
    await page.getByRole("link", { name: "Nuevo ejercicio" }).click();
    await expect(page).toHaveURL(/\/coach\/biblioteca\/nuevo$/);

    // Validación en cliente.
    await page.getByRole("button", { name: "Crear ejercicio" }).click();
    await expect(page.getByText("Escribe el nombre del ejercicio.")).toBeVisible();
    await expect(page.getByText("Elige una categoría.")).toBeVisible();

    await field(page, "Nombre").fill(name);
    await field(page, "Categoría").selectOption("fuerza");
    await field(page, "Dificultad").selectOption("avanzado");
    await field(page, "Instrucciones").fill("Baja a sentadilla y salta explosivo. Aterriza suave y encadena.");
    await field(page, /Indicación clave/).fill("Aterriza suave");
    await page.getByText("Kettlebells", { exact: true }).click();
    await field(page, "Tipo de medio").selectOption("video");
    await field(page, "Enlace").fill("http://inseguro.example/video");
    await page.getByRole("button", { name: "Crear ejercicio" }).click();
    await expect(page.getByText("Usa un enlace completo que empiece con https://")).toBeVisible();
    await field(page, "Enlace").fill("https://www.youtube.com/watch?v=roxcoach");
    await addSubstitution(page, "Sentadilla búlgara");
    await page.getByRole("button", { name: "Crear ejercicio" }).click();

    await expect(page).toHaveURL(/\/coach\/biblioteca\/[0-9a-f-]{36}\?guardado=1$/);
    const id = page.url().match(/biblioteca\/([0-9a-f-]{36})/)![1]!;
    data.exercises.push(id);
    await expect(page.getByText("Ejercicio guardado.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    // El detalle es el <article> visible (getByRole ignora la pantalla anterior oculta).
    const detail = page.getByRole("article");
    await expect(detail.getByText("Personalizado", { exact: true })).toBeVisible();
    await expect(detail.getByText("Aterriza suave", { exact: true })).toBeVisible();
    const video = page.getByRole("link", { name: /Ver video/ });
    await expect(video).toHaveAttribute("href", "https://www.youtube.com/watch?v=roxcoach");
    await expect(video).toHaveAttribute("target", "_blank");
    await expect(video).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("link", { name: /Sentadilla búlgara/ })).toBeVisible();

    // Editar: quitar la sustitución, agregar dos y reordenar.
    await page.getByRole("link", { name: "Editar" }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/biblioteca/${id}/editar$`));
    await page.getByRole("button", { name: "Quitar Sentadilla búlgara" }).click();
    await addSubstitution(page, "Wall Balls");
    await addSubstitution(page, "Burpee Broad Jump");
    await page.getByRole("button", { name: "Subir Burpee Broad Jump" }).click();
    await field(page, "Tipo de medio").selectOption("");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/biblioteca/${id}\\?guardado=1$`));
    const subs = page.getByRole("article").getByRole("listitem").filter({ has: page.getByRole("link") });
    await expect(subs.first()).toContainText("Burpee Broad Jump");
    await expect(subs.nth(1)).toContainText("Wall Balls");
    await expect(page.getByRole("link", { name: /Sentadilla búlgara/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: /sin medio visual/ })).toBeVisible();

    // Archivar (con confirmación): sale de la biblioteca y no se borra.
    await page.getByRole("button", { name: "Archivar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, archivar" }).click();
    await expect(page.getByText("Ejercicio archivado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurar" })).toBeVisible();
    await page.goto(`/coach/biblioteca/${id}/editar`);
    await expect(page.getByText("Este ejercicio no está en tu biblioteca")).toBeVisible();

    await page.goto("/coach/biblioteca");
    await field(page, "Buscar ejercicio").fill(name);
    await expect(page.getByRole("tabpanel").getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
    await field(page, "Origen").selectOption("archivados");
    await page.getByRole("tabpanel").getByRole("link", { name: new RegExp(name) }).click();

    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText("Ejercicio restaurado")).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toBeVisible();
    // El ejercicio creado se borra en afterEach (id exacto).
  });

  test("un ejercicio del sistema no se edita: se duplica como propio con sus sustituciones", async ({ page, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    await page.goto(`/coach/biblioteca/${SYS.skiErg}`);
    await expect(page.getByRole("heading", { level: 1, name: "SkiErg" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archivar" })).toHaveCount(0);

    await page.goto(`/coach/biblioteca/${SYS.skiErg}/editar`);
    await expect(page.getByText("Este ejercicio no está en tu biblioteca")).toBeVisible();

    await page.goto(`/coach/biblioteca/${SYS.skiErg}`);
    await page.getByRole("button", { name: "Duplicar como propio" }).click();
    await expect(page).toHaveURL(/\/coach\/biblioteca\/[0-9a-f-]{36}\/editar\?copia=1$/);
    // La copia se llama "SkiErg (personalizado)" (no es único): se registra por su id exacto.
    data.exercises.push(page.url().match(/biblioteca\/([0-9a-f-]{36})\/editar/)![1]!);
    await expect(page.getByText(/Creamos tu copia personalizada/)).toBeVisible();
    const copyName = uniqueName("SkiErg");
    createdByName.push({ coachId: readSeedIds().coachId, name: copyName });
    await expect(field(page, "Nombre")).toHaveValue("SkiErg (personalizado)");
    await expect(page.getByRole("button", { name: "Quitar Remo" })).toBeVisible();
    await field(page, "Nombre").fill(copyName);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { level: 1, name: copyName })).toBeVisible();
    await expect(page.getByRole("link", { name: /^1\.\s*Remo/ })).toBeVisible();

    // El original del sistema no cambia.
    const [original] = await dbQuery<{ name: string }>(`select name from exercises where id = $1`, [SYS.skiErg]);
    expect(original?.name).toBe("SkiErg");
    // La copia se borra en afterEach por su id exacto (nunca por nombre).
  });

  test("ids inválidos o inexistentes muestran el mismo mensaje", async ({ page, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    await page.goto("/coach/biblioteca/no-es-uuid");
    await expect(page.getByText("Este ejercicio no está en tu biblioteca")).toBeVisible();
    await page.goto("/coach/biblioteca/00000000-0000-4000-8000-0000000fffff");
    await expect(page.getByText("Este ejercicio no está en tu biblioteca")).toBeVisible();
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`detalle y edición de un ejercicio propio son responsive en ${vp.width}px`, async ({ page }) => {
      const name = uniqueName(`Responsive ${vp.width}`);
      const id = await insertExercise(readSeedIds().coachId, name);
      await page.setViewportSize(vp);
      for (const path of [`/coach/biblioteca/${id}`, `/coach/biblioteca/${id}/editar`]) {
        const errors = collectErrors(page);
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(page), `${path} sin scroll horizontal`).toBeLessThanOrEqual(0);
        expect(await smallTargets(page), `${path} áreas táctiles ≥ 44 px`).toEqual([]);
        expect(errors, `${path} sin errores de consola`).toEqual([]);
        await page.screenshot({ path: `test-results/screens/${vp.width}/ejercicio${path.endsWith("editar") ? "_editar" : ""}.png`, fullPage: true });
      }
      // El ejercicio insertado se borra en afterEach.
    });
  }
});

test.describe("permisos de la biblioteca", () => {
  test("otro coach no ve ni edita ejercicios ajenos, ni los ve en su lista", async ({ browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    const name = uniqueName("Privado");
    const id = await insertExercise(readSeedIds().coachId, name);
    const coach2 = await createUser("coach", "Coach Ajeno");
    const { ctx, page } = await loggedIn(browser, coach2);
    await expect(page).toHaveURL(/\/coach\/inicio$/);
    for (const path of [`/coach/biblioteca/${id}`, `/coach/biblioteca/${id}/editar`]) {
      await page.goto(path);
      await expect(page.getByText("Este ejercicio no está en tu biblioteca")).toBeVisible();
    }
    await page.goto("/coach/biblioteca");
    await field(page, "Buscar ejercicio").fill(name);
    await expect(page.getByRole("tabpanel").getByText("No encontramos ejercicios")).toBeVisible();
    await ctx.close();
    // coach2 y el ejercicio insertado se borran en afterEach (ids exactos).
  });

  test("el atleta consulta ejercicios del sistema y de su coach, no archivados ni ajenos", async ({ browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    const ownName = uniqueName("Para mi atleta");
    const archivedName = uniqueName("Archivado");
    const coachId = readSeedIds().coachId;
    const ownId = await insertExercise(coachId, ownName);
    const archivedId = await insertExercise(coachId, archivedName, { archived: true });
    const stranger = await createUser("athlete", "Atleta Sin Coach");
    // Atleta vinculado al coach de prueba.
    const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: ATHLETE_STATE });
    const page = await ctx.newPage();
    await page.goto(`/atleta/ejercicios/${SYS.sledPush}`);
    await expect(page.getByRole("heading", { level: 1, name: "Sled Push" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Duplicar|Archivar/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
    await page.goto(`/atleta/ejercicios/${ownId}`);
    await expect(page.getByRole("heading", { level: 1, name: ownName })).toBeVisible();
    await page.goto(`/atleta/ejercicios/${archivedId}`);
    await expect(page.getByText("Este ejercicio no está disponible")).toBeVisible();
    await ctx.close();

    // Atleta sin coach: solo los del sistema.
    const other = await loggedIn(browser, stranger);
    await other.page.goto(`/atleta/ejercicios/${ownId}`);
    await expect(other.page.getByText("Este ejercicio no está disponible")).toBeVisible();
    await other.page.goto(`/atleta/ejercicios/${SYS.remo}`);
    await expect(other.page.getByRole("heading", { level: 1, name: "Remo" })).toBeVisible();
    await other.ctx.close();
    // El atleta y los dos ejercicios insertados se borran en afterEach.
  });

  test("sin sesión, la biblioteca y el detalle redirigen al login", async ({ page }) => {
    for (const path of ["/coach/biblioteca/nuevo", `/coach/biblioteca/${SYS.sledPush}`, `/atleta/ejercicios/${SYS.sledPush}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});
