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

export async function findCoachProfile(userId: string): Promise<CoachProfileDTO | null> {
  const p = await db().profile.findUnique({ where: { id: userId }, include: { coach: true } });
  if (!p || p.role !== "coach") return null;
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: "coach",
    gymName: p.coach?.gymName ?? "",
    weightUnit: p.coach?.weightUnit ?? "kg",
    distanceUnit: p.coach?.distanceUnit ?? "km",
  };
}

/** `race_date` es DATE (sin hora): Prisma la entrega a medianoche UTC. */
function dateOnlyToKey(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export async function findAthleteProfile(userId: string): Promise<AthleteProfileDTO | null> {
  const p = await db().profile.findUnique({ where: { id: userId }, include: { athlete: true } });
  if (!p || p.role !== "athlete") return null;
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: "athlete",
    division: p.athlete?.division ?? "",
    raceDate: dateOnlyToKey(p.athlete?.raceDate),
    availableDays: p.athlete?.availableDays ?? [],
    equipment: p.athlete?.equipment ?? [],
    weightUnit: p.athlete?.weightUnit ?? "kg",
  };
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
