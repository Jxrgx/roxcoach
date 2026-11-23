import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { buildAlertCandidates, shouldResolveMissed, windowStart, type AlertKindValue, type AlertPriority, type ReadFilter } from "@/lib/alerts/rules";
import { setSlots } from "@/lib/execution/progress";
import { effectivePlan, OVERRIDE_SELECT } from "@/lib/db/overrides";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";

/**
 * Avisos del coach. Se generan a partir de datos reales y se guardan en
 * coach_alerts solo para conservar historial y estado leído.
 * - Idempotente: UNIQUE (coach, tipo, origen) + skipDuplicates (ON CONFLICT DO NOTHING).
 * - Resolución: un aviso que ya no requiere atención recibe resolved_at (una
 *   sola vez) y sale de pendientes; read_at nunca se toca.
 * - Visibles: avisos del coach cuyo atleta sigue ACTIVO con él (o cuya cuenta
 *   ya no existe: queda el historial sin enlace). Todo filtra por coachId.
 */

export interface AlertDTO {
  id: string;
  kind: AlertKindValue;
  priority: AlertPriority;
  title: string;
  description: string;
  athleteId: string | null;
  athleteName: string;
  sessionId: string | null;
  eventAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
}

const dateOf = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Sincroniza los avisos del coach: inserta los nuevos y resuelve los que ya no aplican. Una vez por petición. */
export const syncCoachAlerts = cache(async (coachId: string): Promise<number> => {
  const inserted = await insertNewAlerts(coachId);
  await resolveStaleAlerts(coachId);
  return inserted;
});

/**
 * Avisos "no iniciada" pendientes de resolver cuya asignación ya se comenzó,
 * se canceló, se retiró o ya no existe. UPDATE … WHERE resolved_at IS NULL:
 * repetirlo no cambia nada y no altera read_at.
 */
