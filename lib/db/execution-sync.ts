import "server-only";

import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { effectivePlan, OVERRIDE_SELECT } from "@/lib/db/overrides";
import { isValidPosition } from "@/lib/execution/progress";
import type { EffectivePlan } from "@/lib/overrides/apply";
import type { OpResult, WireOp } from "@/lib/offline/queue";
import { clampClientTime, CONFLICT_MESSAGE, decideSetWrite, invalidOpReason, MAX_BATCH } from "@/lib/offline/server-rules";
import { validateSetLog } from "@/lib/validations";
import type { WeightUnit } from "@/lib/workouts/rules";
import { logError } from "@/lib/log";

/**
 * Procesa la cola de la ejecución de UN atleta (fase 11), en orden. Cada
 * operación va en su propia transacción junto con su registro en
 * execution_ops: si ya se procesó, responde "duplicate" sin aplicarla otra vez.
 * Se detiene en el primer error temporal ("retry"); las siguientes quedan
 * "skipped" para conservar el orden.
 */

type Tx = Prisma.TransactionClient;
const KIND_DB = { logSet: "log_set", pause: "pause", resume: "resume", finish: "finish" } as const;

class Rejected extends Error {}

export async function processExecutionOps(athlete: { id: string; weightUnit: WeightUnit }, sessionId: string, raw: unknown): Promise<OpResult[]> {
  const ops = Array.isArray(raw) ? raw.slice(0, MAX_BATCH) : [];
  const ids = (o: unknown) => (o && typeof o === "object" && typeof (o as WireOp).opId === "string" ? (o as WireOp).opId : "");

  const assignment = await db().assignment.findFirst({
    where: { sessionId, athleteId: athlete.id, status: "asignada" },
    select: { id: true, session: { select: { snapshot: true } }, overrides: { select: OVERRIDE_SELECT }, log: { select: { id: true } } },
  });
  if (!assignment?.session || !assignment.log) {
    const message = !assignment ? "Esta sesión ya no está en tu agenda." : "La sesión no se ha comenzado.";
    return ops.map((o) => ({ opId: ids(o), outcome: "rejected" as const, message }));
  }
  const logId = assignment.log.id;
  // Plan personalizado vigente (los ajustes no cambian una vez comenzada la sesión).
  const plan = effectivePlan(assignment.session.snapshot, assignment.overrides);

  const results: OpResult[] = [];
  let stopped = false;
  for (const o of ops) {
    const opId = ids(o);
    if (stopped) {
      results.push({ opId, outcome: "skipped" });
      continue;
    }
    const invalid = invalidOpReason(o);
    if (invalid) {
      results.push({ opId, outcome: "rejected", message: invalid });
      continue;
    }
    try {
      results.push(await db().$transaction((tx) => processOne(tx, o as WireOp, logId, plan, athlete.weightUnit)));
    } catch (error) {
      if (error instanceof Rejected) results.push({ opId, outcome: "rejected", message: error.message });
      else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Otra petición procesó la misma operación al mismo tiempo.
        results.push({ opId, outcome: "duplicate" });
      } else if (error instanceof Error && /23514|solo se registran|no existe|omitido/i.test(error.message)) {
        results.push({ opId, outcome: "rejected", message: "El servidor rechazó la serie: no corresponde a tu plan vigente." });
      } else {
        logError("processExecutionOps", error);
        results.push({ opId, outcome: "retry", message: "No se pudo enviar. Se reintentará." });
        stopped = true;
      }
    }
  }
  return results;
}

