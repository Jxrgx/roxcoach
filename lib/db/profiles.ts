import "server-only";

import { db } from "@/lib/db/prisma";
import type { Role } from "@/lib/types/domain";

/**
 * Acceso a perfiles. Única capa que consulta la base de datos para perfiles:
 * ningún componente visual importa Prisma.
 *
 * Devuelve objetos planos (DTO) con solo lo que la interfaz necesita.
 */

export interface ProfileDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface CoachProfileDTO extends ProfileDTO {
  role: "coach";
  gymName: string;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
}

export interface AthleteProfileDTO extends ProfileDTO {
  role: "athlete";
  division: string;
  /** "YYYY-MM-DD" o "" si no la ha definido. */
  raceDate: string;
  availableDays: string[];
  equipment: string[];
  weightUnit: "kg" | "lb";
}

export async function findProfile(userId: string): Promise<ProfileDTO | null> {
  const p = await db().profile.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true } });
  return p;
}

const COACH_SELECT = { gymName: true, weightUnit: true, distanceUnit: true } as const;
const ATHLETE_SELECT = { division: true, raceDate: true, availableDays: true, equipment: true, weightUnit: true } as const;

type BaseRow = { id: string; email: string; name: string };
type CoachRow = { gymName: string | null; weightUnit: "kg" | "lb"; distanceUnit: "km" | "mi" } | null;
type AthleteRow = { division: string | null; raceDate: Date | null; availableDays: string[]; equipment: string[]; weightUnit: "kg" | "lb" } | null;

function toCoachDTO(p: BaseRow, coach: CoachRow): CoachProfileDTO {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: "coach",
    gymName: coach?.gymName ?? "",
    weightUnit: coach?.weightUnit ?? "kg",
    distanceUnit: coach?.distanceUnit ?? "km",
  };
}

/** `race_date` es DATE (sin hora): Prisma la entrega a medianoche UTC. */
function dateOnlyToKey(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function toAthleteDTO(p: BaseRow, athlete: AthleteRow): AthleteProfileDTO {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: "athlete",
    division: athlete?.division ?? "",
    raceDate: dateOnlyToKey(athlete?.raceDate),
    availableDays: athlete?.availableDays ?? [],
    equipment: athlete?.equipment ?? [],
    weightUnit: athlete?.weightUnit ?? "kg",
  };
}

export type RoleProfile = { role: "coach"; profile: CoachProfileDTO } | { role: "athlete"; profile: AthleteProfileDTO };

/**
 * Perfil con su rol y los datos del rol en UNA lectura (fase 14): la sesión
 * pasaba por tres consultas en secuencia (perfil, perfil + relación, datos del
 * rol). El rol sale de la base de datos; null = no existe el perfil.
 */
export async function findRoleProfile(userId: string): Promise<RoleProfile | null> {
  const p = await db().profile.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, coach: { select: COACH_SELECT }, athlete: { select: ATHLETE_SELECT } },
  });
  if (!p) return null;
  return p.role === "coach" ? { role: "coach", profile: toCoachDTO(p, p.coach) } : { role: "athlete", profile: toAthleteDTO(p, p.athlete) };
}

export async function updateCoachProfile(
  userId: string,
  data: { name: string; gymName: string; weightUnit: "kg" | "lb"; distanceUnit: "km" | "mi" },
) {
  const coach = { gymName: data.gymName, weightUnit: data.weightUnit, distanceUnit: data.distanceUnit };
  await db().profile.update({
    where: { id: userId, role: "coach" },
    data: {
      name: data.name,
      coach: { upsert: { create: coach, update: coach } },
    },
  });
}

export async function updateAthleteProfile(
  userId: string,
  data: {
    name: string;
    division: string | null;
    raceDate: string | null;
    availableDays: string[];
    equipment: string[];
    weightUnit: "kg" | "lb";
  },
) {
  const athlete = {
    division: data.division,
    raceDate: data.raceDate ? new Date(`${data.raceDate}T00:00:00.000Z`) : null,
    availableDays: data.availableDays,
    equipment: data.equipment,
    weightUnit: data.weightUnit,
  };
  await db().profile.update({
    where: { id: userId, role: "athlete" },
    data: {
      name: data.name,
      athlete: { upsert: { create: athlete, update: athlete } },
    },
  });
}
