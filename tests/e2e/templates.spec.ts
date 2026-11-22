import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { COACH_STATE, collectErrors, dbQuery, e2eEnv, field, horizontalOverflow, loginViaUi, readSeedIds, smallTargets } from "./helpers";

const BASE_URL = "http://localhost:3100";
/** Ejercicios del sistema con id fijo (migración add_exercises). */
const SYS = {
  carrera: "00000000-0000-4000-8000-000000000001",
  sledPush: "00000000-0000-4000-8000-000000000004",
  rotacion: "00000000-0000-4000-8000-000000000014",
};

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function uniqueName(label: string) {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Limpieza de datos de prueba (la app nunca borra plantillas; las pruebas sí). */
async function deleteTemplatesNamed(prefix: string) {
  await dbQuery(`delete from workout_templates where name like $1`, [`${prefix}%`]);
}

/** Inserta una plantilla directamente: un bloque con un ejercicio (para casos de permisos y estados). */
async function insertTemplate(coachId: string, name: string, exerciseId: string, status = "borrador") {
  const [t] = await dbQuery<{ id: string }>(
    `insert into workout_templates (id, coach_id, name, intensity, estimated_minutes, status)
     values (gen_random_uuid(), $1, $2, 'media', 45, $3) returning id`,
    [coachId, name, status],
  );
  const [b] = await dbQuery<{ id: string }>(`insert into workout_blocks (id, template_id, position, name) values (gen_random_uuid(), $1, 0, 'Bloque 1') returning id`, [t!.id]);
  await dbQuery(
    `insert into block_exercises (id, block_id, exercise_id, position, sets, target_type, reps) values (gen_random_uuid(), $1, $2, 0, 3, 'reps', 10)`,
    [b!.id, exerciseId],
  );
  return t!.id;
}

async function createCoach(name: string) {
  const email = `coach.plant.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role: "coach" } });
  if (error || !data.user) throw error ?? new Error("No se creó el usuario");
  return { id: data.user.id, email, password };
}

async function deleteUser(id: string) {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
}

async function loggedIn(browser: Browser, user: { email: string; password: string }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City" });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

/** Grupo (fieldset) visible de un bloque por su posición. */
function block(page: Page, n: number): Locator {
  return page.getByRole("group", { name: new RegExp(`^Bloque ${n}:`) });
}

/** Grupo (fieldset) de un ejercicio dentro de la plantilla. */
function exercise(page: Page, name: string): Locator {
  return page.getByRole("group", { name: new RegExp(`^${name} \\(bloque`) });
}

async function addExercise(page: Page, blockLabel: string, exerciseName: string) {
  await page.getByRole("button", { name: `Agregar ejercicio a ${blockLabel}` }).click();
  const sheet = page.getByRole("dialog", { name: "Agregar ejercicio" });
  await sheet.getByLabel("Buscar en la biblioteca").fill(exerciseName);
  await sheet.getByRole("button", { name: `Agregar ${exerciseName}`, exact: true }).click();
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("constructor de plantillas", () => {
  test.use({ storageState: COACH_STATE });

  test("crear → bloques → ejercicios → reordenar → vista previa → guardar → publicar", async ({ page }) => {
    const name = uniqueName("Engine + Sled Push");
    try {
      await page.goto("/coach/entrenamientos");
      // Con la lista vacía hay dos enlaces (encabezado y estado vacío): mismo destino.
      await page.getByRole("link", { name: "Crear plantilla" }).first().click();
      await expect(page).toHaveURL(/\/coach\/entrenamientos\/nueva$/);

      // Validación en cliente: el nombre es obligatorio.
      await page.getByRole("button", { name: "Guardar plantilla" }).click();
      await expect(page.getByText("Escribe el nombre de la plantilla.")).toBeVisible();

      await field(page, "Nombre").fill(name);
      await field(page, /^Enfoque/).fill("Resistencia aeróbica y potencia en trineo");
      await field(page, "Intensidad").selectOption("alta");
      await field(page, "Duración estimada (min)").fill("65");

      // Bloque 1: Running.
      await block(page, 1).getByLabel("Nombre del bloque").fill("Running");
      await addExercise(page, "Running", "Carrera 1 km");
      const run = exercise(page, "Carrera 1 km");
      await run.getByLabel("Series").fill("4");
      await expect(run.getByLabel("Distancia (m)")).toHaveValue("1000");
      await run.getByLabel(/^Descanso/).fill("1:30");

      // Bloque 2: Sled Push con carga.
      await page.getByRole("button", { name: "Agregar bloque" }).click();
      await block(page, 2).getByLabel("Nombre del bloque").fill("Sled Push");
      await addExercise(page, "Sled Push", "Sled Push");
      const sled = exercise(page, "Sled Push");
      await sled.getByLabel("Objetivo").selectOption("distance");
      await sled.getByLabel("Distancia (m)").fill("50");
      await sled.getByLabel(/^Carga \(kg\)/).fill("152");
      await sled.getByLabel(/^Descanso/).fill("120");

      // Bloque 3: Movilidad, luego se sube al primer lugar y se regresa.
      await page.getByRole("button", { name: "Agregar bloque" }).click();
      await block(page, 3).getByLabel("Nombre del bloque").fill("Movilidad");
      await addExercise(page, "Movilidad", "Rotación torácica");
      await page.getByRole("button", { name: "Subir bloque Movilidad" }).click();
      await page.getByRole("button", { name: "Subir bloque Movilidad" }).click();
      await expect(block(page, 1)).toHaveAccessibleName(/Movilidad/);
      await page.getByRole("button", { name: "Bajar bloque Movilidad" }).click();
      await page.getByRole("button", { name: "Bajar bloque Movilidad" }).click();
      await expect(block(page, 3)).toHaveAccessibleName(/Movilidad/);

      // Error de formato en tiempo.
      const rot = exercise(page, "Rotación torácica");
      await rot.getByLabel("Objetivo").selectOption("time");
      await rot.getByLabel("Tiempo (mm:ss)").fill("1:75");
      await page.getByRole("button", { name: "Guardar plantilla" }).click();
      await expect(rot.getByText("Tiempo en mm:ss (por ejemplo 1:30).")).toBeVisible();
      await rot.getByLabel("Tiempo (mm:ss)").fill("1:00");

      // Vista previa antes de guardar.
      await page.getByRole("button", { name: "Vista previa" }).click();
      const preview = page.getByRole("dialog", { name: "Vista previa" });
      await expect(preview.getByRole("heading", { name })).toBeVisible();
      await expect(preview.getByText("4 × 1000 m · descanso 01:30")).toBeVisible();
      await expect(preview.getByText("1 × 50 m · 152 kg · descanso 02:00").or(preview.getByText("3 × 50 m · 152 kg · descanso 02:00"))).toBeVisible();
      await preview.getByRole("button", { name: "Seguir editando" }).click();

      // Guardar → detalle (borrador).
      await page.getByRole("button", { name: "Guardar plantilla" }).click();
      await expect(page).toHaveURL(/\/coach\/entrenamientos\/[0-9a-f-]{36}\?guardado=1$/);
      await expect(page.getByText("Plantilla guardada.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("4 × 1 km · descanso 01:30")).toBeVisible();
      await expect(page.getByText(/× 50 m · 152 kg · descanso 02:00/)).toBeVisible();
      await expect(page.getByText(/× 01:00/)).toBeVisible();

      // Se guardó la prescripción planeada (kg, metros, segundos).
      const rows = await dbQuery<{ name: string; target_type: string; distance_meters: number | null; load_kg: number | null; rest_seconds: number | null; position: number }>(
        `select b.name, be.target_type, be.distance_meters, be.load_kg, be.rest_seconds, b.position
           from workout_templates t join workout_blocks b on b.template_id = t.id join block_exercises be on be.block_id = b.id
          where t.name = $1 order by b.position, be.position`,
        [name],
      );
      expect(rows.map((r) => r.name)).toEqual(["Running", "Sled Push", "Movilidad"]);
      expect(rows[1]).toMatchObject({ target_type: "distance", distance_meters: 50, load_kg: 152, rest_seconds: 120 });

      // Publicar.
      await page.getByRole("button", { name: "Publicar" }).click();
      await expect(page.getByText("Plantilla publicada")).toBeVisible();
      await expect(page.getByRole("button", { name: "Pasar a borrador" })).toBeVisible();

      // Una publicada debe seguir completa al editarla.
      await page.getByRole("link", { name: "Editar" }).click();
      await exercise(page, "Sled Push").getByRole("button", { name: "Quitar Sled Push" }).click();
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /no tiene ejercicios/ })).toBeVisible();
    } finally {
      await deleteTemplatesNamed(name);
    }
  });

  test("publicar un borrador incompleto muestra lo que falta", async ({ page }) => {
    const name = uniqueName("Borrador incompleto");
    try {
      await page.goto("/coach/entrenamientos/nueva");
      await field(page, "Nombre").fill(name);
      await page.getByRole("button", { name: "Guardar plantilla" }).click();
      await expect(page).toHaveURL(/\?guardado=1$/);
      await expect(page.getByText("Borrador: para publicarla falta")).toBeVisible();
      await page.getByRole("button", { name: "Publicar" }).click();
      const alert = page.getByRole("alert").filter({ hasText: "Aún no se puede publicar." });
      await expect(alert).toContainText("Indica la duración estimada.");
      await expect(alert).toContainText("no tiene ejercicios");
      // Sigue en borrador.
      await expect(page.getByRole("button", { name: "Publicar" })).toBeVisible();
    } finally {
      await deleteTemplatesNamed(name);
    }
  });

  test("duplicar, archivar y restaurar sin perder la original", async ({ page }) => {
    const name = uniqueName("Original");
    const id = await insertTemplate(readSeedIds().coachId, name, SYS.sledPush, "publicada");
    try {
      await page.goto(`/coach/entrenamientos/${id}`);
      await page.getByRole("button", { name: "Duplicar" }).click();
      await expect(page).toHaveURL(/\/editar\?copia=1$/);
      await expect(page.getByText(/Creamos una copia como borrador/)).toBeVisible();
      await expect(field(page, "Nombre")).toHaveValue(`${name} (copia)`);
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByRole("heading", { level: 1, name: `${name} (copia)` })).toBeVisible();
      await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();

      await page.goto(`/coach/entrenamientos/${id}`);
      await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Archivar" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Sí, archivar" }).click();
      await expect(page.getByText("Plantilla archivada")).toBeVisible();
      await expect(page.getByRole("button", { name: "Restaurar" })).toBeVisible();
      await page.goto(`/coach/entrenamientos/${id}/editar`);
      await expect(page.getByText("Esta plantilla no está entre tus entrenamientos")).toBeVisible();

      await page.goto("/coach/entrenamientos");
      await page.getByRole("tab", { name: /Archivadas/ }).click();
      await page.getByRole("tabpanel").getByRole("link", { name: new RegExp(name) }).click();
      await page.getByRole("button", { name: "Restaurar" }).click();
      await expect(page.getByText("Plantilla restaurada como borrador")).toBeVisible();
    } finally {
      await deleteTemplatesNamed(name);
    }
  });

  test("un ejercicio archivado sigue en la plantilla con aviso", async ({ page }) => {
    const exName = uniqueName("Ejercicio a archivar");
    const [ex] = await dbQuery<{ id: string }>(
      `insert into exercises (id, coach_id, name, category, difficulty, instructions, equipment)
       values (gen_random_uuid(), $1, $2, 'fuerza', 'intermedio', 'Instrucciones de prueba para E2E.', '{}') returning id`,
      [readSeedIds().coachId, exName],
    );
    const name = uniqueName("Con archivado");
    const id = await insertTemplate(readSeedIds().coachId, name, ex!.id);
    try {
      await dbQuery(`update exercises set archived_at = now() where id = $1`, [ex!.id]);
      await page.goto(`/coach/entrenamientos/${id}`);
      // getByRole ignora la copia oculta que deja el Suspense de ScreenStates.
      await expect(page.getByRole("status").filter({ hasText: /Usa un ejercicio archivado/ })).toBeVisible();
      await page.getByRole("link", { name: "Editar" }).click();
      await expect(page.getByText("Archivado: considera cambiarlo")).toBeVisible();
      // Se puede seguir guardando (no se agregan nuevos archivados, pero se conservan).
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Plantilla guardada.")).toBeVisible();
    } finally {
      await deleteTemplatesNamed(name);
      await dbQuery(`delete from exercises where id = $1`, [ex!.id]);
    }
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`detalle y edición son responsive en ${vp.width}px`, async ({ page }) => {
      const name = uniqueName(`Responsive ${vp.width}`);
      const id = await insertTemplate(readSeedIds().coachId, name, SYS.carrera);
      try {
        await page.setViewportSize(vp);
        for (const path of [`/coach/entrenamientos/${id}`, `/coach/entrenamientos/${id}/editar`]) {
          const errors = collectErrors(page);
          await page.goto(path, { waitUntil: "networkidle" });
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          expect(await horizontalOverflow(page), `${path} sin scroll horizontal`).toBeLessThanOrEqual(0);
          expect(await smallTargets(page), `${path} áreas táctiles ≥ 44 px`).toEqual([]);
          expect(errors, `${path} sin errores de consola`).toEqual([]);
          await page.screenshot({ path: `test-results/screens/${vp.width}/plantilla${path.endsWith("editar") ? "_editar" : ""}.png`, fullPage: true });
        }
      } finally {
        await deleteTemplatesNamed(name);
      }
    });
  }
});

test.describe("permisos e integridad de plantillas", () => {
  test("otro coach no ve, no edita ni usa ejercicios ajenos; borrar su cuenta funciona", async ({ browser }) => {
    const name = uniqueName("Privada");
    const id = await insertTemplate(readSeedIds().coachId, name, SYS.sledPush);
    const coach2 = await createCoach("Coach Ajeno");
    let coach2Deleted = false;
    try {
      const { ctx, page } = await loggedIn(browser, coach2);
      for (const path of [`/coach/entrenamientos/${id}`, `/coach/entrenamientos/${id}/editar`]) {
        await page.goto(path);
        await expect(page.getByText("Esta plantilla no está entre tus entrenamientos")).toBeVisible();
      }
      await page.goto("/coach/entrenamientos");
      await expect(page.getByText("Todavía no tienes plantillas")).toBeVisible();

      // Unidad en lb: el constructor captura en lb y guarda en kg.
      await dbQuery(`update coach_profiles set weight_unit = 'lb' where profile_id = $1`, [coach2.id]);
      await page.goto("/coach/entrenamientos/nueva");
      const lbName = uniqueName("Libras");
      await field(page, "Nombre").fill(lbName);
      await block(page, 1).getByLabel("Nombre del bloque").fill("Fuerza");
      await addExercise(page, "Fuerza", "Sled Push");
      await exercise(page, "Sled Push").getByLabel(/^Carga \(lb\)/).fill("100");
      await page.getByRole("button", { name: "Guardar plantilla" }).click();
      await expect(page.getByText(/× 10 reps · 100 lb/)).toBeVisible();
      const [row] = await dbQuery<{ load_kg: number }>(
        `select be.load_kg from block_exercises be join workout_blocks b on b.id = be.block_id join workout_templates t on t.id = b.template_id where t.name = $1`,
        [lbName],
      );
      expect(row?.load_kg).toBe(45.36);
      await ctx.close();

      // Integridad en la BD: una plantilla no puede usar ejercicios de otro coach.
      const [own] = await dbQuery<{ id: string }>(
        `insert into exercises (id, coach_id, name, category, difficulty, instructions, equipment)
         values (gen_random_uuid(), $1, 'E2E propio coach2', 'fuerza', 'intermedio', 'Instrucciones de prueba para E2E.', '{}') returning id`,
        [coach2.id],
      );
      const [blk] = await dbQuery<{ id: string }>(`select id from workout_blocks where template_id = $1`, [id]);
      await expect(
        dbQuery(`insert into block_exercises (id, block_id, exercise_id, position, sets, target_type, reps) values (gen_random_uuid(), $1, $2, 1, 3, 'reps', 10)`, [blk!.id, own!.id]),
      ).rejects.toThrow(/sistema o del mismo coach/);

      // Regresión: borrar la cuenta del coach con plantillas que usan sus ejercicios funciona.
      await insertTemplate(coach2.id, uniqueName("De coach2"), own!.id);
      await deleteUser(coach2.id);
      coach2Deleted = true;
      const [left] = await dbQuery<{ n: number }>(`select count(*)::int as n from exercises where coach_id = $1`, [coach2.id]);
      expect(left?.n).toBe(0);
    } finally {
      // Primero los datos propios de la prueba: si borrar el usuario falla, no quedan residuos.
      await deleteTemplatesNamed(name);
      if (!coach2Deleted) await deleteUser(coach2.id);
    }
  });

  test("sin sesión, el constructor y el detalle redirigen al login", async ({ page }) => {
    for (const path of ["/coach/entrenamientos/nueva", "/coach/entrenamientos/00000000-0000-4000-8000-000000000001"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});
