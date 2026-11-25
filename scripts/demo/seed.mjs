// Dataset de DEMOSTRACIÓN en roxcoach-dev para el coach existente (por defecto jorgocios@gmail.com).
//
// Uso: npm run demo:seed
// Requiere en .env.local (nunca en el repositorio):
//   DEMO_TARGET_PROJECT_REF, DEMO_EXISTING_COACH_EMAIL (opcional),
//   DEMO_ATHLETE_{ACTIVE,PAUSED,PROGRESS}_{EMAIL,PASSWORD}, SUPABASE_SECRET_KEY, DIRECT_URL.
//
// Garantías:
// - No modifica al coach (ni contraseña, rol, perfil ni configuración) ni datos ajenos.
// - Idempotente: si ya existe un dataset (manifiesto o restos), se detiene sin tocar nada.
// - Todo lo creado queda en .demo/roxcoach-demo.json con ids exactos y la etiqueta
//   ROXCOACH_DEMO_<timestamp> (también en user_metadata.demo_tag de los atletas).
// - Los datos de la base se insertan en UNA transacción, respetando triggers y CHECKs.
// - Los avisos NO se insertan: los genera la propia app (sus reglas y deduplicación)
//   cuando el coach abre el panel.
// - No envía correos: las cuentas se crean confirmadas con la API de administración.
// - Mensajes: una conversación corta coach–atleta activo, por ids exactos en el manifiesto
//   (se crean solo con el resto del dataset; si ya existe, el seed se detiene).

import { randomBytes, createHash } from "node:crypto";
import { adminClient, assertTargetProject, dayKey, fail, findCoach, loadEnv, localInstant, mask, MANIFEST_PATH, pgClient, readManifest, writeManifest } from "./common.mjs";

loadEnv();
assertTargetProject();

