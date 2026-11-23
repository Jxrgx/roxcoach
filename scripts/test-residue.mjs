// Reporte de SOLO LECTURA de datos de prueba en la base de DESARROLLO (cierre fase 14).
//
// Uso: npm run db:residue [-- --json salida.json]
// Muestra conteos por tabla, verifica que los usuarios compartidos de las e2e
// sigan intactos y lista los ids de posibles residuos. No borra nada y no
// imprime correos, contraseñas ni la cadena de conexión.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DIRECT_URL) {
  console.error("Falta DIRECT_URL (ver .env.example).");
  process.exit(1);
}
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const seed = existsSync("tests/e2e/.auth/ids.json") ? JSON.parse(readFileSync("tests/e2e/.auth/ids.json", "utf8")) : {};

const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const n = async (sql, params = []) => Number((await q(sql, params))[0].n);

const report = {
  at: new Date().toISOString(),
  counts: {
    users: await n(`select count(*) n from auth.users`),
    invitations: await n(`select count(*) n from invitations`),
    invitationsByStatus: Object.fromEntries((await q(`select status, count(*)::int n from invitations group by 1 order by 1`)).map((r) => [r.status, r.n])),
    coachAlerts: await n(`select count(*) n from coach_alerts`),
    sessions: await n(`select count(*) n from scheduled_sessions`),
    assignments: await n(`select count(*) n from assignments`),
    sessionLogs: await n(`select count(*) n from session_logs`),
    templates: await n(`select count(*) n from workout_templates`),
    ownExercises: await n(`select count(*) n from exercises where coach_id is not null`),
    relations: await n(`select count(*) n from coach_athletes`),
  },
  sharedUsers: {
    coach: seed.coachId ? (await n(`select count(*) n from profiles where id = $1 and role = 'coach'`, [seed.coachId])) === 1 : null,
    athlete: seed.athleteId ? (await n(`select count(*) n from profiles where id = $1 and role = 'athlete'`, [seed.athleteId])) === 1 : null,
    relation: seed.coachId && seed.athleteId ? (await n(`select count(*) n from coach_athletes where coach_id = $1 and athlete_id = $2`, [seed.coachId, seed.athleteId])) === 1 : null,
  },
  residueIds: {
    otherUsers: (await q(`select id from auth.users where not (id = any($1::uuid[]))`, [[seed.coachId, seed.athleteId].filter(Boolean)])).map((r) => r.id),
    orphanAlerts: (await q(`select id, kind from coach_alerts where (athlete_id is null or session_id is null) order by created_at`)).map((r) => `${r.id} (${r.kind})`),
    sessions: (await q(`select id from scheduled_sessions order by created_at`)).map((r) => r.id),
    templates: (await q(`select id from workout_templates order by created_at`)).map((r) => r.id),
    ownExercises: (await q(`select id from exercises where coach_id is not null order by created_at`)).map((r) => r.id),
  },
};
await client.end();

const c = report.counts;
console.log(`usuarios ${c.users} · invitaciones ${c.invitations} ${JSON.stringify(c.invitationsByStatus)} · avisos ${c.coachAlerts} · sesiones ${c.sessions} · asignaciones ${c.assignments} · registros ${c.sessionLogs} · plantillas ${c.templates} · ejercicios propios ${c.ownExercises} · relaciones ${c.relations}`);
console.log(`usuarios compartidos intactos: coach=${report.sharedUsers.coach} atleta=${report.sharedUsers.athlete} relación=${report.sharedUsers.relation}`);
for (const [k, v] of Object.entries(report.residueIds)) if (v.length) console.log(`  ${k}: ${v.join(", ")}`);
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));
