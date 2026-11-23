import type { Role } from "@/lib/types/domain";

/**
 * Permisos centralizados (funciones puras).
 * Los usa `proxy.ts` para redirigir rápido y `lib/auth` para la verificación
 * definitiva en servidor contra la tabla `profiles`.
 */

export const ROLES: readonly Role[] = ["coach", "athlete"];

export function isRole(value: unknown): value is Role {
  return value === "coach" || value === "athlete";
}

export const ROLE_HOME: Record<Role, string> = {
  coach: "/coach/inicio",
  athlete: "/atleta/inicio",
};

const ROLE_AREA: Record<Role, string> = {
  coach: "/coach",
  athlete: "/atleta",
};

/** Rutas solo para visitantes sin sesión. */
const GUEST_ONLY = ["/login", "/registro"];

function inPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Área protegida a la que pertenece la ruta, si alguna. */
export function areaForPath(pathname: string): Role | null {
  for (const role of ROLES) if (inPath(pathname, ROLE_AREA[role])) return role;
  return null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const area = areaForPath(pathname);
  return area === null || area === role;
}

export type RouteDecision = { type: "allow" } | { type: "redirect"; to: string };

/**
 * Decide qué hacer con una petición según la sesión.
 * - Sin sesión en área protegida → /login?next=<ruta>
 * - Con sesión pero rol sin determinar en área protegida → /login?error=perfil
 * - Rol en el área equivocada → inicio de su rol
 * - Con sesión en /login o /registro → inicio de su rol
 */
export function resolveRouteAccess({
  pathname,
  search = "",
  authenticated,
  role,
}: {
  pathname: string;
  search?: string;
  authenticated: boolean;
  role: Role | null;
}): RouteDecision {
  const area = areaForPath(pathname);

  if (area) {
    if (!authenticated) {
      return { type: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
    }
    if (!role) return { type: "redirect", to: "/login?error=perfil" };
    if (area !== role) return { type: "redirect", to: ROLE_HOME[role] };
    return { type: "allow" };
  }

  if (authenticated && role && GUEST_ONLY.some((p) => inPath(pathname, p))) {
    return { type: "redirect", to: ROLE_HOME[role] };
  }
  return { type: "allow" };
}

const PARSE_BASE = "http://roxcoach.invalid";

/**
 * ¿Es una ruta interna segura? Rechaza `//host`, `\`, URLs absolutas y
 * caracteres de control o espacios: el parser de URL los elimina, y entonces
 * `/<tab>/evil.example` se convertiría en `//evil.example` (redirección abierta).
 */
export function isSafeInternalPath(next: unknown): next is string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return false;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return false;
  if (/[\u0000- \u007f]/.test(next)) return false;
  try {
    return new URL(next, PARSE_BASE).origin === PARSE_BASE;
  } catch {
    return false;
  }
}

/**
 * Destino seguro tras iniciar sesión: solo rutas internas que el rol puede ver.
 * Evita redirecciones abiertas (`//evil.com`, `https://…`).
 */
export function safeNextPath(next: unknown, role: Role): string {
  if (!isSafeInternalPath(next)) return ROLE_HOME[role];
  // Ruta normalizada (resuelve `..`), la misma que verá el navegador.
  const url = new URL(next, PARSE_BASE);
  if (GUEST_ONLY.some((p) => inPath(url.pathname, p))) return ROLE_HOME[role];
  return canAccessPath(role, url.pathname) ? url.pathname + url.search + url.hash : ROLE_HOME[role];
}

/**
 * Destino que llega en el `next` del enlace de confirmación de correo.
 * Acepta una ruta interna o una URL absoluta de un origen permitido (la
 * plantilla de Supabase pasa `{{ .RedirectTo }}`, que es una URL completa) y
 * desenvuelve un `/auth/confirm?next=…` anidado. Solo devuelve la RUTA: nunca
 * se redirige a otro origen. null = usar el inicio del rol.
 * El resultado debe pasar después por `safeNextPath`.
 */
export function confirmNextPath(raw: string | null | undefined, origins: readonly string[], depth = 0): string | null {
  if (!raw || depth > 2) return null;
  let url: URL;
  if (isSafeInternalPath(raw)) url = new URL(raw, PARSE_BASE);
  else {
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!origins.includes(url.origin)) return null;
  }
  if (url.pathname === "/auth/confirm") return confirmNextPath(url.searchParams.get("next"), origins, depth + 1);
  if (url.pathname === "/" && !url.search) return null;
  const path = url.pathname + url.search + url.hash;
  return isSafeInternalPath(path) ? path : null;
}