// ---------- Atletas demo (credenciales SOLO desde .env.local) ----------
const ATHLETES = [
  { key: "active", name: "Atleta Demo Activo", env: "ACTIVE", division: "Open Men", raceIn: 60, days: ["Lun", "Mié", "Vie", "Sáb"], equipment: ["Trineo", "SkiErg", "Balón medicinal", "Pista"], joined: -21, invited: true },
  { key: "paused", name: "Atleta Demo En Pausa", env: "PAUSED", division: "Open Women", raceIn: 120, days: ["Mar", "Jue", "Sáb"], equipment: ["Remo", "Kettlebells", "Sandbag"], joined: -40, invited: true, pausedAgo: 5 },
  { key: "progress", name: "Atleta Demo Progreso", env: "PROGRESS", division: "Pro Men", raceIn: 35, days: ["Lun", "Mar", "Jue", "Vie", "Sáb"], equipment: ["Trineo", "SkiErg", "Remo", "Balón medicinal", "Kettlebells", "Sandbag", "Barra y discos", "Pista"], joined: -28, invited: true },
];
for (const a of ATHLETES) {
  a.email = process.env[`DEMO_ATHLETE_${a.env}_EMAIL`]?.trim().toLowerCase();
  a.password = process.env[`DEMO_ATHLETE_${a.env}_PASSWORD`] ?? "";
  if (!a.email) fail(`Falta DEMO_ATHLETE_${a.env}_EMAIL en .env.local.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) fail(`DEMO_ATHLETE_${a.env}_EMAIL no es un correo válido.`);
  if (a.email.endsWith("@example.com")) fail(`DEMO_ATHLETE_${a.env}_EMAIL no puede usar @example.com.`);
  if (a.password.length < 8) fail(`DEMO_ATHLETE_${a.env}_PASSWORD debe tener al menos 8 caracteres.`);
}
if (new Set(ATHLETES.map((a) => a.email)).size !== ATHLETES.length) fail("Los correos de los atletas demo deben ser distintos.");

// ---------- Ejercicios del sistema y plantillas ----------
const EX = {
  run1k: "00000000-0000-4000-8000-000000000001",
  run400: "00000000-0000-4000-8000-000000000002",
  skiErg: "00000000-0000-4000-8000-000000000003",
  sledPush: "00000000-0000-4000-8000-000000000004",
  farmers: "00000000-0000-4000-8000-000000000008",
  lunges: "00000000-0000-4000-8000-000000000009",
  wallBalls: "00000000-0000-4000-8000-000000000010",
  rdl: "00000000-0000-4000-8000-000000000011",
  hip9090: "00000000-0000-4000-8000-000000000013",
};
const ex = (id, sets, target, value, extra = {}) => ({ id, sets, target, reps: target === "reps" ? value : null, distance: target === "distance" ? value : null, duration: target === "time" ? value : null, load: extra.load ?? null, rest: extra.rest ?? null, notes: extra.notes ?? null });

const TEMPLATES = {
  engine: {
    name: "DEMO — HYROX Engine + Sled Push",
    focus: "Motor aeróbico y empuje de trineo",
    intensity: "alta",
    estimated: 60,
    status: "publicada",
    blocks: [
      { name: "Carrera", notes: "Ritmo de carrera objetivo; la primera repetición más suave.", exercises: [ex(EX.run1k, 4, "distance", 1000, { rest: 90, notes: "Mantén la cadencia constante." })] },
      { name: "Sled Push", notes: "Prioriza la técnica sobre la velocidad.", exercises: [ex(EX.sledPush, 4, "distance", 50, { load: 140, rest: 120, notes: "Brazos extendidos, empuja desde la cadera." })] },
      { name: "Wall Balls", notes: null, exercises: [ex(EX.wallBalls, 3, "reps", 20, { load: 6, rest: 60, notes: "Sentadilla completa en cada repetición." })] },
    ],
  },
  race: {
    name: "DEMO — HYROX Race Preparation",
    focus: "Simulación de carrera y transiciones",
    intensity: "alta",
    estimated: 75,
    status: "publicada",
    blocks: [
      { name: "Carrera por intervalos", notes: "Transiciones rápidas entre repeticiones.", exercises: [ex(EX.run400, 6, "distance", 400, { rest: 60 })] },
      {
        name: "Estaciones HYROX",
        notes: null,
        exercises: [
          ex(EX.skiErg, 2, "distance", 1000, { rest: 120 }),
          ex(EX.farmers, 2, "distance", 200, { load: 24, rest: 90 }),
          ex(EX.lunges, 2, "distance", 100, { load: 20, rest: 90, notes: "Rodilla trasera cerca del piso." }),
        ],
      },
      { name: "Fuerza y movilidad", notes: "Cierra con movilidad suave.", exercises: [ex(EX.rdl, 3, "reps", 8, { load: 60, rest: 90 }), ex(EX.hip9090, 2, "time", 60)] },
    ],
  },
  draft: {
    name: "DEMO — Borrador de prueba",
    focus: null,
    intensity: "media",
    estimated: null,
    status: "borrador",
    blocks: [{ name: "Bloque por definir", notes: "Plantilla incompleta a propósito (demo).", exercises: [] }],
  },
};

// ---------- Sesiones (fechas relativas a hoy) ----------
// sets: valores REALIZADOS por bloque/ejercicio (distintos a lo planeado cuando aplica).
const engineSets = (sledLoad, wallReps = [20, 20, 18]) => [
  [Array(4).fill({ distance: 1000 })],
  [Array(4).fill({ distance: 50, load: sledLoad })],
  [wallReps.map((reps) => ({ reps, load: 6 }))],
];
const raceSets = (farmersLoad, rdlLoad) => [
  [Array(6).fill({ distance: 400 })],
  [Array(2).fill({ distance: 1000 }), Array(2).fill({ distance: 200, load: farmersLoad }), Array(2).fill({ distance: 100, load: 20 })],
  [Array(3).fill({ reps: 8, load: rdlLoad }), Array(2).fill({ duration: 60 })],
];
const SESSIONS = [
  { key: "hist1", template: "engine", day: -27, athletes: { progress: { rpe: 7, sets: engineSets(120, [20, 18, 16]), comment: "Primera semana con el trineo: buena técnica." } } },
  { key: "hist2", template: "race", day: -20, athletes: { progress: { rpe: 8, sets: raceSets(20, 50) } } },
  { key: "paused1", template: "engine", day: -14, athletes: { paused: { rpe: 6, sets: engineSets(90, [18, 16, 15]), comment: "Sesión completa antes de la pausa." } } },
  { key: "hist3", template: "engine", day: -13, athletes: { progress: { rpe: 7, sets: engineSets(130, [20, 20, 18]) }, active: { rpe: 7, sets: engineSets(100, [20, 18, 17]), comment: "Me costó el último sled push." } } },
  { key: "paused2", template: "race", day: -10, athletes: { paused: null } },
  { key: "hist4", template: "race", day: -6, athletes: { progress: { rpe: 8, sets: raceSets(24, 55), discomfort: { zone: "rodilla", intensity: "leve", block: 1, exercise: 2, note: "DEMO — molestia de prueba en lunges (dato ficticio, no es un diagnóstico)." } } } },
  { key: "recent", template: "engine", day: -2, athletes: { progress: { rpe: 9, sets: engineSets(140, [20, 20, 20]), comment: "DEMO — Sesión muy exigente: el sled se sintió pesado al final." }, active: null } },
  { key: "today", template: "engine", day: 0, start: "18:00", athletes: { active: null, progress: null } },
  { key: "next", template: "race", day: 3, start: "07:00", athletes: { active: null, progress: null } },
  { key: "cancelled", template: "engine", day: 7, start: "07:00", cancel: true, athletes: { active: null } },
];
// Personalización individual (sesión de hoy, solo para el atleta activo).
const OVERRIDES = [
  { session: "today", athlete: "active", block: 1, exercise: 0, load: 100, rest: 150, note: "DEMO — Ajuste individual: carga reducida para priorizar técnica." },
  { session: "today", athlete: "active", block: 2, exercise: 0, reps: 15, note: "DEMO — 15 repeticiones por serie en lugar de 20." },
];

// Conversación demo (fase 16) entre el coach y el atleta activo, la noche de su sesión
// completada (hist3, día -13). Los dos primeros quedan leídos; el último del coach,
// sin leer (el atleta ve "Nuevo" y el contador del encabezado).
const MESSAGES = {
  athlete: "active",
  day: -13,
  items: [
    { sender: "coach", at: [20, 0], readAt: [20, 20], body: "Hola, ¿cómo te sentiste con la sesión de hoy?" },
    { sender: "athlete", at: [20, 25], readAt: [20, 38], body: "Me sentí bien. El sled push estuvo pesado, pero pude completar todas las series." },
    { sender: "coach", at: [20, 40], readAt: null, body: "Perfecto. Mantén ese ritmo y avísame si aparece alguna molestia." },
  ],
};

// ---------- Ejecución ----------
const tag = `ROXCOACH_DEMO_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
const client = pgClient();
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

try {
  const coach = await findCoach(client);
  console.log(`Coach: ${coach.maskedEmail} · user id ${coach.id} · coach profile ${coach.id} · ${coach.name}${coach.gymName ? ` · ${coach.gymName}` : ""}`);

  // Idempotencia: nada se crea si ya hay un dataset o restos.
  const existing = readManifest();
  if (existing) fail(`Ya existe un dataset demo (${existing.tag}, estado ${existing.status}). Revísalo con npm run demo:status o elimínalo con npm run demo:cleanup.`);
  const leftovers = await q(`select count(*)::int n from workout_templates where coach_id = $1 and name = any($2)`, [coach.id, Object.values(TEMPLATES).map((t) => t.name)]);
  if (leftovers[0].n > 0) fail("El coach ya tiene plantillas con los nombres DEMO pero no hay manifiesto. Se detiene sin tocar nada.");
  for (const a of ATHLETES) {
    const found = await q(`select id from auth.users where lower(email) = $1`, [a.email]);
    if (found.length) fail(`El correo del atleta ${a.key} (${mask(a.email)}) ya existe en Auth. Usa otro o limpia el dataset anterior.`);
    if (a.email === coach.email.toLowerCase()) fail("Un atleta demo no puede usar el correo del coach.");
  }

  const manifest = { tag, status: "parcial", createdAt: new Date().toISOString(), coach: { id: coach.id, maskedEmail: coach.maskedEmail }, athletes: [], invitations: [], relations: [], templates: [], sessions: [], assignments: [], overrides: [], sessionLogs: [], setLogs: [], discomforts: [], messages: [] };

  // 1) Cuentas Auth (fuera de la transacción). Se registran en el manifiesto al instante.
  const admin = adminClient();
  for (const a of ATHLETES) {
    const { data, error } = await admin.auth.admin.createUser({ email: a.email, password: a.password, email_confirm: true, user_metadata: { name: a.name, role: "athlete", demo_tag: tag } });
    if (error || !data.user) {
      writeManifest(manifest);
      fail(`No se pudo crear la cuenta del atleta ${a.key}: ${error?.message ?? "sin detalle"}. Manifiesto parcial en ${MANIFEST_PATH}.`);
    }
    a.id = data.user.id;
    manifest.athletes.push({ key: a.key, id: a.id, name: a.name, maskedEmail: mask(a.email) });
    writeManifest(manifest);
  }
  const athlete = Object.fromEntries(ATHLETES.map((a) => [a.key, a]));

  // 2) Datos en UNA transacción.
  await client.query("begin");
  const exercises = new Map((await q(`select id, name, category::text as category, equipment from exercises where coach_id is null and id = any($1)`, [Object.values(EX)])).map((e) => [e.id, e]));
  if (exercises.size !== Object.keys(EX).length) throw new Error("Faltan ejercicios del sistema esperados.");

  for (const a of ATHLETES) {
    const role = await q(`select role::text from profiles where id = $1`, [a.id]);
    if (role[0]?.role !== "athlete") throw new Error(`El perfil del atleta ${a.key} no quedó con rol athlete.`);
    await q(`update athlete_profiles set division = $2, race_date = $3, available_days = $4, equipment = $5, weight_unit = 'kg' where profile_id = $1`, [a.id, a.division, dayKey(a.raceIn), a.days, a.equipment]);
    if (a.invited) {
      const accepted = localInstant(dayKey(a.joined), 9);
      const created = new Date(accepted.getTime() - 86_400_000);
      const [inv] = await q(
        `insert into invitations (id, coach_id, email, name, token_hash, status, expires_at, accepted_at, accepted_by_id, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, 'accepted', $5, $6, $7, $8, $6) returning id`,
        [coach.id, a.email, a.name, createHash("sha256").update(randomBytes(32)).digest("hex"), new Date(created.getTime() + 7 * 86_400_000), accepted, a.id, created],
      );
      manifest.invitations.push(inv.id);
    }
    const [rel] = await q(`insert into coach_athletes (id, coach_id, athlete_id, status, joined_at) values (gen_random_uuid(), $1, $2, 'active', $3) returning id`, [coach.id, a.id, localInstant(dayKey(a.joined), 9)]);
    a.relationId = rel.id;
    manifest.relations.push(rel.id);
  }

  // Plantillas (se crean en borrador y se publican al final, como en la app).
  const snapshots = {};
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const [tpl] = await q(`insert into workout_templates (id, coach_id, name, focus, intensity, estimated_minutes, status) values (gen_random_uuid(), $1, $2, $3, $4, $5, 'borrador') returning id`, [coach.id, t.name, t.focus, t.intensity, t.estimated]);
    t.id = tpl.id;
    manifest.templates.push(tpl.id);
    for (const [bi, b] of t.blocks.entries()) {
      const [blk] = await q(`insert into workout_blocks (id, template_id, position, name, notes) values (gen_random_uuid(), $1, $2, $3, $4) returning id`, [tpl.id, bi, b.name, b.notes]);
      for (const [ei, e] of b.exercises.entries()) {
        await q(
          `insert into block_exercises (id, block_id, exercise_id, position, sets, target_type, reps, distance_meters, duration_seconds, load_kg, rest_seconds, notes)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [blk.id, e.id, ei, e.sets, e.target, e.reps, e.distance, e.duration, e.load, e.rest, e.notes],
        );
      }
    }
    if (t.status === "publicada") await q(`update workout_templates set status = 'publicada' where id = $1`, [tpl.id]);
    // Snapshot congelado: mismo formato que buildSnapshot (lib/scheduling/snapshot.ts, versión 1).
    snapshots[key] = {
      version: 1,
      templateName: t.name,
      focus: t.focus || null,
      intensity: t.intensity,
      estimatedMinutes: t.estimated,
      blocks: t.blocks.map((b) => ({
        name: b.name,
        notes: b.notes || null,
        exercises: b.exercises.map((e) => {
          const lib = exercises.get(e.id);
          return { exerciseId: e.id, name: lib.name, category: lib.category, equipment: [...lib.equipment], sets: e.sets, targetType: e.target, reps: e.reps, distanceMeters: e.distance, durationSeconds: e.duration, loadKg: e.load, restSeconds: e.rest, notes: e.notes };
        }),
      })),
    };
  }

  // Sesiones, asignaciones, personalizaciones y ejecuciones.
  const assignmentOf = {};
  for (const s of SESSIONS) {
    const t = TEMPLATES[s.template];
    if (t.status !== "publicada") throw new Error("Solo se programan plantillas publicadas.");
    const [ses] = await q(
      `insert into scheduled_sessions (id, coach_id, template_id, title, notes, scheduled_date, start_time, snapshot) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) returning id`,
      [coach.id, t.id, t.name, `Sesión de demostración (${tag}).`, dayKey(s.day), s.start ?? null, JSON.stringify(snapshots[s.template])],
    );
    s.id = ses.id;
    manifest.sessions.push(ses.id);
    for (const key of Object.keys(s.athletes)) {
      const [asg] = await q(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [ses.id, athlete[key].id]);
      assignmentOf[`${s.key}:${key}`] = asg.id;
      manifest.assignments.push(asg.id);
    }
  }

  for (const o of OVERRIDES) {
    const [ov] = await q(
      `insert into assignment_overrides (id, assignment_id, block_index, exercise_index, override_load_kg, override_rest_seconds, override_reps, note, created_by, updated_by, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $8, now()) returning id`,
      [assignmentOf[`${o.session}:${o.athlete}`], o.block, o.exercise, o.load ?? null, o.rest ?? null, o.reps ?? null, o.note, coach.id],
    );
    manifest.overrides.push(ov.id);
  }

  for (const s of SESSIONS) {
    for (const [key, exec] of Object.entries(s.athletes)) {
      if (!exec) continue;
      if (s.day > 0) throw new Error("No se ejecutan sesiones futuras.");
      const started = localInstant(dayKey(s.day), 7);
      // Ejecución en curso → series → (molestia) → completada: el orden que exigen los triggers.
      const [log] = await q(`insert into session_logs (id, assignment_id, status, started_at) values (gen_random_uuid(), $1, 'en_curso', $2) returning id`, [assignmentOf[`${s.key}:${key}`], started]);
      manifest.sessionLogs.push(log.id);
      let minute = 5;
      for (const [bi, block] of exec.sets.entries()) {
        for (const [ei, sets] of block.entries()) {
          for (const [si, v] of sets.entries()) {
            minute += 3;
            const [set] = await q(
              `insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_reps, actual_distance_meters, actual_duration_seconds, actual_load_kg, recorded_at)
               values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
              [log.id, bi, ei, si + 1, v.reps ?? null, v.distance ?? null, v.duration ?? null, v.load ?? null, new Date(started.getTime() + minute * 60_000)],
            );
            manifest.setLogs.push(set.id);
          }
        }
      }
      if (exec.discomfort) {
        const d = exec.discomfort;
        const [dis] = await q(
          `insert into discomfort_reports (id, session_log_id, zone, intensity, note, block_index, exercise_index, created_at) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) returning id`,
          [log.id, d.zone, d.intensity, d.note, d.block, d.exercise, new Date(started.getTime() + 40 * 60_000)],
        );
        manifest.discomforts.push(dis.id);
      }
      await q(`update session_logs set status = 'completada', finished_at = $2, rpe = $3, comment = $4 where id = $1`, [log.id, new Date(started.getTime() + (minute + 5) * 60_000), exec.rpe, exec.comment ?? null]);
    }
  }

  // Mensajes (relación activa, como exige el trigger messages_check; read_at se fija después).
  {
    const a = athlete[MESSAGES.athlete];
    const key = dayKey(MESSAGES.day);
    for (const m of MESSAGES.items) {
      const [msg] = await q(
        `insert into messages (id, coach_id, athlete_id, sender, body, client_id, created_at) values (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), $5) returning id`,
        [coach.id, a.id, m.sender, m.body, localInstant(key, ...m.at)],
      );
      manifest.messages.push(msg.id);
      if (m.readAt) await q(`update messages set read_at = $2 where id = $1`, [msg.id, localInstant(key, ...m.readAt)]);
    }
  }

  // Estados finales: sesión cancelada y relación en pausa (después de asignar su historial).
  for (const s of SESSIONS.filter((x) => x.cancel)) await q(`update scheduled_sessions set status = 'cancelada', cancelled_at = now() where id = $1`, [s.id]);
  for (const a of ATHLETES.filter((x) => x.pausedAgo)) await q(`update coach_athletes set status = 'paused', paused_at = $2 where id = $1`, [a.relationId, localInstant(dayKey(-a.pausedAgo), 9)]);

  // Verificación dentro de la transacción: todo pertenece al coach y nada más cambió de dueño.
  const own = await q(`select count(*)::int n from scheduled_sessions where id = any($1) and coach_id = $2`, [manifest.sessions, coach.id]);
  if (own[0].n !== manifest.sessions.length) throw new Error("Las sesiones creadas no pertenecen todas al coach.");
  const ownMessages = await q(`select count(*)::int n from messages where id = any($1) and coach_id = $2 and athlete_id = $3`, [manifest.messages, coach.id, athlete[MESSAGES.athlete].id]);
  if (ownMessages[0].n !== MESSAGES.items.length) throw new Error("Los mensajes creados no corresponden al coach y al atleta activo.");
  const cross = await q(`select count(*)::int n from coach_athletes where athlete_id = any($1) and coach_id <> $2`, [ATHLETES.map((a) => a.id), coach.id]);
  if (cross[0].n !== 0) throw new Error("Se detectaron relaciones cruzadas.");

  await client.query("commit");
  manifest.status = "completo";
  writeManifest(manifest);

  console.log(`\n✓ Dataset ${tag} creado (manifiesto: ${MANIFEST_PATH}).`);
  for (const a of manifest.athletes) console.log(`  atleta ${a.key.padEnd(8)} ${a.name.padEnd(22)} ${a.maskedEmail}  ${a.id}`);
  console.log(
    `  plantillas ${manifest.templates.length} · sesiones ${manifest.sessions.length} · asignaciones ${manifest.assignments.length} · personalizaciones ${manifest.overrides.length} · ejecuciones ${manifest.sessionLogs.length} · series ${manifest.setLogs.length} · molestias ${manifest.discomforts.length} · invitaciones ${manifest.invitations.length} · mensajes ${manifest.messages.length}`,
  );
  console.log("  Avisos: los genera la app al abrir el panel del coach (RPE alto, molestia, sesión no iniciada, nuevos atletas).");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ Se revirtió la transacción: ${error.message}`);
  if (readManifest()?.athletes?.length) console.error(`  Las cuentas Auth ya creadas quedaron en ${MANIFEST_PATH} (estado "parcial"): elimínalas con npm run demo:cleanup.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
