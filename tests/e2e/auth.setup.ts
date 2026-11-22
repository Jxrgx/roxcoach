import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { AUTH_DIR, ATHLETE_STATE, COACH_STATE, SEED_IDS, dbQuery, e2eEnv, findUserId, loginViaUi, type E2EEnv } from "./helpers";

/**
 * Prepara las sesiones de prueba:
 * 1. Crea (o actualiza) los usuarios de prueba con la secret key del
 *    proyecto de DESARROLLO. El trigger de registro crea sus perfiles.
 * 2. Inicia sesión por la interfaz real y guarda las cookies.
 */
function adminClient(env: E2EEnv) {
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function ensureUser(env: E2EEnv, email: string, password: string, role: "coach" | "athlete", name: string) {
  const admin = adminClient(env);
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (!error) return;
  if (error.code !== "email_exists") throw error;

  // Ya existe: asegura contraseña y confirmación (el rol no cambia).
  const { data, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No se encontró el usuario de prueba ${email}.`);
  if (user.app_metadata?.role !== role) {
    throw new Error(`El usuario de prueba ${email} tiene rol "${String(user.app_metadata?.role)}", se esperaba "${role}".`);
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (updateError) throw updateError;
}

// En serie: el vínculo coach–atleta necesita que ambos usuarios existan.
setup.describe.configure({ mode: "serial" });

setup.beforeAll(() => {
  mkdirSync(AUTH_DIR, { recursive: true });
});

setup("sesión de coach", async ({ page }) => {
  const env = e2eEnv();
  await ensureUser(env, env.coachEmail, env.coachPassword, "coach", "Coach Pruebas");
  await loginViaUi(page, env.coachEmail, env.coachPassword);
  await expect(page).toHaveURL(/\/coach\/inicio$/);
  await page.context().storageState({ path: COACH_STATE });
});

setup("sesión de atleta", async ({ page }) => {
  const env = e2eEnv();
  await ensureUser(env, env.athleteEmail, env.athletePassword, "athlete", "Atleta Pruebas");
  await loginViaUi(page, env.athleteEmail, env.athletePassword);
  await expect(page).toHaveURL(/\/atleta\/inicio$/);
  await page.context().storageState({ path: ATHLETE_STATE });
});

setup("vincular coach y atleta de prueba", async () => {
  const env = e2eEnv();
  const admin = adminClient(env);
  const coachId = await findUserId(admin, env.coachEmail);
  const athleteId = await findUserId(admin, env.athleteEmail);
  // Datos de prueba: relación ACTIVA entre los usuarios compartidos (idempotente;
  // restablece el estado aunque una corrida anterior la haya dejado en pausa).
  await dbQuery(
    `insert into coach_athletes (id, coach_id, athlete_id, status, joined_at)
     values (gen_random_uuid(), $1, $2, 'active', now())
     on conflict (coach_id, athlete_id)
     do update set status = 'active', paused_at = null, removed_at = null`,
    [coachId, athleteId],
  );
  writeFileSync(SEED_IDS, JSON.stringify({ coachId, athleteId }));
});
