import { expect, test, type Page } from "@playwright/test";
import { ATHLETE_STATE, COACH_STATE } from "./helpers";

/** Sesión con la que se visita cada ruta (las áreas están protegidas por rol). */
function stateFor(route: string): string | undefined {
  if (route.startsWith("/coach")) return COACH_STATE;
  if (route.startsWith("/atleta")) return ATHLETE_STATE;
  return undefined;
}

const ROUTES = [
  "/",
  "/login",
  "/registro",
  "/coach/inicio",
  "/coach/calendario",
  "/coach/atletas",
  "/coach/biblioteca",
  "/coach/entrenamientos",
  "/coach/progreso",
  "/coach/mensajes",
  "/coach/configuracion",
  "/atleta/inicio",
  "/atleta/agenda",
  "/atleta/sesiones",
  "/atleta/progreso",
  "/atleta/perfil",
  "/componentes",
];

const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Elementos interactivos visibles con área táctil menor a 44 × 44 px. */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("a[href], button, [role=tab], summary, select, input:not([type=radio]):not([type=checkbox])").forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") return;
      if (el.closest(".sr-only") || el.classList.contains("sr-only")) return;
      if (el.closest("dialog:not([open])")) return;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return out;
  });
}

/** Textos de navegación cortados con elipsis. */
async function truncatedNavLabels(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("nav .truncate"))
      .filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent ?? ""),
  );
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test.describe(() => {
        test.use({ storageState: stateFor(route) });
        test(`${route}`, async ({ page }) => {
        const errors = collectErrors(page);
        const res = await page.goto(route, { waitUntil: "networkidle" });
        expect(res?.status(), "la ruta responde").toBeLessThan(400);

        await expect(page.locator("h1").first()).toBeVisible();

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "sin scroll horizontal").toBeLessThanOrEqual(0);

        expect(await truncatedNavLabels(page), "etiquetas de navegación completas").toEqual([]);
        expect(await smallTargets(page), "áreas táctiles ≥ 44 px").toEqual([]);

        await page.screenshot({
          path: `test-results/screens/${vp.name}/${route === "/" ? "home" : route.slice(1).replaceAll("/", "_")}.png`,
          fullPage: true,
        });
        expect(errors, "sin errores de consola").toEqual([]);
        });
      });
    }
  });
}

test.describe("estados de pantalla (360px)", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  const DATA_ROUTES = ROUTES.filter((r) => r.startsWith("/coach/") || r.startsWith("/atleta/"));
  const STATES: Array<[string, RegExp]> = [
    ["cargando", /Cargando/],
    ["vacio", /./],
    ["error", /No pudimos cargar/],
    ["sin-conexion", /Sin conexión/],
    ["sin-permisos", /No tienes acceso/],
  ];

  for (const route of DATA_ROUTES) {
    test.describe(() => {
      test.use({ storageState: stateFor(route) });
      test(`${route} muestra todos los estados`, async ({ page }) => {
      const errors = collectErrors(page);
      for (const [state, text] of STATES) {
        await page.goto(`${route}?estado=${state}`, { waitUntil: "networkidle" });
        const region = page.locator("main [role=status], main [role=alert]").filter({ hasText: text }).first();
        await expect(region, `estado ${state}`).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      }
      expect(errors).toEqual([]);
      });
    });
  }
});

test.describe("diálogos en mobile (360px)", () => {
  test.use({ viewport: { width: 360, height: 780 }, storageState: COACH_STATE });

  test("Nueva sesión: valida, guarda y confirma", async ({ page }) => {
    await page.goto("/coach/inicio", { waitUntil: "networkidle" });
    await page.getByRole("main").getByRole("button", { name: "Nueva sesión" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nueva sesión" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 360).toBeTruthy();

    await dialog.getByRole("button", { name: "Crear sesión" }).click();
    await expect(dialog.getByText("Dale un nombre a la sesión")).toBeVisible();

    await dialog.getByLabel("Nombre de la sesión").fill("Engine + Sled Push");
    await dialog.getByLabel("Plantilla").selectOption("tpl-engine-sled");
    await dialog.getByLabel("Fecha").fill("2026-12-01");
    await dialog.getByRole("button", { name: "Crear sesión" }).click();
    await expect(page.getByText("Sesión creada")).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test("Más secciones abre un bottom sheet navegable", async ({ page }) => {
    await page.goto("/coach/inicio", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog", { name: "Más secciones" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Biblioteca" }).click();
    await expect(page).toHaveURL(/\/coach\/biblioteca$/);
    await expect(page.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeVisible();
    await expect(sheet).toBeHidden();
  });

  test("Eliminar cuenta pide confirmación", async ({ page }) => {
    await page.goto("/coach/configuracion", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Eliminar cuenta" }).click();
    const confirm = page.getByRole("dialog", { name: "¿Eliminar tu cuenta?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirm).toBeHidden();
  });

  test("Escape cierra el modal y devuelve el foco", async ({ page }) => {
    await page.goto("/coach/atletas", { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Agregar atleta" }).first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
