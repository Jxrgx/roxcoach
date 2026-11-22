import "server-only";

import { db } from "@/lib/db/prisma";
import type { RelationStatus } from "@/lib/invitations/rules";

/**
 * Relación coach–atleta. TODAS las consultas del coach filtran por su coachId:
 * un coach nunca puede leer ni modificar atletas ajenos aunque adivine un id.
 */

export interface RosterAthleteDTO {
  athleteId: string;
  name: string;
  email: string;
  division: string;
  status: Exclude<RelationStatus, "removed">;
  joinedAt: string;
}

export interface CoachAthleteDetailDTO extends RosterAthleteDTO {
  raceDate: string;
  availableDays: string[];
  equipment: string[];
  pausedAt: string | null;
}

export interface AthleteCoachDTO {
  coachName: string;
  gymName: string;
  status: Exclude<RelationStatus, "removed">;
}

function dateKey(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const CURRENT = { in: ["active", "paused"] as ("active" | "paused")[] };

/** Atletas actuales (activos y en pausa) del coach. */
export async function listCoachAthletes(coachId: string): Promise<RosterAthleteDTO[]> {
  const rows = await db().coachAthlete.findMany({
    where: { coachId, status: CURRENT },
    include: { athlete: { include: { profile: true } } },
    orderBy: [{ status: "asc" }, { joinedAt: "desc" }],
  });
  return rows.map((r) => ({
    athleteId: r.athleteId,
    name: r.athlete.profile.name,
    email: r.athlete.profile.email,
    division: r.athlete.division ?? "",
    status: r.status as "active" | "paused",
    joinedAt: r.joinedAt.toISOString(),
  }));
}

/** Detalle de un atleta del coach, o null si no está relacionado con él. */
export async function findCoachAthlete(coachId: string, athleteId: string): Promise<CoachAthleteDetailDTO | null> {
  const r = await db().coachAthlete.findFirst({
    where: { coachId, athleteId, status: CURRENT },
    include: { athlete: { include: { profile: true } } },
  });
  if (!r) return null;
  return {
    athleteId: r.athleteId,
    name: r.athlete.profile.name,
    email: r.athlete.profile.email,
    division: r.athlete.division ?? "",
    status: r.status as "active" | "paused",
    joinedAt: r.joinedAt.toISOString(),
    raceDate: dateKey(r.athlete.raceDate),
    availableDays: r.athlete.availableDays,
    equipment: r.athlete.equipment,
    pausedAt: r.pausedAt?.toISOString() ?? null,
  };
}

/** Coach actual del atleta (activo o en pausa). */
export async function findAthleteCoach(athleteId: string): Promise<(AthleteCoachDTO & { coachId: string }) | null> {
  const r = await db().coachAthlete.findFirst({
    where: { athleteId, status: CURRENT },
    include: { coach: { include: { profile: true } } },
  });
  if (!r) return null;
  return {
    coachId: r.coachId,
    coachName: r.coach.profile.name,
    gymName: r.coach.gymName ?? "",
    status: r.status as "active" | "paused",
  };
}

/** Cambia el estado de la relación solo si pertenece al coach y la transición es válida. */
export async function setRelationStatus(
  coachId: string,
  athleteId: string,
  from: "active" | "paused",
  to: "active" | "paused",
): Promise<boolean> {
  const now = new Date();
  const result = await db().coachAthlete.updateMany({
    where: { coachId, athleteId, status: from },
    data: to === "paused" ? { status: "paused", pausedAt: now } : { status: "active", pausedAt: null },
  });
  return result.count === 1;
}

/** El coach actualiza la información deportiva; exige relación ACTIVA con él. */
export async function updateSportsInfoAsCoach(
  coachId: string,
  athleteId: string,
  data: { division: string | null; raceDate: string | null; availableDays: string[]; equipment: string[] },
): Promise<boolean> {
  return db().$transaction(async (tx) => {
    const relation = await tx.coachAthlete.findFirst({ where: { coachId, athleteId, status: "active" }, select: { id: true } });
    if (!relation) return false;
    await tx.athleteProfile.update({
      where: { profileId: athleteId },
      data: {
        division: data.division,
        raceDate: data.raceDate ? new Date(`${data.raceDate}T00:00:00.000Z`) : null,
        availableDays: data.availableDays,
        equipment: data.equipment,
      },
    });
    return true;
  });
}
