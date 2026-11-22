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
    // Todas las rutas excepto estáticos, imágenes y archivos de metadatos.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
