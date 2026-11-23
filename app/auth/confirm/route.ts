import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedOrigins } from "@/lib/config/env-rules";
import { confirmNextPath, isRole, safeNextPath } from "@/lib/permissions";

/** Tipos de enlace que esta ruta acepta (registro y correo). */
const OTP_TYPES: readonly EmailOtpType[] = ["email", "signup"];

/**
 * Destino del enlace de confirmación de correo.
 * Acepta ambos formatos de Supabase:
 * - `?token_hash=…&type=email&next=…` (plantilla recomendada; ver docs/deployment.md)
 * - `?code=…` (flujo PKCE, plantilla por defecto con {{ .ConfirmationURL }})
 * El retorno (`next`) se reduce a una ruta interna y se valida por rol: nunca
 * redirige a otro origen.
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
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=confirmacion", request.url));

  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims?.app_metadata as { role?: unknown } | undefined)?.role;
  if (!isRole(role)) return NextResponse.redirect(new URL("/auth/salir?error=perfil", request.url));

  const origins = [...allowedOrigins({ APP_URL: process.env.APP_URL, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS }), request.nextUrl.origin];
  const next = confirmNextPath(searchParams.get("next"), origins);
  return NextResponse.redirect(new URL(safeNextPath(next, role), request.url));
}
