import "server-only";

import { coachTemplateWhere } from "@/lib/db/access-rules";
import { db } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ExerciseCategoryValue } from "@/lib/exercises/rules";
import type { BlockExerciseWrite, TemplateWriteData } from "@/lib/workouts/convert";
import { publishProblems, type TargetTypeValue, type TemplateStatusValue, type WorkoutIntensityValue } from "@/lib/workouts/rules";

/**
 * Plantillas de entrenamiento. Todas las consultas filtran por el coachId de
 * la sesión: un coach nunca lee ni modifica plantillas ajenas.
 */

export interface TemplateListItemDTO {
  id: string;
  name: string;
  focus: string;
  intensity: WorkoutIntensityValue;
  estimatedMinutes: number | null;
  status: TemplateStatusValue;
  blockCount: number;
  exerciseCount: number;
  updatedAt: string;
}

export interface TemplateExerciseDTO extends BlockExerciseWrite {
  id: string;
  exerciseName: string;
  category: ExerciseCategoryValue;
  exerciseArchived: boolean;
  equipment: string[];
}

export interface TemplateDetailDTO extends Omit<TemplateListItemDTO, "blockCount" | "exerciseCount"> {
  blocks: { id: string; name: string; notes: string; exercises: TemplateExerciseDTO[] }[];
}

export type SaveTemplateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "exercise-unavailable" | "incomplete"; problems?: string[] };

const DETAIL_INCLUDE = {
  blocks: {
    orderBy: { position: "asc" },
    include: {
      exercises: {
        orderBy: { position: "asc" },
        include: { exercise: { select: { name: true, category: true, archivedAt: true, equipment: true } } },
      },
    },
  },
} satisfies Prisma.WorkoutTemplateInclude;

export async function listTemplates(coachId: string): Promise<TemplateListItemDTO[]> {
  const rows = await db().workoutTemplate.findMany({
    where: { coachId },
    include: { blocks: { select: { _count: { select: { exercises: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    focus: t.focus ?? "",
    intensity: t.intensity,
    estimatedMinutes: t.estimatedMinutes,
    status: t.status,
    blockCount: t.blocks.length,
    exerciseCount: t.blocks.reduce((n, b) => n + b._count.exercises, 0),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function findTemplateForCoach(coachId: string, id: string): Promise<TemplateDetailDTO | null> {
  const t = await db().workoutTemplate.findFirst({ where: coachTemplateWhere(coachId, id), include: DETAIL_INCLUDE });
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    focus: t.focus ?? "",
    intensity: t.intensity,
    estimatedMinutes: t.estimatedMinutes,
    status: t.status,
    updatedAt: t.updatedAt.toISOString(),
    blocks: t.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      notes: b.notes ?? "",
      exercises: b.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        exerciseName: e.exercise.name,
        category: e.exercise.category,
        exerciseArchived: e.exercise.archivedAt !== null,
        equipment: e.exercise.equipment,
        sets: e.sets,
        targetType: e.targetType as TargetTypeValue,
        reps: e.reps,
        distanceMeters: e.distanceMeters,
        durationSeconds: e.durationSeconds,
        loadKg: e.loadKg,
        restSeconds: e.restSeconds,
        notes: e.notes,
      })),
    })),
  };
}

function blocksCreate(data: TemplateWriteData) {
  return data.blocks.map((b, position) => ({
    position,
    name: b.name,
    notes: b.notes,
    exercises: { create: b.exercises.map((e, i) => ({ ...e, position: i })) },
  }));
}

/**
 * Crea o reemplaza una plantilla PROPIA en una transacción.
 * Ejercicios permitidos: del sistema o del coach. Los archivados solo se
 * aceptan si la plantilla ya los usaba (no se agregan nuevos archivados).
 * Una plantilla publicada debe seguir completa al guardarse.
 */
export async function saveTemplate(coachId: string, id: string | null, data: TemplateWriteData): Promise<SaveTemplateResult> {
  return db().$transaction(async (tx) => {
    let previousExerciseIds = new Set<string>();
    let status: TemplateStatusValue = "borrador";
    if (id) {
      const existing = await tx.workoutTemplate.findFirst({
        where: { id, coachId, status: { not: "archivada" } },
        select: { status: true, blocks: { select: { exercises: { select: { exerciseId: true } } } } },
      });
      if (!existing) return { ok: false, reason: "not-found" };
      status = existing.status;
      previousExerciseIds = new Set(existing.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)));
    }

    const ids = [...new Set(data.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)))];
    if (ids.length) {
      const visible = await tx.exercise.findMany({
        where: { id: { in: ids }, OR: [{ coachId: null }, { coachId }] },
        select: { id: true, archivedAt: true },
      });
      const usable = new Set(visible.filter((e) => e.archivedAt === null || previousExerciseIds.has(e.id)).map((e) => e.id));
      if (ids.some((x) => !usable.has(x))) return { ok: false, reason: "exercise-unavailable" };
    }

    if (status === "publicada") {
      const problems = publishProblems({
        estimatedMinutes: data.estimatedMinutes,
        blocks: data.blocks.map((b) => ({ name: b.name, exerciseCount: b.exercises.length })),
      });
      if (problems.length) return { ok: false, reason: "incomplete", problems };
    }

    const fields = { name: data.name, focus: data.focus, intensity: data.intensity, estimatedMinutes: data.estimatedMinutes };
    if (!id) {
      const created = await tx.workoutTemplate.create({ data: { ...fields, coachId, blocks: { create: blocksCreate(data) } }, select: { id: true } });
      return { ok: true, id: created.id };
    }
    await tx.workoutBlock.deleteMany({ where: { templateId: id } });
    await tx.workoutTemplate.update({ where: { id }, data: { ...fields, blocks: { create: blocksCreate(data) } } });
    return { ok: true, id };
  });
}

