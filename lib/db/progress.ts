import "server-only";

import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseSnapshot, type SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { ProgressRecord } from "@/lib/progress/metrics";

/**
 * Datos para el progreso: asignaciones con su sesión, registro, series y
 * molestias. Solo lectura y sin métricas guardadas: todo se calcula en
 * lib/progress a partir de estas filas.
 * La BD ya filtra lo que nunca cuenta: asignaciones retiradas y sesiones
 * canceladas (las funciones puras lo vuelven a excluir por seguridad).
 */

const EMPTY_SNAPSHOT: SessionSnapshotV1 = { version: 1, templateName: "", focus: null, intensity: "media", estimatedMinutes: null, blocks: [] };

const PROGRESS_SELECT = {
  athleteId: true,
  status: true,
  session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
  log: {
    select: {
      status: true,
      startedAt: true,
      finishedAt: true,
      pausedAt: true,
      pausedSeconds: true,
      rpe: true,
      sets: {
        select: {
          blockIndex: true,
          exerciseIndex: true,
          setNumber: true,
          actualReps: true,
          actualDistanceMeters: true,
          actualDurationSeconds: true,
          actualLoadKg: true,
          rpe: true,
        },
      },
      discomforts: { select: { id: true, zone: true, intensity: true, note: true, blockIndex: true, exerciseIndex: true, createdAt: true } },
    },
  },
} satisfies Prisma.AssignmentSelect;

type Row = Prisma.AssignmentGetPayload<{ select: typeof PROGRESS_SELECT }>;

/**
 * Prisma resuelve las relaciones con consultas separadas: si la sesión se borra
 * entre ellas, llega como null aunque el tipo diga lo contrario. Se descarta.
 */
const hasSession = (row: Row) => (row as { session: Row["session"] | null }).session !== null;

function toRecord(a: Row): ProgressRecord {
  const snapshot = parseSnapshot(a.session.snapshot) ?? EMPTY_SNAPSHOT;
  return {
    sessionId: a.session.id,
    title: a.session.title,
    date: a.session.scheduledDate.toISOString().slice(0, 10),
    sessionStatus: a.session.status,
    assignmentStatus: a.status,
    snapshot,
    log: a.log
      ? {
          status: a.log.status,
          startedAt: a.log.startedAt,
          finishedAt: a.log.finishedAt,
          pausedAt: a.log.pausedAt,
          pausedSeconds: a.log.pausedSeconds,
          rpe: a.log.rpe,
        }
      : null,
    sets: a.log?.sets ?? [],
    discomforts: (a.log?.discomforts ?? []).map((d) => ({
      id: d.id,
      zone: d.zone,
      intensity: d.intensity,
      note: d.note,
      exerciseName: d.blockIndex !== null && d.exerciseIndex !== null ? (snapshot.blocks[d.blockIndex]?.exercises[d.exerciseIndex]?.name ?? null) : null,
      createdAt: d.createdAt,
    })),
  };
}

const COUNTED = { status: "asignada" as const, session: { status: "programada" as const } };

/** Progreso propio del atleta (todas sus sesiones vigentes, de cualquier coach). */
export async function listAthleteProgressRecords(athleteId: string): Promise<ProgressRecord[]> {
  const rows = await db().assignment.findMany({ where: { athleteId, ...COUNTED }, select: PROGRESS_SELECT });
  return rows.filter(hasSession).map(toRecord);
}

export interface CoachProgressAthlete {
  athleteId: string;
  name: string;
  relationStatus: "active" | "paused";
}

/** Atletas que hoy pertenecen al coach (activos y en pausa). */
export async function listCoachProgressAthletes(coachId: string): Promise<CoachProgressAthlete[]> {
  const rows = await db().coachAthlete.findMany({
    where: { coachId, status: { in: ["active", "paused"] } },
    select: { athleteId: true, status: true, athlete: { select: { profile: { select: { name: true } } } } },
  });
  return rows
    .flatMap((r) =>
      r.athlete?.profile && r.status !== "removed" ? [{ athleteId: r.athleteId, name: r.athlete.profile.name, relationStatus: r.status }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Asignaciones de esos atletas en sesiones DEL COACH (nunca de otro coach).
 * `athleteIds` debe venir de listCoachProgressAthletes (no del cliente).
 */
export async function listCoachProgressRecords(coachId: string, athleteIds: string[]): Promise<Map<string, ProgressRecord[]>> {
  const byAthlete = new Map<string, ProgressRecord[]>(athleteIds.map((id) => [id, []]));
  if (athleteIds.length === 0) return byAthlete;
  const rows = await db().assignment.findMany({
    where: { athleteId: { in: athleteIds }, status: "asignada", session: { coachId, status: "programada" } },
    select: PROGRESS_SELECT,
  });
  for (const row of rows.filter(hasSession)) byAthlete.get(row.athleteId)?.push(toRecord(row));
  return byAthlete;
}