async function processOne(tx: Tx, op: WireOp, logId: string, plan: EffectivePlan, unit: WeightUnit): Promise<OpResult> {
  const seen = await tx.executionOp.findUnique({ where: { opId: op.opId }, select: { sessionLogId: true } });
  if (seen) {
    if (seen.sessionLogId !== logId) throw new Rejected("Operación inválida.");
    const set = op.kind === "logSet" ? await tx.setLog.findUnique({ where: { clientOpId: op.opId } }) : null;
    // Una finalización ya procesada (p. ej. la respuesta se perdió al recargar) sigue
    // significando "sesión finalizada": el cliente debe ir al resumen.
    return { opId: op.opId, outcome: "duplicate", ...(set ? { set: toSet(set) } : {}), ...(op.kind === "finish" ? { finished: true } : {}) };
  }

  const log = await tx.sessionLog.findUniqueOrThrow({ where: { id: logId }, select: { status: true, startedAt: true, pausedAt: true, pausedSeconds: true } });
  if (log.status === "completada") {
    if (op.kind === "finish") return { opId: op.opId, outcome: "duplicate", finished: true };
    return { opId: op.opId, outcome: "conflict", message: CONFLICT_MESSAGE.finished };
  }

  const now = new Date();
  // Las acciones del dispositivo se ordenan: nunca antes de la última ya aplicada.
  const last = await tx.executionOp.aggregate({ where: { sessionLogId: logId }, _max: { clientAt: true } });
  const floor = new Date(Math.max(log.startedAt.getTime(), last._max.clientAt?.getTime() ?? 0));
  const record = (clientAt: Date) => tx.executionOp.create({ data: { opId: op.opId, sessionLogId: logId, kind: KIND_DB[op.kind], clientAt } });

  if (op.kind === "logSet") {
    const p = op.position!;
    const position = { blockIndex: p.blockIndex, exerciseIndex: p.exerciseIndex, setNumber: p.setNumber };
    if (!isValidPosition(plan, position)) throw new Rejected("Esta serie no existe en tu plan (pudo omitirse o cambiar).");
    if (log.pausedAt) throw new Rejected("La sesión estaba en pausa cuando se registró esta serie.");
    // Lo planeado sale del plan del servidor, nunca del cliente.
    const planned = plan.blocks[p.blockIndex]!.exercises[p.exerciseIndex]!;
    const validated = validateSetLog(op.input!, planned, unit);
    if (!validated.ok) throw new Rejected(`Datos de la serie inválidos: ${Object.values(validated.errors)[0] ?? "revisa los valores"}`);

    const where = { sessionLogId_blockIndex_exerciseIndex_setNumber: { sessionLogId: logId, ...position } };
    const existing = await tx.setLog.findUnique({ where });
    const decision = decideSetWrite(existing, op.expect!, op.opId);
    if (decision === "duplicate") return { opId: op.opId, outcome: "duplicate", set: toSet(existing!) };
    if (decision === "conflict-existing") return { opId: op.opId, outcome: "conflict", message: CONFLICT_MESSAGE.existing };
    if (decision === "conflict-changed") return { opId: op.opId, outcome: "conflict", message: CONFLICT_MESSAGE.changed };

    const recordedAt = clampClientTime(op.clientAt, { min: log.startedAt, max: now });
    const data = { ...validated.value, clientOpId: op.opId, recordedAt };
    const saved = await tx.setLog.upsert({ where, create: { sessionLogId: logId, ...position, ...data }, update: data });
    await record(recordedAt);
    return { opId: op.opId, outcome: "applied", set: toSet(saved) };
  }

  if (op.kind === "pause") {
    if (log.pausedAt) {
      await record(clampClientTime(op.clientAt, { min: floor, max: now }));
      return { opId: op.opId, outcome: "applied", times: times(log.pausedAt, log.pausedSeconds) };
    }
    const at = clampClientTime(op.clientAt, { min: floor, max: now });
    await tx.sessionLog.update({ where: { id: logId }, data: { pausedAt: at } });
    await record(at);
    return { opId: op.opId, outcome: "applied", times: times(at, log.pausedSeconds) };
  }

  if (op.kind === "resume") {
    if (!log.pausedAt) {
      await record(clampClientTime(op.clientAt, { min: floor, max: now }));
      return { opId: op.opId, outcome: "applied", times: times(null, log.pausedSeconds) };
    }
    const at = clampClientTime(op.clientAt, { min: new Date(Math.max(floor.getTime(), log.pausedAt.getTime())), max: now });
    const added = Math.max(0, Math.round((at.getTime() - log.pausedAt.getTime()) / 1000));
    await tx.sessionLog.update({ where: { id: logId }, data: { pausedAt: null, pausedSeconds: { increment: added } } });
    await record(at);
    return { opId: op.opId, outcome: "applied", times: times(null, log.pausedSeconds + added) };
  }

  // finish: cierra la pausa abierta con la misma hora y finaliza.
  const min = new Date(Math.max(floor.getTime(), log.pausedAt?.getTime() ?? 0));
  const at = clampClientTime(op.clientAt, { min, max: now });
  const added = log.pausedAt ? Math.max(0, Math.round((at.getTime() - log.pausedAt.getTime()) / 1000)) : 0;
  await tx.sessionLog.update({ where: { id: logId }, data: { status: "completada", finishedAt: at, pausedAt: null, pausedSeconds: { increment: added } } });
  await record(at);
  return { opId: op.opId, outcome: "applied", finished: true };
}

const times = (pausedAt: Date | null, pausedSeconds: number) => ({ pausedAt: pausedAt?.toISOString() ?? null, pausedSeconds });

function toSet(s: {
  blockIndex: number;
  exerciseIndex: number;
  setNumber: number;
  actualReps: number | null;
  actualDistanceMeters: number | null;
  actualDurationSeconds: number | null;
  actualLoadKg: number | null;
  rpe: number | null;
  clientOpId: string | null;
}) {
  return {
    blockIndex: s.blockIndex,
    exerciseIndex: s.exerciseIndex,
    setNumber: s.setNumber,
    actualReps: s.actualReps,
    actualDistanceMeters: s.actualDistanceMeters,
    actualDurationSeconds: s.actualDurationSeconds,
    actualLoadKg: s.actualLoadKg,
    rpe: s.rpe,
    clientOpId: s.clientOpId,
  };
}
