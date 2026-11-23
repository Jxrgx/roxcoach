import { expect, test } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { COACH_STATE, ATHLETE_STATE, collectErrors, dbQuery, e2eEnv, loginViaUi, readSeedIds } from "./helpers";
import { deleteExactIds } from "./cleanup";

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
  // `/\t/…` y `/\n/…`: el parser de URL elimina tabuladores y saltos de línea, y quedaría `//evil.example`.
  for (const next of ["https://evil.example/robar", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/atleta/inicio"]) {
    test(`login con next=${JSON.stringify(next)} se queda en RoxCoach`, async ({ page }) => {
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

/* ---------- Fase 13: producción y endurecimiento ---------- */

const BASE_URL = "http://localhost:3100";

test.describe("enlace de confirmación con token_hash (plantilla recomendada)", () => {
  async function signupToken(role: "coach" | "athlete") {
    const email = `confirmar.e2e+${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
    // generateLink no envía correo: devuelve el token que iría en la plantilla.
    const { data, error } = await admin().auth.admin.generateLink({
      type: "signup",
      email,
      password: `Confirmar-${Date.now()}`,
      options: { data: { name: "Confirmación Prueba", role } },
    });
    expect(error).toBeNull();
    return { userId: data.user!.id, token: data.properties!.hashed_token };
  }

  test("type=email + next={{ .RedirectTo }} anidado regresa a la ruta interna", async ({ page }) => {
    const { userId, token } = await signupToken("coach");
    try {
      // Lo que produce la plantilla: next = emailRedirectTo = <APP_URL>/auth/confirm?next=<ruta>
      const redirectTo = `${BASE_URL}/auth/confirm?next=${encodeURIComponent("/coach/atletas")}`;
      await page.goto(`/auth/confirm?token_hash=${token}&type=email&next=${encodeURIComponent(redirectTo)}`);
      await expect(page).toHaveURL(`${BASE_URL}/coach/atletas`);
    } finally {
      await admin().auth.admin.deleteUser(userId);
    }
  });

  test("un next hacia otro dominio se ignora y lleva al inicio del rol", async ({ page }) => {
    const { userId, token } = await signupToken("athlete");
    try {
      const evil = `https://evil.example/auth/confirm?next=${encodeURIComponent("/atleta/progreso")}`;
      await page.goto(`/auth/confirm?token_hash=${token}&type=email&next=${encodeURIComponent(evil)}`);
      await expect(page).toHaveURL(`${BASE_URL}/atleta/inicio`);
    } finally {
      await admin().auth.admin.deleteUser(userId);
    }
  });

  test("tipos de enlace no admitidos se rechazan", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=cualquiera&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=confirmacion$/);
  });
});

test.describe("cabeceras de seguridad", () => {
  for (const path of ["/login", "/sw.js", "/manifest.webmanifest", "/offline/ejecucion", "/api/health"]) {
    test(`${path} envía las cabeceras de seguridad`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const h = res.headers();
      expect(h["content-security-policy"]).toMatch(/default-src 'self'/);
      expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"]).toMatch(/camera=\(\)/);
      expect(h["x-frame-options"]).toBe("DENY");
      // HSTS solo con https: aquí es http://localhost.
      expect(h["strict-transport-security"]).toBeUndefined();
      expect(h["x-powered-by"]).toBeUndefined();
    });
  }

  test("el service worker se revalida siempre", async ({ request }) => {
    expect((await request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");
  });

  test("health check: responde ok, sin caché, sin cookies ni datos de configuración", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers()["cache-control"]).toMatch(/no-store/);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("la CSP no rompe la app", () => {
  const pages: { state?: string; paths: string[] }[] = [
    { paths: ["/login", "/registro", "/sin-conexion", "/offline/ejecucion"] },
    { state: COACH_STATE, paths: ["/coach/inicio", "/coach/biblioteca", "/coach/sesiones/nueva"] },
    { state: ATHLETE_STATE, paths: ["/atleta/inicio", "/atleta/progreso"] },
  ];
  for (const group of pages) {
    test.describe(() => {
      if (group.state) test.use({ storageState: group.state });
      for (const path of group.paths) {
        test(`${path} sin violaciones de CSP ni errores de consola`, async ({ page }) => {
          const errors = collectErrors(page);
          const violations: string[] = [];
          await page.addInitScript(() => {
            document.addEventListener("securitypolicyviolation", (e) => {
              (window as unknown as { __csp: string[] }).__csp ??= [];
              (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
            });
          });
          await page.goto(path, { waitUntil: "networkidle" });
          await expect(page.getByRole("heading").filter({ visible: true }).first()).toBeVisible();
          violations.push(...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])));
          expect(violations).toEqual([]);
          expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
          // El service worker se registra con la CSP activa (worker-src 'self').
          const sw = await page.evaluate(async () => {
            if (!("serviceWorker" in navigator)) return "sin soporte";
            const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 10_000))]);
            return reg ? "ok" : "sin registro";
          });
          expect(sw).toBe("ok");
        });
      }
    });
  }
});

/** Valores secretos del entorno de pruebas (nunca se imprimen: solo se comparan). */
function secretValues(): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const name of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_SECRET_KEY", "E2E_COACH_PASSWORD", "E2E_ATHLETE_PASSWORD", "E2E_PASSWORD"]) {
    const value = process.env[name];
    if (value && value.length >= 8) out.push({ name, value });
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    try {
      const password = decodeURIComponent(new URL(process.env[name] ?? "").password);
      if (password.length >= 8) out.push({ name: `${name} (contraseña)`, value: password });
    } catch {
      /* sin URL */
    }
  }
  return out;
}

