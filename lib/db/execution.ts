import "server-only";

import { db } from "@/lib/db/prisma";
import { parseSnapshot, type SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import { closedPauseSeconds, isValidPosition, type ExecutionStatus, type LoggedSet, type SetPosition } from "@/lib/execution/progress";
import type { DiscomfortIntensityValue, DiscomfortZoneValue } from "@/lib/execution/discomfort";
import type { SetLogValue } from "@/lib/validations";

/**
 * Ejecución de sesiones (datos REALES). Nunca escribe en scheduled_sessions ni
 * en su snapshot: solo en session_logs, set_logs y discomfort_reports.
 * - Atleta: todo pasa por su asignación vigente en la sesión.
 * - Coach: solo lectura, filtrada por su coachId.
 */

export interface ExecutionLogDTO {
  status: Exclude<ExecutionStatus, "sin_iniciar">;
  startedAt: Date;
  pausedAt: Date | null;
  pausedSeconds: number;
  finishedAt: Date | null;
  rpe: number | null;
  comment: string | null;
}

export interface DiscomfortDTO {
  id: string;
  zone: DiscomfortZoneValue;
  intensity: DiscomfortIntensityValue;
  note: string | null;
  /** Nombre del ejercicio (del snapshot) si se reportó durante uno. */
  exerciseName: string | null;
  createdAt: Date;
}

export interface ExecutionDTO {
  sessionId: string;
  title: string;
  date: string;
  sessionStatus: "programada" | "cancelada";
  snapshot: SessionSnapshotV1;
  log: ExecutionLogDTO | null;
  sets: LoggedSet[];
  discomforts: DiscomfortDTO[];
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const EMPTY_SNAPSHOT: SessionSnapshotV1 = { version: 1, templateName: "", focus: null, intensity: "media", estimatedMinutes: null, blocks: [] };

const LOG_INCLUDE = {
  sets: { orderBy: [{ blockIndex: "asc" as const }, { exerciseIndex: "asc" as const }, { setNumber: "asc" as const }] },
  discomforts: { orderBy: { createdAt: "asc" as const } },
};

type LogRow = Awaited<ReturnType<typeof loadLog>>;
function loadLog(assignmentId: string) {
  return db().sessionLog.findUnique({ where: { assignmentId }, include: LOG_INCLUDE });
}

function toExecution(
  session: { id: string; title: string; scheduledDate: Date; status: "programada" | "cancelada"; snapshot: unknown },
  log: LogRow,
): ExecutionDTO {
  const snapshot = parseSnapshot(session.snapshot) ?? EMPTY_SNAPSHOT;
  return {
    sessionId: session.id,
    title: session.title,
    date: keyOf(session.scheduledDate),
    sessionStatus: session.status,
    snapshot,
    log: log
      ? {
          status: log.status,
          startedAt: log.startedAt,
          pausedAt: log.pausedAt,
          pausedSeconds: log.pausedSeconds,
          finishedAt: log.finishedAt,
          rpe: log.rpe,
          comment: log.comment,
        }
      : null,
    sets: (log?.sets ?? []).map((s) => ({
      blockIndex: s.blockIndex,
      exerciseIndex: s.exerciseIndex,
      setNumber: s.setNumber,
      actualReps: s.actualReps,
      actualDistanceMeters: s.actualDistanceMeters,
      actualDurationSeconds: s.actualDurationSeconds,
      actualLoadKg: s.actualLoadKg,
      rpe: s.rpe,
    })),
    discomforts: (log?.discomforts ?? []).map((d) => ({
      id: d.id,
      zone: d.zone,
      intensity: d.intensity,
      note: d.note,
      exerciseName:
        d.blockIndex !== null && d.exerciseIndex !== null ? (snapshot.blocks[d.blockIndex]?.exercises[d.exerciseIndex]?.name ?? null) : null,
      createdAt: d.createdAt,
    })),
  };
}

/* ---------- Atleta ---------- */

/** Asignación vigente del atleta en la sesión (o null si no le pertenece). */
async function findAssignment(athleteId: string, sessionId: string) {
  return db().assignment.findFirst({
    where: { sessionId, athleteId, status: "asignada" },
    select: {
      id: true,
      session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
    },
  });
}

/** Ejecución de una sesión asignada al atleta (con o sin comenzar). */
export async function findAthleteExecution(athleteId: string, sessionId: string): Promise<ExecutionDTO | null> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return null;
  return toExecution(assignment.session, await loadLog(assignment.id));
}

export type StartResult = { ok: true } | { ok: false; reason: "not-found" | "cancelled" | "future" };

/** Comenzar: crea el registro (idempotente si ya existe). */
export async function startExecution(athleteId: string, sessionId: string, today: string): Promise<StartResult> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return { ok: false, reason: "not-found" };
  const existing = await db().sessionLog.findUnique({ where: { assignmentId: assignment.id }, select: { id: true } });
  if (existing) return { ok: true };
  if (assignment.session.status !== "programada") return { ok: false, reason: "cancelled" };
  if (keyOf(assignment.session.scheduledDate) > today) return { ok: false, reason: "future" };
  await db().sessionLog.upsert({ where: { assignmentId: assignment.id }, create: { assignmentId: assignment.id }, update: {} });
  return { ok: true };
}

