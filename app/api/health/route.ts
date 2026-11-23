import { connection } from "next/server";

/**
 * Health check para el proveedor de despliegue. Solo confirma que el proceso
 * responde: no consulta la base de datos ni revela versión, entorno o
 * configuración. No pasa por el proxy (no toca Supabase).
 */
export async function GET() {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
