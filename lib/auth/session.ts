import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProfile, findRoleProfile, type AthleteProfileDTO, type CoachProfileDTO, type RoleProfile } from "@/lib/db/profiles";
import { profileAccess } from "@/lib/permissions";
import type { Role } from "@/lib/types/domain";

/**
 * Capa de acceso a la sesión (DAL). Verificación definitiva en servidor:
 * el JWT se valida con getClaims y el rol se toma de la tabla `profiles`,
 * no del cliente. `cache` evita repetir la consulta en una misma petición.
 */

export const getSessionUserId = cache(async (): Promise<string | null> => {
  // La sesión es por petición: getClaims compara la expiración del JWT con
  // Date.now(). Sin esto, Next (Cache Components) intenta prerenderizar el App
  // Shell con sesión y registra "blocking-prerender-current-time".
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

export const getCurrentProfile = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return findProfile(userId);
});

/** Sesión + perfil del rol en una sola lectura (una por petición gracias a `cache`). */
const getRoleProfile = cache(async (): Promise<RoleProfile | null> => {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return findRoleProfile(userId);
});

/** Verificación definitiva del área: redirige si falta el perfil o el rol no corresponde. */
async function requireRole(role: Role): Promise<RoleProfile> {
  const found = await getRoleProfile();
  const access = profileAccess(role, found?.role ?? null);
  if (access.type === "redirect" || !found) redirect(access.type === "redirect" ? access.to : "/auth/salir?error=perfil");
  return found;
}

export const requireCoach = cache(async (): Promise<CoachProfileDTO> => {
  const found = await requireRole("coach");
  if (found.role !== "coach") redirect("/auth/salir?error=perfil");
  return found.profile;
});

export const requireAthlete = cache(async (): Promise<AthleteProfileDTO> => {
  const found = await requireRole("athlete");
  if (found.role !== "athlete") redirect("/auth/salir?error=perfil");
  return found.profile;
});
