import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_ERROR_MESSAGES } from "@/lib/auth/errors";

/**
 * Cierra la sesión cuando es inválida (p. ej. usuario sin perfil) y lleva a
 * /login con el motivo. El cierre de sesión normal usa la Server Action
 * `signOut` (POST).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const error = request.nextUrl.searchParams.get("error");
  const target = error && error in LOGIN_ERROR_MESSAGES ? `/login?error=${error}` : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}