export type StatusChangeResult = { ok: true } | { ok: false; reason: "not-found" | "incomplete"; problems?: string[] };

/** Cambia el estado de una plantilla PROPIA si la transición es válida. */
export async function changeTemplateStatus(coachId: string, id: string, to: TemplateStatusValue): Promise<StatusChangeResult> {
  return db().$transaction(async (tx) => {
    const t = await tx.workoutTemplate.findFirst({
      where: { id, coachId },
      select: { status: true, estimatedMinutes: true, blocks: { select: { name: true, _count: { select: { exercises: true } } } } },
    });
    if (!t) return { ok: false, reason: "not-found" };
    const allowed: Record<TemplateStatusValue, TemplateStatusValue[]> = {
      borrador: ["publicada", "archivada"],
      publicada: ["borrador", "archivada"],
      archivada: ["borrador"],
    };
    if (!allowed[t.status].includes(to)) return { ok: false, reason: "not-found" };
    if (to === "publicada") {
      const problems = publishProblems({
        estimatedMinutes: t.estimatedMinutes,
        blocks: t.blocks.map((b) => ({ name: b.name, exerciseCount: b._count.exercises })),
      });
      if (problems.length) return { ok: false, reason: "incomplete", problems };
    }
    await tx.workoutTemplate.update({ where: { id }, data: { status: to } });
    return { ok: true };
  });
}

/** Duplica una plantilla PROPIA como borrador nuevo. */
export async function duplicateTemplate(coachId: string, id: string): Promise<{ ok: true; id: string } | { ok: false }> {
  return db().$transaction(async (tx) => {
    const t = await tx.workoutTemplate.findFirst({ where: { id, coachId }, include: { blocks: { orderBy: { position: "asc" }, include: { exercises: { orderBy: { position: "asc" } } } } } });
    if (!t) return { ok: false };
    const copy = await tx.workoutTemplate.create({
      data: {
        coachId,
        name: `${t.name} (copia)`.slice(0, 80),
        focus: t.focus,
        intensity: t.intensity,
        estimatedMinutes: t.estimatedMinutes,
        status: "borrador",
        blocks: {
          create: t.blocks.map((b) => ({
            position: b.position,
            name: b.name,
            notes: b.notes,
            exercises: {
              create: b.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                position: e.position,
                sets: e.sets,
                targetType: e.targetType,
                reps: e.reps,
                distanceMeters: e.distanceMeters,
                durationSeconds: e.durationSeconds,
                loadKg: e.loadKg,
                restSeconds: e.restSeconds,
                notes: e.notes,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    return { ok: true, id: copy.id };
  });
}
