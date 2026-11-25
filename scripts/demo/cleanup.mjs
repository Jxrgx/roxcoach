// Limpieza del dataset demo. Uso:
//   npm run demo:cleanup -- --confirm ROXCOACH_DEMO_<timestamp> [--accept-changes]
//
// - Requiere la etiqueta EXACTA del manifiesto (.demo/roxcoach-demo.json).
// - Borra solo ids exactos: los del manifiesto y los que dependen de ellos (p. ej.
//   series que un atleta demo registró al usar la demo). Nunca por nombre, correo,
//   fecha ni patrón.
// - Verifica dueños (coach del manifiesto), etiqueta de los atletas (user_metadata.demo_tag)
//   y cantidades. Ante cualquier diferencia ABORTA, salvo con --accept-changes, que
//   solo admite diferencias dentro del dataset (filas creadas al usar la demo o ids
//   que ya no existen); nunca admite tocar datos ajenos.
// - Todo en UNA transacción: si un paso afecta más o menos filas de las esperadas,
//   se revierte completo.
// - Nunca borra al coach, a los usuarios compartidos de las e2e ni datos históricos.

import { existsSync, readFileSync, renameSync } from "node:fs";
import { assertTargetProject, fail, findCoach, loadEnv, MANIFEST_DIR, MANIFEST_PATH, pgClient, readManifest, writeManifest } from "./common.mjs";

loadEnv();
assertTargetProject();
const args = process.argv.slice(2);
const confirm = args[args.indexOf("--confirm") + 1];
const acceptChanges = args.includes("--accept-changes");
const manifest = readManifest();
if (!manifest) fail("No hay dataset demo (falta .demo/roxcoach-demo.json).");
if (!args.includes("--confirm") || confirm !== manifest.tag) fail(`Confirma con la etiqueta exacta: npm run demo:cleanup -- --confirm ${manifest.tag}`);

const shared = existsSync("tests/e2e/.auth/ids.json") ? Object.values(JSON.parse(readFileSync("tests/e2e/.auth/ids.json", "utf8"))) : [];
const client = pgClient();
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const ids = (rows) => rows.map((r) => r.id);
const diff = (expected, found) => ({ missing: expected.filter((x) => !found.includes(x)), extra: found.filter((x) => !expected.includes(x)) });
const report = [];
const discrepancies = [];
const note = (label, expected, found) => {
  const d = diff(expected, found);
  if (d.missing.length || d.extra.length) discrepancies.push(`${label}: ${d.missing.length} del manifiesto ya no existen, ${d.extra.length} creadas al usar la demo`);
};

