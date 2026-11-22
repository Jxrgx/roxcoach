import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { e2eEnv, loginViaUi } from "./helpers";

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

test.describe("registro y confirmación de correo", () => {
  test("un registro nuevo crea el perfil con su rol y el enlace de confirmación inicia sesión", async ({ page }) => {
    const email = `registro.e2e+${Date.now()}@example.com`;
    // generateLink crea el usuario sin confirmar (como signUp) y devuelve el
    // token SIN enviar correo: evita el límite del SMTP integrado.
    const { data, error } = await admin().auth.admin.generateLink({
      type: "signup",
      email,
      password: `Registro-${Date.now()}`,
      options: { data: { name: "Coach Registro", role: "coach" } },
    });
    expect(error).toBeNull();
    const userId = data.user?.id;
    try {
      expect(data.user?.app_metadata?.role, "el trigger fija el rol en app_metadata").toBe("coach");
      expect(data.user?.email_confirmed_at ?? null, "aún sin confirmar").toBeNull();

      // Sin confirmar no puede entrar al área protegida.
      await page.goto("/coach/inicio");
      await expect(page).toHaveURL(/\/login\?next=/);

      const token = data.properties?.hashed_token;
      expect(token).toBeTruthy();
      await page.goto(`/auth/confirm?token_hash=${token}&type=signup`);
      await expect(page).toHaveURL(/\/coach\/inicio$/);
      await expect(page.getByRole("heading", { level: 1, name: "Hola, Coach" })).toBeVisible();

      // Un enlace ya usado no vuelve a servir.
      await page.context().clearCookies();
      await page.goto(`/auth/confirm?token_hash=${token}&type=signup`);
      await expect(page).toHaveURL(/\/login\?error=confirmacion$/);
      await expect(page.getByRole("alert").filter({ hasText: "No pudimos iniciar tu sesión con ese enlace" })).toBeVisible();
    } finally {
      if (userId) await admin().auth.admin.deleteUser(userId);
    }
  });

  test("un enlace de confirmación inválido muestra un error claro", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=invalido&type=signup");
    await expect(page).toHaveURL(/\/login\?error=confirmacion$/);
    await expect(page.getByRole("alert").filter({ hasText: "Si ya confirmaste tu correo" })).toBeVisible();
  });
});

test.describe("redirecciones abiertas", () => {
  for (const next of ["https://evil.example/robar", "//evil.example", "/\\evil.example", "/atleta/inicio"]) {
    test(`login con next=${next} se queda en RoxCoach`, async ({ page }) => {
      const env = e2eEnv();
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel("Correo").fill(env.coachEmail);
      await page.getByLabel("Contraseña").fill(env.coachPassword);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await expect(page).toHaveURL(/^http:\/\/localhost:3100\/coach\/inicio$/);
    });
  }
});

test.describe("RLS por la API pública", () => {
  test("nadie puede leer perfiles ajenos ni cambiar su rol con la publishable key", async ({ page }) => {
    const env = e2eEnv();
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    // Anónimo: no ve perfiles.
    const anon = createClient(env.supabaseUrl, publishableKey, { auth: { persistSession: false } });
    const anonRead = await anon.from("profiles").select("id, role");
    expect(anonRead.data ?? []).toHaveLength(0);

    // Atleta autenticado: no puede escalar a coach.
    const athlete = createClient(env.supabaseUrl, publishableKey, { auth: { persistSession: false } });
    const { error: signInError } = await athlete.auth.signInWithPassword({ email: env.athleteEmail, password: env.athletePassword });
    expect(signInError).toBeNull();
    const others = await athlete.from("profiles").select("id").neq("role", "athlete");
    expect(others.data ?? []).toHaveLength(0);
    const escalate = await athlete.from("profiles").update({ role: "coach" }).eq("role", "athlete").select("id");
    expect(escalate.data ?? []).toHaveLength(0);
    const metadata = await athlete.auth.updateUser({ data: { role: "coach" } });
    expect(metadata.data.user?.app_metadata?.role, "user_metadata no altera el rol").toBe("athlete");
    await athlete.auth.signOut({ scope: "local" });

    // Y en la app sigue siendo atleta.
    await loginViaUi(page, env.athleteEmail, env.athletePassword);
    await expect(page).toHaveURL(/\/atleta\/inicio$/);
    await page.goto("/coach/inicio");
    await expect(page).toHaveURL(/\/atleta\/inicio$/);

    // Limpieza: restablece el user_metadata del atleta de prueba.
    const { data: list } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = list.users.find((u) => u.email?.toLowerCase() === env.athleteEmail.toLowerCase());
    if (user) await admin().auth.admin.updateUserById(user.id, { user_metadata: { name: "Atleta Pruebas", role: "athlete" } });
  });
});
