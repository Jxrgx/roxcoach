// Estado del dataset demo (SOLO LECTURA). Uso: npm run demo:status
// Compara el manifiesto con la base: ids presentes, dueños, avisos generados por la
// app y datos históricos que deben seguir intactos. No imprime secretos ni correos.

import { assertTargetProject, fail, findCoach, loadEnv, pgClient, readManifest } from "./common.mjs";

loadEnv();
assertTargetProject();
const manifest = readManifest();
if (!manifest) fail("No hay dataset demo (falta .demo/roxcoach-demo.json).");

const client = pgClient();
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
let problems = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) problems++;
};
try {
  const coach = await findCoach(client);
  check(coach.id === manifest.coach.id, `coach ${coach.maskedEmail} (${coach.id}) es el del manifiesto`);
  const athleteIds = manifest.athletes.map((a) => a.id);
  const tagged = await q(`select count(*)::int n from auth.users where id = any($1) and raw_user_meta_data->>'demo_tag' = $2`, [athleteIds, manifest.tag]);
  check(tagged[0].n === athleteIds.length, `atletas demo con la etiqueta ${manifest.tag}: ${tagged[0].n}/${athleteIds.length}`);
  const tables = [
    ["invitations", manifest.invitations, "coach_id = $2"],
    ["coach_athletes", manifest.relations, "coach_id = $2"],
    ["workout_templates", manifest.templates, "coach_id = $2"],
    ["scheduled_sessions", manifest.sessions, "coach_id = $2"],
    ["assignments", manifest.assignments, "session_id in (select id from scheduled_sessions where coach_id = $2)"],
    ["assignment_overrides", manifest.overrides, "assignment_id in (select a.id from assignments a join scheduled_sessions s on s.id = a.session_id where s.coach_id = $2)"],
    ["session_logs", manifest.sessionLogs, "assignment_id in (select a.id from assignments a join scheduled_sessions s on s.id = a.session_id where s.coach_id = $2)"],
    ["set_logs", manifest.setLogs, "session_log_id in (select l.id from session_logs l join assignments a on a.id = l.assignment_id join scheduled_sessions s on s.id = a.session_id where s.coach_id = $2)"],
    ["discomfort_reports", manifest.discomforts, "session_log_id in (select l.id from session_logs l join assignments a on a.id = l.assignment_id join scheduled_sessions s on s.id = a.session_id where s.coach_id = $2)"],
  ];
  for (const [table, ids, owner] of tables) {
    const n = (await q(`select count(*)::int n from ${table} where id = any($1) and ${owner}`, [ids, coach.id]))[0].n;
    check(n === ids.length, `${table}: ${n}/${ids.length} presentes y del coach`);
  }
  const relations = await q(`select status::text, count(*)::int n from coach_athletes where id = any($1) group by 1 order by 1`, [manifest.relations]);
  console.log(`  relaciones: ${relations.map((r) => `${r.status}=${r.n}`).join(", ")}`);
  const sources = [...manifest.invitations, ...manifest.assignments, ...manifest.sessionLogs, ...manifest.discomforts];
  const alerts = await q(
    `select kind::text, count(*)::int n from coach_alerts where coach_id = $1 and (athlete_id = any($2) or source_id = any($3)) group by 1 order by 1`,
    [coach.id, athleteIds, sources],
  );
  console.log(`  avisos generados por la app: ${alerts.length ? alerts.map((a) => `${a.kind}=${a.n}`).join(", ") : "ninguno todavía (se generan al abrir el panel del coach)"}`);
  const foreign = await q(`select count(*)::int n from coach_alerts where coach_id <> $1 and (athlete_id = any($2) or source_id = any($3))`, [coach.id, athleteIds, sources]);
  check(foreign[0].n === 0, "ningún aviso demo pertenece a otro coach");
  const cross = await q(`select count(*)::int n from coach_athletes where athlete_id = any($1) and coach_id <> $2`, [athleteIds, coach.id]);
  check(cross[0].n === 0, "sin relaciones cruzadas con otros coaches");
  const hist = await q(
    `select (select count(*) from invitations where not (id = any($1)))::int inv, (select count(*) from coach_alerts where coach_id <> $2)::int alerts,
            (select count(*) from workout_templates where coach_id <> $2)::int templates`,
    [manifest.invitations, coach.id],
  );
  console.log(`  datos ajenos al dataset: invitaciones ${hist[0].inv} · avisos de otros coaches ${hist[0].alerts} · plantillas de otros coaches ${hist[0].templates}`);
} finally {
  await client.end();
}
console.log(problems ? `\n${problems} problema(s).` : `\nDataset ${manifest.tag} (${manifest.status}) consistente.`);
process.exit(problems ? 1 : 0);