test.describe("ningún secreto se expone", () => {
  test.use({ storageState: COACH_STATE });

  test("ni en el HTML ni en los chunks de JavaScript", async ({ page, request }) => {
    const secrets = secretValues();
    expect(secrets.length, "el entorno de pruebas tiene secretos para comparar").toBeGreaterThan(2);
    const scripts = new Set<string>();
    const bodies: { url: string; text: string }[] = [];
    for (const path of ["/login", "/coach/inicio", "/coach/atletas", "/offline/ejecucion"]) {
      const res = await page.goto(path, { waitUntil: "networkidle" });
      bodies.push({ url: path, text: (await res?.text()) ?? "" });
      for (const src of await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))) scripts.add(src);
    }
    bodies.push({ url: "/sw.js", text: await (await request.get("/sw.js")).text() });
    bodies.push({ url: "/sw-rules.js", text: await (await request.get("/sw-rules.js")).text() });
    for (const src of scripts) bodies.push({ url: new URL(src).pathname, text: await (await request.get(src)).text() });
    expect(scripts.size).toBeGreaterThan(3);
    for (const body of bodies) {
      for (const s of secrets) expect(body.text.includes(s.value), `${s.name} aparece en ${body.url}`).toBe(false);
      expect(body.text, `${body.url} no menciona variables de servidor`).not.toMatch(/SUPABASE_SECRET_KEY|DIRECT_URL|DATABASE_URL/);
    }
  });

  test("las páginas de error no muestran stack, SQL ni rutas del servidor", async ({ request }) => {
    for (const path of ["/coach/sesiones/no-es-un-id", "/coach/biblioteca/00000000-0000-4000-8000-000000000000", "/ruta-que-no-existe"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBeLessThan(500);
      const text = await res.text();
      // Rutas del servidor: el directorio del proyecto, nunca un patrón corto (el payload RSC tiene `1c:\"`).
      const leak = /\n\s+at |prisma|postgres|SELECT |node_modules|\\dev\\RoxCoach|\/srv\//i.exec(text);
      expect(leak ? text.slice(Math.max(0, leak.index - 40), leak.index + 40) : null, path).toBeNull();
    }
    // Una Server Action inexistente tampoco filtra detalles.
    const action = await request.post("/login", { headers: { "Next-Action": "0".repeat(42), "Content-Type": "text/plain" }, data: "[]" });
    expect(action.status()).toBeGreaterThanOrEqual(400);
    expect(await action.text()).not.toMatch(/\n\s+at |node_modules|prisma|postgres/i);
  });
});

test.describe("inyección de cabecera Host", () => {
  test.use({ storageState: COACH_STATE });

  test("el enlace de invitación usa APP_URL aunque la petición diga otro host", async ({ page }) => {
    const email = `host.e2e.${Date.now()}@example.com`;
    const forged = `host2.e2e.${Date.now()}@example.com`;
    // Se captura la Server Action real (id y cuerpo) para repetirla después fuera del navegador.
    let action: { headers: Record<string, string>; body: string } | null = null;
    await page.route("**/coach/atletas", async (route) => {
      const headers = route.request().headers();
      if (headers["next-action"] && !action) action = { headers, body: route.request().postData() ?? "" };
      await route.continue();
    });
    try {
      await page.goto("/coach/atletas", { waitUntil: "networkidle" });
      await page.getByRole("main").getByRole("button", { name: "Invitar atleta" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Invitar atleta" });
      await dialog.getByLabel("Correo del atleta").fill(email);
      await dialog.getByRole("button", { name: "Crear invitación" }).click();
      const ready = page.getByRole("dialog", { name: "Invitación lista" });
      await expect(ready).toBeVisible();
      expect(await ready.getByLabel("Enlace de invitación").inputValue()).toMatch(new RegExp(`^${BASE_URL}/invitacion/`));
      expect(action, "se capturó la Server Action").not.toBeNull();
      const captured = action!;

      // 1) Desde un navegador, un Host distinto al Origin lo rechaza Next (CSRF de Server Actions).
      const mismatched = await page.request.post("/coach/atletas", {
        headers: { ...captured.headers, "x-forwarded-host": "evil.example" },
        data: captured.body.replace(email, forged),
      });
      expect(await mismatched.text()).not.toMatch(/evil\.example\/invitacion/);

      // 2) Petición fabricada con Origin y Host falsos COHERENTES: pasa el CSRF, pero el
      //    enlace sigue saliendo de APP_URL (nunca de las cabeceras).
      const res = await page.request.post("/coach/atletas", {
        headers: { ...captured.headers, origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
        data: captured.body.replace(email, forged),
      });
      const text = await res.text();
      expect(text).not.toMatch(/evil\.example/);
      expect(text).toMatch(new RegExp(`${BASE_URL.replace(/[/.:]/g, "\\$&")}/invitacion/`));
    } finally {
      // Solo las invitaciones de ESTA prueba: correos únicos generados aquí, del coach compartido, borradas por id exacto.
      const own = await dbQuery<{ id: string }>(`select id from invitations where coach_id = $1 and email = any($2::text[])`, [readSeedIds().coachId, [email, forged]]);
      await deleteExactIds("invitations", own.map((r) => r.id));
    }
  });
});
