import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Reglas de visibilidad de los recursos de detalle (cláusulas `where` de Prisma).
 * Fuente ÚNICA: las usan las funciones de `lib/db/*` que cargan cada detalle y
 * las comprobaciones de `lib/db/visibility.ts` que el proxy ejecuta antes de
 * renderizar (para responder 404 real). Así la regla no se duplica.
 *
 * Toda regla filtra por el dueño (coach) o por la asignación vigente (atleta):
 * nunca se ve un recurso de otro usuario.
 */

/** Relación vigente coach–atleta (activa o en pausa). */
export const CURRENT_RELATION = { in: ["active", "paused"] as ("active" | "paused")[] };

export const coachAthleteWhere = (coachId: string, athleteId: string): Prisma.CoachAthleteWhereInput => ({
  coachId,
  athleteId,
  status: CURRENT_RELATION,
});

/** Ejercicios que ve un coach: los del sistema y los suyos. */
export const exerciseVisibleToCoach = (coachId: string): Prisma.ExerciseWhereInput => ({ OR: [{ coachId: null }, { coachId }] });

/** Ejercicios que ve un atleta: los del sistema y los no archivados de su coach actual. */
export const exerciseVisibleToAthlete = (id: string, coachId: string | null): Prisma.ExerciseWhereInput => ({
  id,
  archivedAt: null,
  OR: [{ coachId: null }, ...(coachId ? [{ coachId }] : [])],
});

export const coachTemplateWhere = (coachId: string, id: string): Prisma.WorkoutTemplateWhereInput => ({ id, coachId });

export const coachSessionWhere = (coachId: string, id: string): Prisma.ScheduledSessionWhereInput => ({ id, coachId });

/** Asignación de un atleta en una sesión del coach (cualquier estado). */
export const coachAssignmentWhere = (coachId: string, sessionId: string, athleteId: string): Prisma.AssignmentWhereInput => ({
  sessionId,
  athleteId,
  session: { coachId },
});

/** Sesión con una asignación vigente del atleta. */
export const athleteSessionWhere = (athleteId: string, id: string): Prisma.ScheduledSessionWhereInput => ({
  id,
  assignments: { some: { athleteId, status: "asignada" } },
});

/** Asignación vigente del atleta en una sesión. */
export const athleteAssignmentWhere = (athleteId: string, sessionId: string): Prisma.AssignmentWhereInput => ({
  sessionId,
  athleteId,
  status: "asignada",
});
