import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRole, safeNextPath } from "@/lib/permissions";

/**
 * Destino del enlace de confirmación de correo.
 * Acepta ambos formatos de Supabase:
 * - `?code=…` (flujo PKCE, plantilla por defecto con {{ .ConfirmationURL }})
 * - `?token_hash=…&type=email` (plantilla personalizada)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=confirmacion", request.url));

  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims?.app_metadata as { role?: unknown } | undefined)?.role;
  if (!isRole(role)) return NextResponse.redirect(new URL("/auth/salir?error=perfil", request.url));

  return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next"), role), request.url));
}
