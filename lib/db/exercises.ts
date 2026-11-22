import "server-only";

import { db } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  checkSubstitutions,
  exerciseOrigin,
  type ExerciseCategoryValue,
  type ExerciseDifficultyValue,
  type ExerciseOrigin,
  type MediaTypeValue,
  type SubstitutionError,
} from "@/lib/exercises/rules";

/**
 * Biblioteca de ejercicios. Visibilidad para el coach: sistema (coach_id NULL)
 * + los suyos. Escritura: solo los suyos (filtro coachId en cada consulta).
 */

export interface ExerciseListItemDTO {
  id: string;
  name: string;
  category: ExerciseCategoryValue;
  difficulty: ExerciseDifficultyValue;
  equipment: string[];
  cue: string;
  mediaType: MediaTypeValue | null;
  mediaUrl: string | null;
  origin: ExerciseOrigin;
  archived: boolean;
}

export interface SubstituteDTO {
  id: string;
  name: string;
  category: ExerciseCategoryValue;
  archived: boolean;
}

export interface ExerciseDetailDTO extends ExerciseListItemDTO {
  instructions: string;
  coachId: string | null;
  substitutes: SubstituteDTO[];
}

export interface ExerciseWriteData {
  name: string;
  category: ExerciseCategoryValue;
  difficulty: ExerciseDifficultyValue;
  instructions: string;
  cue: string | null;
  equipment: string[];
  mediaType: MediaTypeValue | null;
  mediaUrl: string | null;
  substituteIds: string[];
}

export type ExerciseWriteResult = { ok: true; id: string } | { ok: false; reason: "not-found" | SubstitutionError };

const visibleTo = (coachId: string): Prisma.ExerciseWhereInput => ({ OR: [{ coachId: null }, { coachId }] });

const DETAIL_INCLUDE = {
  substitutions: { orderBy: { position: "asc" }, include: { substitute: { select: { id: true, name: true, category: true, archivedAt: true } } } },
} satisfies Prisma.ExerciseInclude;

type ExerciseRow = Prisma.ExerciseGetPayload<object>;

function toListItem(e: ExerciseRow): ExerciseListItemDTO {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    difficulty: e.difficulty,
    equipment: e.equipment,
    cue: e.cue ?? "",
    mediaType: e.mediaType,
    mediaUrl: e.mediaUrl,
    origin: exerciseOrigin(e),
    archived: e.archivedAt !== null,
  };
}

function toDetail(e: Prisma.ExerciseGetPayload<{ include: typeof DETAIL_INCLUDE }>): ExerciseDetailDTO {
  return {
    ...toListItem(e),
    instructions: e.instructions,
    coachId: e.coachId,
    substitutes: e.substitutions.map((s) => ({
      id: s.substitute.id,
      name: s.substitute.name,
      category: s.substitute.category,
      archived: s.substitute.archivedAt !== null,
    })),
  };
}

