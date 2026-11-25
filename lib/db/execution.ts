import "server-only";

import { athleteAssignmentWhere, coachAssignmentWhere } from "@/lib/db/access-rules";
import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { effectivePlan, OVERRIDE_SELECT } from "@/lib/db/overrides";
import type { EffectivePlan } from "@/lib/overrides/apply";
import { startAvailability, type ExecutionStatus, type LoggedSet } from "@/lib/execution/progress";
import type { DiscomfortIntensityValue, DiscomfortZoneValue } from "@/lib/execution/discomfort";

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
  /** Plan EFECTIVO del atleta: snapshot + sus ajustes (con el original de cada ejercicio). */
  snapshot: EffectivePlan;
  log: ExecutionLogDTO | null;
  /** clientOpId: operación que escribió la serie (para corregirla sin sobrescribir otra; fase 11). */
  sets: (LoggedSet & { clientOpId: string | null })[];
  discomforts: DiscomfortDTO[];
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

const LOG_INCLUDE = {
  sets: { orderBy: [{ blockIndex: "asc" as const }, { exerciseIndex: "asc" as const }, { setNumber: "asc" as const }] },
  discomforts: { orderBy: { createdAt: "asc" as const } },
};

type LogRow = Awaited<ReturnType<typeof loadLog>>;
function loadLog(assignmentId: string) {
  return db().sessionLog.findUnique({ where: { assignmentId }, include: LOG_INCLUDE });
}

type OverrideRows = Parameters<typeof effectivePlan>[1];

function toExecution(
  session: { id: string; title: string; scheduledDate: Date; status: "programada" | "cancelada"; snapshot: unknown },
  log: LogRow,
  overrides: OverrideRows,
): ExecutionDTO {
  const snapshot = effectivePlan(session.snapshot, overrides);
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
      clientOpId: s.clientOpId,
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
    where: athleteAssignmentWhere(athleteId, sessionId),
    select: {
      id: true,
      session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
      overrides: { select: OVERRIDE_SELECT },
    },
  });
}

/** Ejecución de una sesión asignada al atleta (con o sin comenzar). */
export async function findAthleteExecution(athleteId: string, sessionId: string): Promise<ExecutionDTO | null> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return null;
  return toExecution(assignment.session, await loadLog(assignment.id), assignment.overrides);
}

export type StartResult = { ok: true } | { ok: false; reason: "not-found" | "cancelled" | "future" };

/**
 * Comenzar o recuperar: crea el registro (idempotente si ya existe). Aplica la
 * misma regla que la interfaz (startAvailability): hoy y días anteriores sí,
 * futuras y canceladas no. Una ejecución existente se reutiliza, nunca se duplica
 * (además, session_logs.assignment_id es único).
 */
export async function startExecution(athleteId: string, sessionId: string, today: string): Promise<StartResult> {
  const assignment = await findAssignment(athleteId, sessionId);
  if (!assignment) return { ok: false, reason: "not-found" };
  const existing = await db().sessionLog.findUnique({ where: { assignmentId: assignment.id }, select: { id: true } });
  const availability = startAvailability({
    sessionStatus: assignment.session.status === "programada" ? "programada" : "cancelada",
    date: keyOf(assignment.session.scheduledDate),
    today,
    execution: existing ? "en_curso" : "sin_iniciar",
  });
  if (availability === "iniciada") return { ok: true };
  if (availability === "cancelada") return { ok: false, reason: "cancelled" };
  if (availability === "futura") return { ok: false, reason: "future" };
  try {
    await db().sessionLog.create({ data: { assignmentId: assignment.id }, select: { id: true } });
  } catch (error) {
    // Dos inicios simultáneos (p. ej. dos pestañas): el otro ya creó la ejecución (assignment_id es único). Se reutiliza.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  return { ok: true };
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
  const snapshot = effectivePlan(assignment.session.snapshot, assignment.overrides);
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
    where: coachAssignmentWhere(coachId, sessionId, athleteId),
    select: {
      id: true,
      status: true,
      athlete: { select: { profile: { select: { name: true } } } },
      session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
      overrides: { select: OVERRIDE_SELECT },
    },
  });
  if (!assignment?.athlete?.profile) return null;
  const log = await loadLog(assignment.id);
  // Un atleta retirado sin registro no tiene resultados que mostrar.
  if (assignment.status !== "asignada" && !log) return null;
  return { ...toExecution(assignment.session, log, assignment.overrides), athleteId, athleteName: assignment.athlete.profile.name };
}