try {
  const coach = await findCoach(client);
  if (coach.id !== manifest.coach.id) fail("El coach actual no coincide con el del manifiesto. Se detiene.");
  const athleteIds = manifest.athletes.map((a) => a.id);
  if (athleteIds.includes(coach.id) || athleteIds.some((id) => shared.includes(id))) fail("El manifiesto incluye al coach o a un usuario compartido. Se detiene.");

  await client.query("begin");
  // Atletas: deben tener EXACTAMENTE la etiqueta del dataset.
  const tagged = ids(await q(`select id from auth.users where id = any($1) and raw_user_meta_data->>'demo_tag' = $2 for update`, [athleteIds, manifest.tag]));
  const untagged = await q(`select count(*)::int n from auth.users where id = any($1) and coalesce(raw_user_meta_data->>'demo_tag', '') <> $2`, [athleteIds, manifest.tag]);
  if (untagged[0].n > 0) throw new Error("Un usuario del manifiesto no tiene la etiqueta del dataset. Se detiene.");
  note("atletas", athleteIds, tagged);

  // Relaciones de los atletas demo con OTROS coaches: nunca deberían existir.
  const foreignRel = await q(`select count(*)::int n from coach_athletes where athlete_id = any($1) and coach_id <> $2`, [tagged, coach.id]);
  if (foreignRel[0].n > 0) throw new Error("Un atleta demo tiene relación con otro coach. Se detiene sin borrar.");

  // Conjunto exacto a borrar (todo acotado al coach del manifiesto).
  const sessions = ids(await q(`select id from scheduled_sessions where id = any($1) and coach_id = $2`, [manifest.sessions, coach.id]));
  note("sesiones", manifest.sessions, sessions);
  // Asignaciones: las de sesiones demo y las de atletas demo en sesiones del coach.
  const assignments = ids(
    await q(`select a.id from assignments a join scheduled_sessions s on s.id = a.session_id where s.coach_id = $3 and (a.session_id = any($1) or a.athlete_id = any($2))`, [sessions, tagged, coach.id]),
  );
  note("asignaciones", manifest.assignments, assignments);
  const outside = await q(`select count(*)::int n from assignments where athlete_id = any($1) and not (id = any($2))`, [tagged, assignments]);
  if (outside[0].n > 0) throw new Error("Hay asignaciones de atletas demo fuera de las sesiones del coach. Se detiene.");
  const overrides = ids(await q(`select id from assignment_overrides where assignment_id = any($1)`, [assignments]));
  note("personalizaciones", manifest.overrides, overrides);
  const logs = ids(await q(`select id from session_logs where assignment_id = any($1)`, [assignments]));
  note("ejecuciones", manifest.sessionLogs, logs);
  const sets = ids(await q(`select id from set_logs where session_log_id = any($1)`, [logs]));
  note("series", manifest.setLogs, sets);
  const discomforts = ids(await q(`select id from discomfort_reports where session_log_id = any($1)`, [logs]));
  note("molestias", manifest.discomforts, discomforts);
  // execution_ops usa op_id como llave (no id).
  const ops = ids(await q(`select op_id as id from execution_ops where session_log_id = any($1)`, [logs]));
  const invitations = ids(await q(`select id from invitations where id = any($1) and coach_id = $2`, [manifest.invitations, coach.id]));
  note("invitaciones", manifest.invitations, invitations);
  const relations = ids(await q(`select id from coach_athletes where coach_id = $1 and athlete_id = any($2)`, [coach.id, tagged]));
  note("relaciones", manifest.relations, relations);
  const templates = ids(await q(`select id from workout_templates where id = any($1) and coach_id = $2`, [manifest.templates, coach.id]));
  note("plantillas", manifest.templates, templates);
  // Mensajes del coach con los atletas demo (los del manifiesto y los escritos al usar la demo).
  const messages = ids(await q(`select id from messages where coach_id = $1 and athlete_id = any($2)`, [coach.id, tagged]));
  note("mensajes", manifest.messages ?? [], messages);
  const sources = [...invitations, ...assignments, ...logs, ...discomforts];
  const alerts = ids(await q(`select id from coach_alerts where coach_id = $1 and (athlete_id = any($2) or source_id = any($3))`, [coach.id, tagged, sources]));
  const foreignAlerts = await q(`select count(*)::int n from coach_alerts where coach_id <> $1 and (athlete_id = any($2) or source_id = any($3))`, [coach.id, tagged, sources]);
  if (foreignAlerts[0].n > 0) throw new Error("Hay avisos del dataset en otro coach. Se detiene.");

  if (discrepancies.length && !acceptChanges) {
    throw new Error(`Diferencias con el manifiesto:\n  - ${discrepancies.join("\n  - ")}\nRevísalas (npm run demo:status). Si son del uso de la demo, repite con --accept-changes.`);
  }

  // Borrado en orden, cada paso con su cantidad exacta.
  const del = async (label, table, list, key = "id") => {
    if (list.length === 0) return report.push(`${label}: 0`);
    const res = await client.query(`delete from ${table} where ${key} = any($1)`, [list]);
    if (res.rowCount !== list.length) throw new Error(`${label}: se esperaban ${list.length} filas y se afectaron ${res.rowCount}. Se revierte.`);
    report.push(`${label}: ${res.rowCount}`);
  };
  await del("operaciones offline", "execution_ops", ops, "op_id");
  await del("series", "set_logs", sets);
  await del("molestias", "discomfort_reports", discomforts);
  await del("ejecuciones", "session_logs", logs);
  await del("avisos", "coach_alerts", alerts);
  await del("personalizaciones", "assignment_overrides", overrides);
  await del("asignaciones", "assignments", assignments);
  await del("sesiones", "scheduled_sessions", sessions);
  await del("invitaciones", "invitations", invitations);
  await del("mensajes", "messages", messages);
  await del("relaciones", "coach_athletes", relations);
  await del("plantillas (con bloques y ejercicios)", "workout_templates", templates);
  // Usuarios Auth demo: por id y etiqueta exacta (cascada: perfil y perfil de atleta).
  const users = await client.query(`delete from auth.users where id = any($1) and raw_user_meta_data->>'demo_tag' = $2`, [tagged, manifest.tag]);
  if (users.rowCount !== tagged.length) throw new Error(`usuarios: se esperaban ${tagged.length} y se afectaron ${users.rowCount}. Se revierte.`);
  report.push(`usuarios Auth demo: ${users.rowCount}`);

  // El coach y los compartidos siguen intactos.
  const intact = await q(`select count(*)::int n from profiles where id = any($1)`, [[coach.id, ...shared]]);
  if (intact[0].n !== 1 + shared.length) throw new Error("El coach o un usuario compartido no quedó intacto. Se revierte.");

  await client.query("commit");
  manifest.status = "eliminado";
  manifest.cleanedAt = new Date().toISOString();
  manifest.cleanupReport = report;
  writeManifest(manifest);
  renameSync(MANIFEST_PATH, `${MANIFEST_DIR}/roxcoach-demo.${manifest.tag}.eliminado.json`);
  console.log(`✓ Dataset ${manifest.tag} eliminado.`);
  for (const line of report) console.log(`  ${line}`);
  if (discrepancies.length) console.log(`  (aceptadas: ${discrepancies.join("; ")})`);
  console.log("  El coach, los usuarios compartidos y los datos históricos no se tocaron.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ No se borró nada: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
