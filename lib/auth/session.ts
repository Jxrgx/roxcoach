import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findAthleteProfile, findCoachProfile, findProfile } from "@/lib/db/profiles";
import { ROLE_HOME } from "@/lib/permissions";
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

/** Redirige si no hay sesión, si falta el perfil o si el rol no corresponde. */
async function requireProfile(role: Role) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const profile = await findProfile(userId);
  // Sesión válida sin perfil: se cierra la sesión para evitar un bucle de redirecciones.
  if (!profile) redirect("/auth/salir?error=perfil");
  if (profile.role !== role) redirect(ROLE_HOME[profile.role]);
  return userId;
}

export const requireCoach = cache(async () => {
  const userId = await requireProfile("coach");
  const coach = await findCoachProfile(userId);
  if (!coach) redirect("/auth/salir?error=perfil");
  return coach;
});

export const requireAthlete = cache(async () => {
  const userId = await requireProfile("athlete");
  const athlete = await findAthleteProfile(userId);
  if (!athlete) redirect("/auth/salir?error=perfil");
  return athlete;
});
