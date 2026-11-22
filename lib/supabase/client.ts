"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Cliente de Supabase para Client Components.
 * La sesión vive en cookies (compartidas con el servidor), no en localStorage.
 * Las acciones de autenticación se hacen en Server Actions; este cliente queda
 * disponible para lecturas futuras desde el navegador (con RLS).
 */
export function createClient() {
  const { url, publishableKey } = supabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
