import "server-only";

import { db } from "@/lib/db/prisma";
import {
  athleteAssignmentWhere,
  athleteSessionWhere,
  coachAssignmentWhere,
  coachAthleteWhere,
  coachSessionWhere,
  coachTemplateWhere,
  CURRENT_RELATION,
  exerciseVisibleToAthlete,
  exerciseVisibleToCoach,
} from "@/lib/db/access-rules";
import type { DetailMatch } from "@/lib/http/detail-routes";

/**
 * ¿Puede este usuario ver el recurso de una ruta de detalle? Lo usa el proxy
 * en cargas directas para responder 404 REAL antes de renderizar.
 *
 * Usa las mismas cláusulas que las páginas (`lib/db/access-rules.ts`) y nunca
 * es más estricta que ellas: si dice "visible", la página aún verifica todo
 * (y puede mostrar "no encontrado" por streaming); si dice "no visible", la
 * página tampoco lo mostraría. Solo selecciona ids (consultas mínimas).
 * Los ids ya vienen validados como UUID.
 */
export async function isDetailVisible(match: DetailMatch, userId: string): Promise<boolean> {
  const [a, b] = match.ids as [string, string | undefined];
  const one = { select: { id: true } } as const;
  switch (match.kind) {
    case "coach-atleta":
    case "coach-progreso-atleta":
      return Boolean(await db().coachAthlete.findFirst({ where: coachAthleteWhere(userId, a), ...one }));
    case "coach-ejercicio":
      return Boolean(await db().exercise.findFirst({ where: { AND: [{ id: a }, exerciseVisibleToCoach(userId)] }, ...one }));
    case "coach-ejercicio-editar":
      // Solo los propios y no archivados se editan (coachCanEdit + archived en la página).
      return Boolean(await db().exercise.findFirst({ where: { id: a, coachId: userId, archivedAt: null }, ...one }));
    case "coach-plantilla":
      return Boolean(await db().workoutTemplate.findFirst({ where: coachTemplateWhere(userId, a), ...one }));
    case "coach-plantilla-editar":
      // canEditTemplate: todo menos archivada.
      return Boolean(await db().workoutTemplate.findFirst({ where: { AND: [coachTemplateWhere(userId, a), { status: { not: "archivada" } }] }, ...one }));
    case "coach-sesion":
      return Boolean(await db().scheduledSession.findFirst({ where: coachSessionWhere(userId, a), ...one }));
    case "coach-sesion-atleta":
      return Boolean(await db().assignment.findFirst({ where: coachAssignmentWhere(userId, a, b!), ...one }));
    case "atleta-sesion":
      return Boolean(await db().scheduledSession.findFirst({ where: athleteSessionWhere(userId, a), ...one }));
    case "atleta-ejecucion":
      return Boolean(await db().assignment.findFirst({ where: athleteAssignmentWhere(userId, a), ...one }));
    case "atleta-ejercicio": {
      const relation = await db().coachAthlete.findFirst({ where: { athleteId: userId, status: CURRENT_RELATION }, select: { coachId: true } });
      return Boolean(await db().exercise.findFirst({ where: exerciseVisibleToAthlete(a, relation?.coachId ?? null), ...one }));
    }
  }
}