type InProgress = { ok: true; logId: string; snapshot: SessionSnapshotV1; pausedAt: Date | null } | { ok: false; reason: "not-found" | "not-in-progress" };

async function findInProgress(athleteId: string, sessionId: string): Promise<InProgress> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return { ok: false, reason: "not-found" };
  const log = await db().sessionLog.findUnique({ where: { assignmentId: assignment.id }, select: { id: true, status: true, pausedAt: true } });
  if (!log || log.status !== "en_curso") return { ok: false, reason: "not-in-progress" };
  return { ok: true, logId: log.id, snapshot: parseSnapshot(assignment.session.snapshot) ?? EMPTY_SNAPSHOT, pausedAt: log.pausedAt };
}

export type LogSetResult = { ok: true; set: LoggedSet } | { ok: false; reason: "not-found" | "not-in-progress" | "paused" | "invalid-position" };

/** Registra (o corrige) el resultado real de una serie mientras la sesión está en curso. */
export async function logSet(athleteId: string, sessionId: string, at: SetPosition, value: SetLogValue): Promise<LogSetResult> {
  // Solo las tres coordenadas (el llamador podría pasar un objeto con más campos).
  const position = { blockIndex: at.blockIndex, exerciseIndex: at.exerciseIndex, setNumber: at.setNumber };
  const found = await findInProgress(athleteId, sessionId);
  if (!found.ok) return found;
  if (found.pausedAt) return { ok: false, reason: "paused" };
  if (!isValidPosition(found.snapshot, position)) return { ok: false, reason: "invalid-position" };
  const where = { sessionLogId_blockIndex_exerciseIndex_setNumber: { sessionLogId: found.logId, ...position } };
  const saved = await db().setLog.upsert({ where, create: { sessionLogId: found.logId, ...position, ...value }, update: value });
  return {
    ok: true,
    set: {
      blockIndex: saved.blockIndex,
      exerciseIndex: saved.exerciseIndex,
      setNumber: saved.setNumber,
      actualReps: saved.actualReps,
      actualDistanceMeters: saved.actualDistanceMeters,
      actualDurationSeconds: saved.actualDurationSeconds,
      actualLoadKg: saved.actualLoadKg,
      rpe: saved.rpe,
    },
  };
}

export type TimesResult = { ok: true; log: Pick<ExecutionLogDTO, "pausedAt" | "pausedSeconds"> } | { ok: false; reason: "not-found" | "not-in-progress" };

