import "server-only";

import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { applyOverrides, overrideLock, type EffectivePlan, type OverrideLock, type OverrideRow, type ReplacementOption } from "@/lib/overrides/apply";
import { parseSnapshot, type SessionSnapshotV1 } from "@/lib/scheduling/snapshot";

/**
 * Personalización por asignación (fase 10). Solo escribe en
 * assignment_overrides; nunca en la plantilla ni en el snapshot de la sesión.
 * Todo lo del coach filtra por su coachId y exige relación con el atleta.
 */

export const OVERRIDE_SELECT = {
  blockIndex: true,
  exerciseIndex: true,
  skipped: true,
  overrideSets: true,
  overrideReps: true,
  overrideDistanceMeters: true,
  overrideDurationSeconds: true,
  overrideLoadKg: true,
  removeLoad: true,
  overrideRestSeconds: true,
  note: true,
  replacementExerciseId: true,
  replacementName: true,
  replacementCategory: true,
  replacementEquipment: true,
} satisfies Prisma.AssignmentOverrideSelect;

type OverrideDbRow = Prisma.AssignmentOverrideGetPayload<{ select: typeof OVERRIDE_SELECT }>;

export function toOverrideRow(o: OverrideDbRow): OverrideRow {
  return {
    blockIndex: o.blockIndex,
    exerciseIndex: o.exerciseIndex,
    skipped: o.skipped,
    sets: o.overrideSets,
    reps: o.overrideReps,
    distanceMeters: o.overrideDistanceMeters,
    durationSeconds: o.overrideDurationSeconds,
    loadKg: o.overrideLoadKg,
    removeLoad: o.removeLoad,
    restSeconds: o.overrideRestSeconds,
    note: o.note,
    replacement:
      o.replacementName && o.replacementCategory
        ? { exerciseId: o.replacementExerciseId, name: o.replacementName, category: o.replacementCategory, equipment: o.replacementEquipment ?? [] }
        : null,
  };
}

const EMPTY_SNAPSHOT: SessionSnapshotV1 = { version: 1, templateName: "", focus: null, intensity: "media", estimatedMinutes: null, blocks: [] };

/** Plan efectivo de una asignación: snapshot (JSON de la BD) + sus ajustes. */
export function effectivePlan(snapshotJson: unknown, overrides: OverrideDbRow[] | undefined | null): EffectivePlan {
  return applyOverrides(parseSnapshot(snapshotJson) ?? EMPTY_SNAPSHOT, (overrides ?? []).map(toOverrideRow));
}

export interface AssignmentForOverrideDTO {
  sessionId: string;
  title: string;
  date: string;
  athleteId: string;
  athleteName: string;
  snapshot: SessionSnapshotV1;
  overrides: OverrideRow[];
  lock: OverrideLock;
  lastEdit: { at: Date; by: string | null } | null;
}

