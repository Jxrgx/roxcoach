import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "@/lib/env";
import { isRole, resolveRouteAccess } from "@/lib/permissions";
import { isDocumentRequest, isInternalNotFoundPath, isUuid, matchDetailRoute, NOT_FOUND_PATH } from "@/lib/http/detail-routes";
import { isDetailVisible } from "@/lib/db/visibility";
import { logWarn } from "@/lib/log";

/**
 * Refresca la sesión de Supabase (cookies) y aplica el acceso por rol.
 * Lo invoca `proxy.ts` en cada petición de página.
 *
 * El rol se lee de `app_metadata.role` del JWT: solo el servidor puede
 * escribirlo (lo asigna el trigger de registro). Es una redirección rápida;
 * la verificación definitiva ocurre en servidor contra `profiles`.
 */
export async function updateSession(request: NextRequest) {
  // Las páginas 404 internas (app/no-encontrado) solo se sirven por reescritura de
  // este proxy (que no vuelve a pasar por aquí); visitadas directamente, 404 genérico.
  if (isInternalNotFoundPath(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/_no-existe", request.url));
  }
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

  // Detalles (sesión, atleta, ejercicio…) en carga directa: si el recurso no existe
  // o es de otro usuario, 404 REAL antes de renderizar. Dentro de la página, con
  // Cache Components, notFound() llega después del shell y quedaría en 200.
  // Navegación cliente y prefetch no pasan por aquí (ya muestran el estado en el shell).
  const userId = claims?.sub;
  const role = isRole(appMetadata?.role) ? appMetadata.role : null;
  const detail = userId && role && isDocumentRequest(request.method, request.headers) ? matchDetailRoute(request.nextUrl.pathname) : null;
  if (detail && detail.role === role) {
    let visible = detail.ids.every(isUuid);
    if (visible) {
      try {
        visible = await isDetailVisible(detail, userId!);
      } catch (error) {
        // Si la base de datos falla, la página decide (y muestra su propio estado de error).
        logWarn("proxyDetailVisibility", error);
        visible = true;
      }
    }
    if (!visible) {
      const notFound = NextResponse.rewrite(new URL(NOT_FOUND_PATH[detail.kind], request.url));
      response.cookies.getAll().forEach((cookie) => notFound.cookies.set(cookie));
      return notFound;
    }
  }

  return response;
}