export async function pauseExecution(athleteId: string, sessionId: string): Promise<TimesResult> {
  const found = await findInProgress(athleteId, sessionId);
  if (!found.ok) return found;
  // Solo si no estaba en pausa (doble toque o dos pestañas).
  await db().sessionLog.updateMany({ where: { id: found.logId, status: "en_curso", pausedAt: null }, data: { pausedAt: new Date() } });
  const log = await db().sessionLog.findUniqueOrThrow({ where: { id: found.logId }, select: { pausedAt: true, pausedSeconds: true } });
  return { ok: true, log };
}

export async function resumeExecution(athleteId: string, sessionId: string): Promise<TimesResult> {
  const found = await findInProgress(athleteId, sessionId);
  if (!found.ok) return found;
  if (found.pausedAt) {
    await db().sessionLog.updateMany({
      where: { id: found.logId, pausedAt: found.pausedAt },
      data: { pausedAt: null, pausedSeconds: { increment: closedPauseSeconds(found.pausedAt, new Date()) } },
    });
  }
  const log = await db().sessionLog.findUniqueOrThrow({ where: { id: found.logId }, select: { pausedAt: true, pausedSeconds: true } });
  return { ok: true, log };
}

/** Finaliza (aunque falten series: quedan como no realizadas). Cierra la pausa abierta. */
export async function finishExecution(athleteId: string, sessionId: string): Promise<{ ok: boolean }> {
  const found = await findInProgress(athleteId, sessionId);
  if (!found.ok) return { ok: false };
  const now = new Date();
  const result = await db().sessionLog.updateMany({
    where: { id: found.logId, status: "en_curso" },
    data: { status: "completada", finishedAt: now, pausedAt: null, pausedSeconds: { increment: closedPauseSeconds(found.pausedAt, now) } },
  });
  return { ok: result.count === 1 };
}

/** RPE general y comentario: lo único editable después de finalizar. */
export async function saveFeedback(athleteId: string, sessionId: string, value: { rpe: number | null; comment: string | null }): Promise<boolean> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return false;
  const result = await db().sessionLog.updateMany({ where: { assignmentId: assignment.id, status: "completada" }, data: value });
  return result.count === 1;
}

/** Reporte de molestia, durante la sesión o desde el resumen. */
export async function reportDiscomfort(
  athleteId: string,
  sessionId: string,
  value: { zone: DiscomfortZoneValue; intensity: DiscomfortIntensityValue; note: string | null; blockIndex: number | null; exerciseIndex: number | null },
): Promise<boolean> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return false;
  const log = await db().sessionLog.findUnique({ where: { assignmentId: assignment.id }, select: { id: true } });
  if (!log) return false;
  const snapshot = parseSnapshot(assignment.session.snapshot) ?? EMPTY_SNAPSHOT;
  const hasExercise =
    value.blockIndex !== null && value.exerciseIndex !== null && !!snapshot.blocks[value.blockIndex]?.exercises[value.exerciseIndex];
  await db().discomfortReport.create({
    data: {
      sessionLogId: log.id,
      zone: value.zone,
      intensity: value.intensity,
      note: value.note,
      blockIndex: hasExercise ? value.blockIndex : null,
      exerciseIndex: hasExercise ? value.exerciseIndex : null,
    },
  });
  return true;
}

/* ---------- Coach (solo lectura) ---------- */

export interface CoachAthleteExecutionDTO extends ExecutionDTO {
  athleteId: string;
  athleteName: string;
}

/** Resultados de un atleta en una sesión propia del coach. */
export async function findAthleteExecutionForCoach(coachId: string, sessionId: string, athleteId: string): Promise<CoachAthleteExecutionDTO | null> {
  const assignment = await db().assignment.findFirst({
    where: { sessionId, athleteId, session: { coachId } },
    select: {
      id: true,
      status: true,
      athlete: { select: { profile: { select: { name: true } } } },
      session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
    },
  });
  if (!assignment?.athlete?.profile) return null;
  const log = await loadLog(assignment.id);
  // Un atleta retirado sin registro no tiene resultados que mostrar.
  if (assignment.status !== "asignada" && !log) return null;
  return { ...toExecution(assignment.session, log), athleteId, athleteName: assignment.athlete.profile.name };
}
