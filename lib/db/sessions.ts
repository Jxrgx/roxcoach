import "server-only";

import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { findTemplateForCoach } from "@/lib/db/templates";
import { buildSnapshot, parseSnapshot, snapshotExerciseCount, type SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { WorkoutIntensityValue } from "@/lib/workouts/rules";
import type { ExecutionStatus } from "@/lib/execution/progress";

/**
 * Sesiones programadas y asignaciones.
 * - Coach: todas las consultas filtran por su coachId.
 * - Atleta: solo ve sesiones donde tiene una asignación vigente ("asignada").
 */

export type SessionStatusValue = "programada" | "cancelada";

export interface SessionSummaryDTO {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  status: SessionStatusValue;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  blockCount: number;
  exerciseCount: number;
  /** Atletas con asignación vigente. */
  athleteCount: number;
}

export interface SessionAthleteDTO {
  athleteId: string;
  name: string;
  division: string;
  /** Solo en el detalle de la sesión (atletas asignados). */
  execution?: ExecutionStatus;
  discomfortCount?: number;
}

export interface CoachSessionDetailDTO extends SessionSummaryDTO {
  notes: string;
  templateId: string | null;
  snapshot: SessionSnapshotV1;
  athletes: SessionAthleteDTO[];
}

export interface AthleteSessionDTO extends SessionSummaryDTO {
  notes: string;
  coachName: string;
  snapshot: SessionSnapshotV1;
  /** Estado de la ejecución del propio atleta. */
  execution: ExecutionStatus;
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const dateOf = (key: string) => new Date(`${key}T00:00:00.000Z`);

const EMPTY_SNAPSHOT: SessionSnapshotV1 = { version: 1, templateName: "", focus: null, intensity: "media", estimatedMinutes: null, blocks: [] };

type SessionRow = Prisma.ScheduledSessionGetPayload<{ include: { assignments: { select: { status: true } } } }>;

function toSummary(s: SessionRow): SessionSummaryDTO {
  const snap = parseSnapshot(s.snapshot) ?? EMPTY_SNAPSHOT;
  return {
    id: s.id,
    title: s.title,
    date: keyOf(s.scheduledDate),
    startTime: s.startTime,
    status: s.status,
    intensity: snap.intensity,
    estimatedMinutes: snap.estimatedMinutes,
    blockCount: snap.blocks.length,
    exerciseCount: snapshotExerciseCount(snap),
    athleteCount: s.assignments.filter((a) => a.status === "asignada").length,
  };
}

const ORDER = [{ scheduledDate: "asc" as const }, { startTime: { sort: "asc" as const, nulls: "last" as const } }, { createdAt: "asc" as const }];

/* ---------- Coach ---------- */

/** Sesiones del coach entre dos fechas (inclusive). */
export async function listCoachSessions(coachId: string, from: string, to: string): Promise<SessionSummaryDTO[]> {
  const rows = await db().scheduledSession.findMany({
    where: { coachId, scheduledDate: { gte: dateOf(from), lte: dateOf(to) } },
    include: { assignments: { select: { status: true } } },
    orderBy: ORDER,
  });
  return rows.map(toSummary);
}

export async function findCoachSession(coachId: string, id: string): Promise<CoachSessionDetailDTO | null> {
  const s = await db().scheduledSession.findFirst({
    where: { id, coachId },
    include: {
      assignments: {
        where: { status: "asignada" },
        include: {
          athlete: { select: { division: true, profile: { select: { name: true } } } },
          log: { select: { status: true, _count: { select: { discomforts: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!s) return null;
  return {
    ...toSummary(s),
    notes: s.notes ?? "",
    templateId: s.templateId,
    snapshot: parseSnapshot(s.snapshot) ?? EMPTY_SNAPSHOT,
    athletes: toSessionAthletes(s.assignments).map((a) => {
      const log = s.assignments.find((r) => r.athleteId === a.athleteId)?.log;
      return { ...a, execution: log?.status ?? "sin_iniciar", discomfortCount: log?._count.discomforts ?? 0 };
    }),
  };
}

/**
 * Prisma resuelve los include con consultas separadas: si un atleta se borra
 * entre ellas, su relación llega como null aunque el tipo diga lo contrario.
 * Se descarta esa fila en lugar de romper la página.
 */
function toSessionAthletes(
  rows: Array<{ athleteId: string; athlete: { division: string | null; profile: { name: string } | null } | null }>,
): SessionAthleteDTO[] {
  return rows.flatMap((r) =>
    r.athlete?.profile ? [{ athleteId: r.athleteId, name: r.athlete.profile.name, division: r.athlete.division ?? "" }] : [],
  );
}

/** Atletas ACTIVOS del coach (los únicos asignables). */
export async function listAssignableAthletes(coachId: string): Promise<SessionAthleteDTO[]> {
  const rows = await db().coachAthlete.findMany({
    where: { coachId, status: "active" },
    include: { athlete: { select: { division: true, profile: { select: { name: true } } } } },
  });
  return toSessionAthletes(rows).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Plantillas PUBLICADAS del coach (las únicas programables). */
export async function listSchedulableTemplates(coachId: string) {
  const rows = await db().workoutTemplate.findMany({
    where: { coachId, status: "publicada" },
    select: { id: true, name: true, estimatedMinutes: true, intensity: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export type CreateSessionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "template-unavailable" | "athletes-unavailable"; unavailable?: string[] };

async function activeAthleteIds(tx: Prisma.TransactionClient, coachId: string, ids: string[]): Promise<Set<string>> {
  const rows = await tx.coachAthlete.findMany({ where: { coachId, status: "active", athleteId: { in: ids } }, select: { athleteId: true } });
  return new Set(rows.map((r) => r.athleteId));
}

/** Programa una plantilla publicada: congela el snapshot y asigna atletas activos. */
export async function createSession(
  coachId: string,
  data: { templateId: string; date: string; startTime: string | null; title: string; notes: string | null; athleteIds: string[] },
): Promise<CreateSessionResult> {
  const template = await findTemplateForCoach(coachId, data.templateId);
  if (!template || template.status !== "publicada") return { ok: false, reason: "template-unavailable" };
  const snapshot = buildSnapshot({
    name: template.name,
    focus: template.focus,
    intensity: template.intensity,
    estimatedMinutes: template.estimatedMinutes,
    blocks: template.blocks.map((b) => ({ name: b.name, notes: b.notes, exercises: b.exercises })),
  });

  return db().$transaction(async (tx) => {
    const active = await activeAthleteIds(tx, coachId, data.athleteIds);
    const unavailable = data.athleteIds.filter((id) => !active.has(id));
    if (unavailable.length) return { ok: false, reason: "athletes-unavailable", unavailable };
    const created = await tx.scheduledSession.create({
      data: {
        coachId,
        templateId: template.id,
        title: data.title,
        notes: data.notes,
        scheduledDate: dateOf(data.date),
        startTime: data.startTime,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        assignments: { create: data.athleteIds.map((athleteId) => ({ athleteId })) },
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  });
}

/** Cambia fecha, hora, título y notas de una sesión PROGRAMADA propia (el snapshot no cambia). */
export async function updateSessionDetails(
  coachId: string,
  id: string,
  data: { date: string; startTime: string | null; title: string; notes: string | null },
): Promise<boolean> {
  const result = await db().scheduledSession.updateMany({
    where: { id, coachId, status: "programada" },
    data: { scheduledDate: dateOf(data.date), startTime: data.startTime, title: data.title, notes: data.notes },
  });
  return result.count === 1;
}

/** Cancela una sesión programada propia. Se conserva el historial. */
export async function cancelSession(coachId: string, id: string): Promise<boolean> {
  const result = await db().scheduledSession.updateMany({ where: { id, coachId, status: "programada" }, data: { status: "cancelada", cancelledAt: new Date() } });
  return result.count === 1;
}

/** Agrega atletas activos a una sesión programada propia (reasigna a los retirados). */
export async function addAthletesToSession(
  coachId: string,
  sessionId: string,
  athleteIds: string[],
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "athletes-unavailable"; unavailable?: string[] }> {
  return db().$transaction(async (tx) => {
    const session = await tx.scheduledSession.findFirst({ where: { id: sessionId, coachId, status: "programada" }, select: { id: true } });
    if (!session) return { ok: false, reason: "not-found" };
    const active = await activeAthleteIds(tx, coachId, athleteIds);
    const unavailable = athleteIds.filter((id) => !active.has(id));
    if (unavailable.length) return { ok: false, reason: "athletes-unavailable", unavailable };
    for (const athleteId of athleteIds) {
      await tx.assignment.upsert({
        where: { sessionId_athleteId: { sessionId, athleteId } },
        create: { sessionId, athleteId },
        update: { status: "asignada" },
      });
    }
    return { ok: true };
  });
}

/**
 * Retira a un atleta de una sesión propia (no borra: queda "retirada").
 * Si ya la comenzó no se retira, para conservar su historial (también lo
 * impide un trigger en la BD).
 */
export async function removeAthleteFromSession(coachId: string, sessionId: string, athleteId: string): Promise<"ok" | "not-found" | "started"> {
  const started = await db().sessionLog.count({ where: { assignment: { sessionId, athleteId, session: { coachId } } } });
  if (started > 0) return "started";
  const result = await db().assignment.updateMany({
    where: { sessionId, athleteId, status: "asignada", session: { coachId, status: "programada" } },
    data: { status: "retirada" },
  });
  return result.count === 1 ? "ok" : "not-found";
}

/* ---------- Atleta ---------- */

const ATHLETE_INCLUDE = {
  coach: { select: { profile: { select: { name: true } } } },
  assignments: { select: { status: true, athleteId: true, log: { select: { status: true } } } },
} satisfies Prisma.ScheduledSessionInclude;

function toAthleteSession(athleteId: string, s: Prisma.ScheduledSessionGetPayload<{ include: typeof ATHLETE_INCLUDE }>): AthleteSessionDTO {
  const own = s.assignments.find((a) => a.athleteId === athleteId && a.status === "asignada");
  return {
    ...toSummary(s),
    notes: s.notes ?? "",
    coachName: s.coach?.profile?.name ?? "Tu coach",
    snapshot: parseSnapshot(s.snapshot) ?? EMPTY_SNAPSHOT,
    execution: own?.log?.status ?? "sin_iniciar",
  };
}

/** Sesiones asignadas al atleta entre dos fechas (incluye canceladas, para avisarle). */
export async function listAthleteSessions(athleteId: string, from: string, to: string): Promise<AthleteSessionDTO[]> {
  const rows = await db().scheduledSession.findMany({
    where: { scheduledDate: { gte: dateOf(from), lte: dateOf(to) }, assignments: { some: { athleteId, status: "asignada" } } },
    include: ATHLETE_INCLUDE,
    orderBy: ORDER,
  });
  return rows.map((r) => toAthleteSession(athleteId, r));
}

/** Próximas sesiones programadas del atleta desde una fecha (inclusive). */
export async function listUpcomingAthleteSessions(athleteId: string, from: string, limit: number): Promise<AthleteSessionDTO[]> {
  const rows = await db().scheduledSession.findMany({
    where: { status: "programada", scheduledDate: { gte: dateOf(from) }, assignments: { some: { athleteId, status: "asignada" } } },
    include: ATHLETE_INCLUDE,
    orderBy: ORDER,
    take: limit,
  });
  return rows.map((r) => toAthleteSession(athleteId, r));
}

/** Detalle para el atleta: solo si tiene una asignación vigente en esa sesión. */
export async function findAthleteSession(athleteId: string, id: string): Promise<AthleteSessionDTO | null> {
  const s = await db().scheduledSession.findFirst({
    where: { id, assignments: { some: { athleteId, status: "asignada" } } },
    include: ATHLETE_INCLUDE,
  });
  return s ? toAthleteSession(athleteId, s) : null;
}

/** Sesión que el atleta dejó en curso (cualquier fecha), para "Continuar". */
export async function findInProgressAthleteSession(athleteId: string): Promise<AthleteSessionDTO | null> {
  const s = await db().scheduledSession.findFirst({
    where: { assignments: { some: { athleteId, status: "asignada", log: { is: { status: "en_curso" } } } } },
    include: ATHLETE_INCLUDE,
    orderBy: ORDER,
  });
  return s ? toAthleteSession(athleteId, s) : null;
}