/** Asignación de un atleta en una sesión propia del coach (null si no existe o no le pertenece). */
export async function findAssignmentForOverride(coachId: string, sessionId: string, athleteId: string): Promise<AssignmentForOverrideDTO | null> {
  const [assignment, relation] = await Promise.all([
    db().assignment.findFirst({
      where: { sessionId, athleteId, session: { coachId } },
      select: {
        status: true,
        athlete: { select: { profile: { select: { name: true } } } },
        session: { select: { id: true, title: true, scheduledDate: true, status: true, snapshot: true } },
        log: { select: { id: true } },
        overrides: { select: { ...OVERRIDE_SELECT, updatedAt: true, updatedBy: { select: { profile: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" } },
      },
    }),
    db().coachAthlete.findFirst({ where: { coachId, athleteId, status: { in: ["active", "paused"] } }, select: { status: true } }),
  ]);
  if (!assignment?.session || !assignment.athlete?.profile || !relation) return null;
  const last = assignment.overrides[0];
  return {
    sessionId: assignment.session.id,
    title: assignment.session.title,
    date: assignment.session.scheduledDate.toISOString().slice(0, 10),
    athleteId,
    athleteName: assignment.athlete.profile.name,
    snapshot: parseSnapshot(assignment.session.snapshot) ?? EMPTY_SNAPSHOT,
    overrides: assignment.overrides.map(toOverrideRow),
    lock: overrideLock({
      sessionStatus: assignment.session.status,
      assignmentStatus: assignment.status,
      started: assignment.log !== null,
      relationActive: relation.status === "active",
    }),
    lastEdit: last ? { at: last.updatedAt, by: last.updatedBy?.profile?.name ?? null } : null,
  };
}

/** Reemplazos autorizados: ejercicios del sistema o del coach, no archivados (cualquier categoría). */
export async function listReplacementOptions(coachId: string, originalIds: string[]): Promise<{ options: ReplacementOption[]; suggested: Record<string, string[]> }> {
  const [exercises, substitutions] = await Promise.all([
    db().exercise.findMany({
      where: { archivedAt: null, OR: [{ coachId: null }, { coachId }] },
      select: { id: true, name: true, category: true, equipment: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    db().exerciseSubstitution.findMany({ where: { exerciseId: { in: originalIds } }, select: { exerciseId: true, substituteId: true }, orderBy: { position: "asc" } }),
  ]);
  const suggested: Record<string, string[]> = {};
  for (const s of substitutions) (suggested[s.exerciseId] ??= []).push(s.substituteId);
  return { options: exercises, suggested };
}

export type SaveOverridesResult = { ok: true } | { ok: false; reason: "not-found" | Exclude<OverrideLock, "editable"> };

/**
 * Reemplaza los ajustes de la asignación por `rows` (ya validadas contra el
 * snapshot y los reemplazos autorizados) en una transacción. Repite los
 * bloqueos aquí y el trigger de la BD los vuelve a revisar.
 */
export async function saveAssignmentOverrides(coachId: string, sessionId: string, athleteId: string, rows: OverrideRow[]): Promise<SaveOverridesResult> {
  try {
    return await db().$transaction(async (tx) => {
      const [assignment, relation] = await Promise.all([
        tx.assignment.findFirst({
          where: { sessionId, athleteId, session: { coachId } },
          select: { id: true, status: true, session: { select: { status: true } }, log: { select: { id: true } } },
        }),
        tx.coachAthlete.findFirst({ where: { coachId, athleteId, status: { in: ["active", "paused"] } }, select: { status: true } }),
      ]);
      if (!assignment?.session || !relation) return { ok: false as const, reason: "not-found" as const };
      const lock = overrideLock({
        sessionStatus: assignment.session.status,
        assignmentStatus: assignment.status,
        started: assignment.log !== null,
        relationActive: relation.status === "active",
      });
      if (lock !== "editable") return { ok: false as const, reason: lock };

      const keep = rows.map((r) => ({ blockIndex: r.blockIndex, exerciseIndex: r.exerciseIndex }));
      await tx.assignmentOverride.deleteMany({
        where: { assignmentId: assignment.id, NOT: keep.length ? { OR: keep } : undefined },
      });
      for (const r of rows) {
        const data = {
          skipped: r.skipped,
          overrideSets: r.sets,
          overrideReps: r.reps,
          overrideDistanceMeters: r.distanceMeters,
          overrideDurationSeconds: r.durationSeconds,
          overrideLoadKg: r.loadKg,
          removeLoad: r.removeLoad,
          overrideRestSeconds: r.restSeconds,
          note: r.note,
          replacementExerciseId: r.replacement?.exerciseId ?? null,
          replacementName: r.replacement?.name ?? null,
          replacementCategory: (r.replacement?.category ?? null) as Prisma.AssignmentOverrideUncheckedCreateInput["replacementCategory"],
          replacementEquipment: r.replacement?.equipment ?? [],
          updatedById: coachId,
        };
        await tx.assignmentOverride.upsert({
          where: { assignmentId_blockIndex_exerciseIndex: { assignmentId: assignment.id, blockIndex: r.blockIndex, exerciseIndex: r.exerciseIndex } },
          create: { assignmentId: assignment.id, blockIndex: r.blockIndex, exerciseIndex: r.exerciseIndex, createdById: coachId, ...data },
          update: data,
        });
      }
      return { ok: true as const };
    });
  } catch (error) {
    // El trigger rechazó el cambio (p. ej. el atleta comenzó justo ahora).
    if (error instanceof Error && /personalizaci[oó]n est[aá] bloqueada/.test(error.message)) return { ok: false, reason: "started" };
    throw error;
  }
}
