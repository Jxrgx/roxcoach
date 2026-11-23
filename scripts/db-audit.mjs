// Auditoría de SOLO LECTURA de la base de datos (fase 13). Úsala antes y
// después de cada despliegue: `npm run db:audit`.
//
// Verifica: RLS activo en todas las tablas de `public`, que anon/authenticated
// no tengan privilegios peligrosos, que ninguna función sea ejecutable por la
// API pública, que no haya migraciones pendientes, fallidas o alteradas tras
// aplicarse, y que los triggers de registro existan en auth.users.
//
// Usa DIRECT_URL (de .env.local o del entorno). Nunca imprime la cadena de
// conexión, correos ni datos: solo nombres de tablas, funciones y migraciones.
// Sale con código 1 si encuentra un problema.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DIRECT_URL) {
  console.error("Falta DIRECT_URL (ver .env.example).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
const problems = [];
const ok = [];

try {
  await client.connect();
  const q = async (sql) => (await client.query(sql)).rows;

  const noRls = await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
  );
  if (noRls.length) problems.push(`Tablas sin RLS: ${noRls.map((r) => r.relname).join(", ")}`);
  else ok.push("RLS activo en todas las tablas de public");

  const risky = await q(
    `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as p
     from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated')
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
     group by 1, 2 order by 1`,
  );
  if (risky.length) problems.push(`Privilegios peligrosos para la API pública: ${risky.map((r) => `${r.table_name}(${r.grantee}: ${r.p})`).join("; ")}`);
  else ok.push("anon/authenticated sin TRUNCATE, REFERENCES ni TRIGGER");

  const fnExec = await q(
    `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     order by 1`,
  );
  if (fnExec.length) problems.push(`Funciones ejecutables por la API pública: ${fnExec.map((r) => r.proname).join(", ")}`);
  else ok.push("Ninguna función de public es ejecutable por anon/authenticated");

  const secdef = await q(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not coalesce(array_to_string(p.proconfig, ';') like '%search_path=%', false)`,
  );
  if (secdef.length) problems.push(`SECURITY DEFINER sin search_path fijo: ${secdef.map((r) => r.proname).join(", ")}`);
  else ok.push("Funciones SECURITY DEFINER con search_path fijo");

  const authTriggers = await q(`select trigger_name from information_schema.triggers where event_object_schema = 'auth' and event_object_table = 'users'`);
  const names = new Set(authTriggers.map((t) => t.trigger_name));
  if (!names.has("on_auth_user_set_role")) problems.push("Falta el trigger on_auth_user_set_role en auth.users");
  else ok.push(`Triggers en auth.users: ${[...names].sort().join(", ")}`);

  const applied = await q(`select migration_name, checksum, finished_at, rolled_back_at from _prisma_migrations order by started_at`);
  const dir = join("prisma", "migrations");
  const local = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
  const unknown = applied.filter((m) => !local.includes(m.migration_name)).map((m) => m.migration_name);
  const altered = applied
    .filter((m) => local.includes(m.migration_name) && m.finished_at)
    .filter((m) => createHash("sha256").update(readFileSync(join(dir, m.migration_name, "migration.sql"))).digest("hex") !== m.checksum)
    .map((m) => m.migration_name);
  const pending = local.filter((n) => !applied.some((m) => m.migration_name === n));
  if (failed.length) problems.push(`Migraciones fallidas: ${failed.join(", ")}`);
  if (unknown.length) problems.push(`Migraciones aplicadas sin archivo local: ${unknown.join(", ")}`);
  if (altered.length) problems.push(`Migraciones modificadas después de aplicarse: ${altered.join(", ")}`);
  if (pending.length) problems.push(`Migraciones pendientes (ejecuta npm run db:migrate): ${pending.join(", ")}`);
  if (!failed.length && !unknown.length && !altered.length && !pending.length) ok.push(`Migraciones: ${applied.length} aplicadas, sin pendientes ni alteradas`);
} catch (error) {
  // Solo el tipo y el código: el mensaje de pg puede incluir el host.
  problems.push(`No se pudo auditar (${error?.code ?? error?.name ?? "error"}).`);
} finally {
  await client.end().catch(() => {});
}

for (const line of ok) console.log(`✓ ${line}`);
for (const line of problems) console.log(`✗ ${line}`);
process.exit(problems.length ? 1 : 0);
