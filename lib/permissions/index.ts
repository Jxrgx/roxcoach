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

/**
 * Destino seguro tras iniciar sesión: solo rutas internas que el rol puede ver.
 * Evita redirecciones abiertas (`//evil.com`, `https://…`).
 */
export function safeNextPath(next: unknown, role: Role): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return ROLE_HOME[role];
  }
  const pathname = next.split(/[?#]/)[0] ?? "";
  if (GUEST_ONLY.some((p) => inPath(pathname, p))) return ROLE_HOME[role];
  return canAccessPath(role, pathname) ? next : ROLE_HOME[role];
}
