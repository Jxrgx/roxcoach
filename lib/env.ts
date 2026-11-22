/**
 * Acceso centralizado a variables de entorno.
 * Se leen bajo demanda (no al importar) para que el build no dependa de
 * secretos, y fallan con un mensaje claro cuando falta alguna.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env.local y complétala (ver README → Configuración).`,
    );
  }
  return value;
}

/** URL y publishable key de Supabase (seguras para el navegador). */
export function supabasePublicEnv() {
  // Referencias literales: Next.js las incrusta en el bundle del cliente.
  const rawUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  let url: string;
  try {
    // Solo el origen: tolera que se copie con una ruta (p. ej. ".../rest/v1/").
    url = new URL(rawUrl).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL no es una URL válida (ejemplo: https://<project-ref>.supabase.co).");
  }
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}

/** Cadena de conexión de la app (pooler). Solo servidor. */
export function databaseUrl(): string {
  return required("DATABASE_URL", process.env.DATABASE_URL);
}
