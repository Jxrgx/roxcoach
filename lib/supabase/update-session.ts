import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "@/lib/env";
import { isRole, resolveRouteAccess } from "@/lib/permissions";

/**
 * Refresca la sesión de Supabase (cookies) y aplica el acceso por rol.
 * Lo invoca `proxy.ts` en cada petición de página.
 *
 * El rol se lee de `app_metadata.role` del JWT: solo el servidor puede
 * escribirlo (lo asigna el trigger de registro). Es una redirección rápida;
 * la verificación definitiva ocurre en servidor contra `profiles`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // No ejecutar código entre createServerClient y getClaims: getClaims valida
  // el JWT y refresca la sesión si expiró.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const appMetadata = claims?.app_metadata as { role?: unknown } | undefined;

  const decision = resolveRouteAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    authenticated: Boolean(claims?.sub),
    role: isRole(appMetadata?.role) ? appMetadata.role : null,
  });

  if (decision.type === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    // Conserva las cookies de sesión recién refrescadas.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