async function resolveStaleAlerts(coachId: string): Promise<number> {
  const open = await db().coachAlert.findMany({ where: { coachId, kind: "no_iniciada", resolvedAt: null }, select: { id: true, sourceId: true } });
  if (open.length === 0) return 0;
  const sources = await db().assignment.findMany({
    where: { id: { in: open.map((a) => a.sourceId) } },
    select: { id: true, status: true, session: { select: { status: true } }, log: { select: { id: true } } },
  });
  const byId = new Map(sources.map((a) => [a.id, a]));
  const toResolve = open.filter((alert) => {
    const a = byId.get(alert.sourceId);
    // Si la sesión llegó como null (borrada a mitad de la consulta), se trata como inexistente.
    return shouldResolveMissed(a?.session ? { assignmentStatus: a.status, sessionStatus: a.session.status, started: a.log !== null } : null);
  });
  if (toResolve.length === 0) return 0;
  const result = await db().coachAlert.updateMany({
    where: { coachId, id: { in: toResolve.map((a) => a.id) }, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return result.count;
}

/** Detecta eventos recientes de atletas activos e inserta los avisos que falten. */
async function insertNewAlerts(coachId: string): Promise<number> {
  const now = new Date();
  const today = todayKey(APP_TIME_ZONE, now);
  const since = windowStart(now);
  const relations = await db().coachAthlete.findMany({
    where: { coachId, status: "active" },
    select: { athleteId: true, athlete: { select: { profile: { select: { name: true } } } } },
  });
  const athletes = relations.flatMap((r) => (r.athlete?.profile ? [{ athleteId: r.athleteId, name: r.athlete.profile.name }] : []));
  if (athletes.length === 0) return 0;
  const ids = athletes.map((a) => a.athleteId);

  const [discomforts, logs, missed, invitations] = await Promise.all([
    db().discomfortReport.findMany({
      where: { createdAt: { gte: since }, sessionLog: { assignment: { athleteId: { in: ids }, session: { coachId } } } },
      select: {
        id: true,
        zone: true,
        intensity: true,
        blockIndex: true,
        exerciseIndex: true,
        createdAt: true,
        sessionLog: { select: { assignment: { select: { athleteId: true, overrides: { select: OVERRIDE_SELECT }, session: { select: { id: true, title: true, snapshot: true } } } } } },
      },
    }),
    db().sessionLog.findMany({
      where: {
        assignment: { athleteId: { in: ids }, status: "asignada", session: { coachId, status: "programada" } },
        OR: [{ status: "completada", finishedAt: { gte: since } }, { status: "en_curso", startedAt: { gte: since } }],
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        rpe: true,
        _count: { select: { sets: true } },
        assignment: { select: { athleteId: true, status: true, overrides: { select: OVERRIDE_SELECT }, session: { select: { id: true, title: true, status: true, snapshot: true } } } },
      },
    }),
    db().assignment.findMany({
      where: {
        athleteId: { in: ids },
        status: "asignada",
        log: { is: null },
        session: { coachId, status: "programada", scheduledDate: { gte: dateOf(todayKey(APP_TIME_ZONE, since)), lt: dateOf(today) } },
      },
      select: { id: true, athleteId: true, status: true, session: { select: { id: true, title: true, status: true, scheduledDate: true } } },
    }),
    db().invitation.findMany({
      where: { coachId, status: "accepted", acceptedAt: { gte: since }, acceptedById: { in: ids } },
      select: { id: true, acceptedById: true, acceptedAt: true },
    }),
  ]);

  // Prisma resuelve relaciones con consultas separadas: si algo se borró entre
  // ellas llega como null (aunque el tipo diga otra cosa). Se descarta.
  const candidates = buildAlertCandidates(
    {
      athletes,
      discomforts: discomforts.flatMap((d) => {
        const a = d.sessionLog?.assignment;
        if (!a?.session) return [];
        const snapshot = effectivePlan(a.session.snapshot, a.overrides);
        const exerciseName = d.blockIndex !== null && d.exerciseIndex !== null ? (snapshot.blocks[d.blockIndex]?.exercises[d.exerciseIndex]?.name ?? null) : null;
        return [{ id: d.id, athleteId: a.athleteId, sessionId: a.session.id, sessionTitle: a.session.title, zone: d.zone, intensity: d.intensity, exerciseName, createdAt: d.createdAt }];
      }),
      logs: logs.flatMap((l) => {
        const a = l.assignment;
        if (!a?.session) return [];
        // Series planeadas del plan PERSONALIZADO (series ajustadas, sin omitidos).
        const snapshot = effectivePlan(a.session.snapshot, a.overrides);
        return [
          {
            logId: l.id,
            athleteId: a.athleteId,
            sessionId: a.session.id,
            sessionTitle: a.session.title,
            sessionStatus: a.session.status,
            assignmentStatus: a.status,
            status: l.status,
            startedAt: l.startedAt,
            finishedAt: l.finishedAt,
            rpe: l.rpe,
            loggedSets: l._count.sets,
            plannedSets: setSlots(snapshot).length,
          },
        ];
      }),
      missed: missed.flatMap((m) =>
        m.session
          ? [
              {
                assignmentId: m.id,
                athleteId: m.athleteId,
                sessionId: m.session.id,
                sessionTitle: m.session.title,
                sessionStatus: m.session.status,
                assignmentStatus: m.status,
                date: m.session.scheduledDate.toISOString().slice(0, 10),
                started: false,
              },
            ]
          : [],
      ),
      relations: invitations.flatMap((i) => (i.acceptedById && i.acceptedAt ? [{ invitationId: i.id, athleteId: i.acceptedById, acceptedAt: i.acceptedAt }] : [])),
    },
    now,
    today,
  );
  if (candidates.length === 0) return 0;

  const data = candidates.map((c) => ({ coachId, ...c }));
  try {
    return (await db().coachAlert.createMany({ data, skipDuplicates: true })).count;
  } catch (error) {
    // Carrera: el origen (sesión o atleta) se borró entre la lectura y la
    // inserción. Se reintenta aviso por aviso y se omite solo el que falló.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")) throw error;
    let inserted = 0;
    for (const row of data) {
      try {
        inserted += (await db().coachAlert.createMany({ data: [row], skipDuplicates: true })).count;
      } catch (inner) {
        if (!(inner instanceof Prisma.PrismaClientKnownRequestError && inner.code === "P2003")) throw inner;
      }
    }
    return inserted;
  }
}

/** Filtro de visibilidad: avisos del coach de atletas activos con él (o cuya cuenta ya no existe). */
function visibleWhere(coachId: string): Prisma.CoachAlertWhereInput {
  return { coachId, OR: [{ athleteId: null }, { athlete: { coaches: { some: { coachId, status: "active" } } } }] };
}

const ORDER: Prisma.CoachAlertOrderByWithRelationInput[] = [{ priority: "asc" }, { eventAt: "desc" }];

export async function listCoachAlerts(coachId: string, filter: { read: ReadFilter; kind: AlertKindValue | null; take?: number }): Promise<AlertDTO[]> {
  const rows = await db().coachAlert.findMany({
    where: {
      ...visibleWhere(coachId),
      ...(filter.read === "sin-leer" ? { readAt: null, resolvedAt: null } : filter.read === "leidos" ? { readAt: { not: null } } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    },
    orderBy:
      filter.read === "leidos"
        ? [{ readAt: "desc" }, ...ORDER]
        : [{ readAt: { sort: "desc", nulls: "first" } }, { resolvedAt: { sort: "desc", nulls: "first" } }, ...ORDER],
    take: filter.take ?? 200,
    select: { id: true, kind: true, priority: true, title: true, description: true, athleteId: true, athleteName: true, sessionId: true, eventAt: true, readAt: true, resolvedAt: true },
  });
  return rows.map((r) => ({ ...r, priority: r.priority as AlertPriority }));
}

/** Pendientes = ni leídos ni resueltos. */
export async function countUnreadAlerts(coachId: string): Promise<number> {
  return db().coachAlert.count({ where: { ...visibleWhere(coachId), readAt: null, resolvedAt: null } });
}

/** Marca un aviso propio como leído. Uno ajeno (u oculto) se comporta como inexistente. */
export async function markAlertRead(coachId: string, id: string): Promise<"ok" | "not-found"> {
  const exists = await db().coachAlert.findFirst({ where: { ...visibleWhere(coachId), id }, select: { id: true, readAt: true } });
  if (!exists) return "not-found";
  if (!exists.readAt) await db().coachAlert.updateMany({ where: { id, coachId, readAt: null }, data: { readAt: new Date() } });
  return "ok";
}

/** Marca como leídos los pendientes visibles (los resueltos ya no requieren acción y no se tocan). */
export async function markAllAlertsRead(coachId: string): Promise<number> {
  const result = await db().coachAlert.updateMany({ where: { ...visibleWhere(coachId), readAt: null, resolvedAt: null }, data: { readAt: new Date() } });
  return result.count;
}
