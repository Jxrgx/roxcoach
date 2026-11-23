import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/update-session";

/**
 * Proxy de Next.js 16 (antes "middleware").
 * Refresca la sesión de Supabase y protege /coach y /atleta por rol.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todas las rutas excepto estáticos, imágenes y archivos de metadatos. También quedan
    // fuera el service worker y las páginas offline (fase 12): son públicas y estáticas,
    // así nunca llevan cookies de sesión y se pueden cachear sin riesgo. El health check
    // (fase 13) tampoco: no debe depender de Supabase.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|sw-rules.js|offline/|sin-conexion|api/health|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