/** Biblioteca completa del coach (sistema + propios, incluidos archivados propios). */
export async function listLibrary(coachId: string): Promise<ExerciseListItemDTO[]> {
  const rows = await db().exercise.findMany({ where: visibleTo(coachId), orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map(toListItem);
}

/** Candidatos a sustitución: visibles para el coach y no archivados. */
export async function listSubstitutionCandidates(coachId: string): Promise<SubstituteDTO[]> {
  const rows = await db().exercise.findMany({
    where: { AND: [visibleTo(coachId), { archivedAt: null }] },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, archived: false }));
}

/** Detalle para el coach: null si no existe o es de otro coach. */
export async function findExerciseForCoach(coachId: string, id: string): Promise<ExerciseDetailDTO | null> {
  const e = await db().exercise.findFirst({ where: { AND: [{ id }, visibleTo(coachId)] }, include: DETAIL_INCLUDE });
  return e ? toDetail(e) : null;
}

/**
 * Detalle para el atleta: ejercicios del sistema o de su coach actual (activo
 * o en pausa), no archivados. Las sustituciones archivadas no se muestran.
 */
export async function findExerciseForAthlete(athleteId: string, id: string): Promise<ExerciseDetailDTO | null> {
  const relation = await db().coachAthlete.findFirst({ where: { athleteId, status: { in: ["active", "paused"] } }, select: { coachId: true } });
  const e = await db().exercise.findFirst({
    where: { id, archivedAt: null, OR: [{ coachId: null }, ...(relation ? [{ coachId: relation.coachId }] : [])] },
    include: DETAIL_INCLUDE,
  });
  if (!e) return null;
  const detail = toDetail(e);
  return { ...detail, substitutes: detail.substitutes.filter((s) => !s.archived) };
}

async function availableSubstituteIds(tx: Prisma.TransactionClient, coachId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.exercise.findMany({ where: { AND: [{ id: { in: ids } }, visibleTo(coachId), { archivedAt: null }] }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

function exerciseFields(data: ExerciseWriteData) {
  return {
    name: data.name,
    category: data.category,
    difficulty: data.difficulty,
    instructions: data.instructions,
    cue: data.cue,
    equipment: data.equipment,
    mediaType: data.mediaType,
    mediaUrl: data.mediaUrl,
  };
}

export async function createExercise(coachId: string, data: ExerciseWriteData): Promise<ExerciseWriteResult> {
  return db().$transaction(async (tx) => {
    const problem = checkSubstitutions(data.substituteIds, { available: await availableSubstituteIds(tx, coachId, data.substituteIds) });
    if (problem) return { ok: false, reason: problem };
    const created = await tx.exercise.create({
      data: {
        ...exerciseFields(data),
        coachId,
        substitutions: { create: data.substituteIds.map((substituteId, position) => ({ substituteId, position })) },
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  });
}

/** Edita un ejercicio PROPIO (no archivado) y reemplaza sus sustituciones. */
export async function updateExercise(coachId: string, id: string, data: ExerciseWriteData): Promise<ExerciseWriteResult> {
  return db().$transaction(async (tx) => {
    const owned = await tx.exercise.findFirst({ where: { id, coachId, archivedAt: null }, select: { id: true } });
    if (!owned) return { ok: false, reason: "not-found" };
    const problem = checkSubstitutions(data.substituteIds, { exerciseId: id, available: await availableSubstituteIds(tx, coachId, data.substituteIds) });
    if (problem) return { ok: false, reason: problem };
    await tx.exercise.update({ where: { id }, data: exerciseFields(data) });
    await tx.exerciseSubstitution.deleteMany({ where: { exerciseId: id } });
    if (data.substituteIds.length) {
      await tx.exerciseSubstitution.createMany({ data: data.substituteIds.map((substituteId, position) => ({ exerciseId: id, substituteId, position })) });
    }
    return { ok: true, id };
  });
}

/** Archiva o restaura un ejercicio PROPIO. Nunca borra (preserva historial). */
export async function setExerciseArchived(coachId: string, id: string, archived: boolean): Promise<boolean> {
  const result = await db().exercise.updateMany({
    where: { id, coachId, archivedAt: archived ? null : { not: null } },
    data: { archivedAt: archived ? new Date() : null },
  });
  return result.count === 1;
}

/** Copia un ejercicio del sistema a la biblioteca del coach (con sus sustituciones). */
export async function duplicateSystemExercise(coachId: string, id: string): Promise<{ ok: true; id: string } | { ok: false }> {
  return db().$transaction(async (tx) => {
    const source = await tx.exercise.findFirst({ where: { id, coachId: null, archivedAt: null }, include: { substitutions: { orderBy: { position: "asc" } } } });
    if (!source) return { ok: false };
    const copy = await tx.exercise.create({
      data: {
        coachId,
        sourceId: source.id,
        name: `${source.name} (personalizado)`.slice(0, 80),
        category: source.category,
        difficulty: source.difficulty,
        instructions: source.instructions,
        cue: source.cue,
        equipment: source.equipment,
        mediaType: source.mediaType,
        mediaUrl: source.mediaUrl,
        substitutions: { create: source.substitutions.map((s) => ({ substituteId: s.substituteId, position: s.position })) },
      },
      select: { id: true },
    });
    return { ok: true, id: copy.id };
  });
}
