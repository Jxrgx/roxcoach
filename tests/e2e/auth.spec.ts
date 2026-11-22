import { expect, test } from "@playwright/test";
import { ATHLETE_STATE, COACH_STATE, e2eEnv, loginViaUi } from "./helpers";

test.describe("sin sesión", () => {
  test("las áreas protegidas redirigen al login conservando la ruta", async ({ page }) => {
    await page.goto("/coach/atletas");
    await expect(page).toHaveURL(/\/login\?next=%2Fcoach%2Fatletas$/);
    await page.goto("/atleta/perfil");
    await expect(page).toHaveURL(/\/login\?next=%2Fatleta%2Fperfil$/);
  });

  test("login con credenciales incorrectas muestra un error claro", async ({ page }) => {
    const env = e2eEnv();
    await loginViaUi(page, env.coachEmail, `${env.coachPassword}-incorrecta`);
    // Filtra por texto: Next también expone un anunciador de rutas con role="alert".
    await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // El correo capturado no se borra.
    await expect(page.getByLabel("Correo")).toHaveValue(env.coachEmail);
  });

  test("login respeta ?next dentro del área del rol", async ({ page }) => {
    const env = e2eEnv();
    await page.goto("/coach/configuracion");
    await expect(page).toHaveURL(/next=/);
    await page.getByLabel("Correo").fill(env.coachEmail);
    await page.getByLabel("Contraseña").fill(env.coachPassword);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/coach\/configuracion$/);
  });

  test("el registro valida en cliente antes de enviar", async ({ page }) => {
    await page.goto("/registro");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Elige si eres coach o atleta.")).toBeVisible();
    await expect(page.getByText("Escribe tu nombre.")).toBeVisible();
    await expect(page.getByText("Ingresa tu correo.")).toBeVisible();
  });
});

test.describe("coach", () => {
  test.use({ storageState: COACH_STATE });

  test("no puede entrar al área del atleta", async ({ page }) => {
    await page.goto("/atleta/inicio");
    await expect(page).toHaveURL(/\/coach\/inicio$/);
  });

  test("con sesión, /login lo lleva a su inicio", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/coach\/inicio$/);
  });

  test("ve su nombre real y guarda su configuración", async ({ page }) => {
    await page.goto("/coach/configuracion");
    const name = page.getByLabel("Nombre", { exact: true });
    await expect(name).toHaveValue(/.+/);
    const original = await name.inputValue();

    await page.getByLabel("Nombre del gimnasio").fill("Pista Central E2E");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nombre del gimnasio")).toHaveValue("Pista Central E2E");
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(original);
  });
});

test.describe("atleta", () => {
  test.use({ storageState: ATHLETE_STATE });

  test("no puede entrar al área del coach", async ({ page }) => {
    await page.goto("/coach/inicio");
    await expect(page).toHaveURL(/\/atleta\/inicio$/);
  });

  test("guarda su perfil y la cuenta regresiva lo refleja", async ({ page }) => {
    await page.goto("/atleta/perfil");
    await page.getByLabel("División HYROX").selectOption("Pro Men");
    await page.getByLabel(/Fecha de competencia/).fill("2030-01-01");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Perfil actualizado")).toBeVisible();

    await page.goto("/atleta/inicio");
    await expect(page.getByText(/Faltan .* para tu carrera/)).toBeVisible();
  });
});

test.describe("cerrar sesión", () => {
  test("cierra la sesión y protege de nuevo las rutas", async ({ page }) => {
    // Sesión propia para no invalidar la compartida por las demás pruebas.
    const env = e2eEnv();
    await loginViaUi(page, env.athleteEmail, env.athletePassword);
    await expect(page).toHaveURL(/\/atleta\/inicio$/);
    await page.goto("/atleta/perfil");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/atleta/inicio");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
