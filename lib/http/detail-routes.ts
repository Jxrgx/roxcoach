import type { Role } from "@/lib/types/domain";

/**
 * Rutas de detalle cuyo recurso puede no existir o ser de otro usuario (función
 * pura). El proxy las usa para responder 404 REAL en cargas directas: con Cache
 * Components, un `notFound()` dentro de la página llega después de enviar el
 * shell y la respuesta queda en 200 (ver docs/architecture.md → Estado HTTP).
 */

export type DetailKind =
  | "coach-atleta"
  | "coach-progreso-atleta"
  | "coach-ejercicio"
  | "coach-ejercicio-editar"
  | "coach-plantilla"
  | "coach-plantilla-editar"
  | "coach-sesion"
  | "coach-sesion-atleta"
  | "atleta-sesion"
  | "atleta-ejecucion"
  | "atleta-ejercicio";

export interface DetailMatch {
  kind: DetailKind;
  role: Role;
  /** Segmentos dinámicos en orden (p. ej. [sessionId, athleteId]). */
  ids: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_RE.test(value);

const SEG = "([^/]+)";
const ROUTES: { re: RegExp; kind: DetailKind; role: Role }[] = [
  { re: new RegExp(`^/coach/atletas/${SEG}$`), kind: "coach-atleta", role: "coach" },
  { re: new RegExp(`^/coach/progreso/${SEG}$`), kind: "coach-progreso-atleta", role: "coach" },
  { re: new RegExp(`^/coach/biblioteca/${SEG}/editar$`), kind: "coach-ejercicio-editar", role: "coach" },
  { re: new RegExp(`^/coach/biblioteca/${SEG}$`), kind: "coach-ejercicio", role: "coach" },
  { re: new RegExp(`^/coach/entrenamientos/${SEG}/editar$`), kind: "coach-plantilla-editar", role: "coach" },
  { re: new RegExp(`^/coach/entrenamientos/${SEG}$`), kind: "coach-plantilla", role: "coach" },
  { re: new RegExp(`^/coach/sesiones/${SEG}/atletas/${SEG}(?:/personalizar)?$`), kind: "coach-sesion-atleta", role: "coach" },
  { re: new RegExp(`^/coach/sesiones/${SEG}$`), kind: "coach-sesion", role: "coach" },
  { re: new RegExp(`^/atleta/sesiones/${SEG}/(?:ejecutar|resumen)$`), kind: "atleta-ejecucion", role: "athlete" },
  { re: new RegExp(`^/atleta/sesiones/${SEG}$`), kind: "atleta-sesion", role: "athlete" },
  { re: new RegExp(`^/atleta/ejercicios/${SEG}$`), kind: "atleta-ejercicio", role: "athlete" },
];

/** Rutas estáticas que comparten prefijo con un detalle (no son ids). */
const STATIC_CHILDREN = new Set(["nuevo", "nueva"]);

export function matchDetailRoute(pathname: string): DetailMatch | null {
  for (const r of ROUTES) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    const ids = m.slice(1).map((s) => decodeURIComponent(s));
    if (ids.some((id) => STATIC_CHILDREN.has(id))) return null;
    return { kind: r.kind, role: r.role, ids };
  }
  return null;
}

/**
 * ¿Es la carga de un documento (barra de direcciones, recarga, enlace externo)?
 * Las navegaciones cliente (RSC) y los prefetch no pasan por la comprobación:
 * ya muestran el estado "no encontrado" dentro del shell sin recargar.
 */
export function isDocumentRequest(method: string, headers: { get(name: string): string | null }): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (headers.get("rsc") || headers.get("next-router-prefetch") || headers.get("next-router-segment-prefetch")) return false;
  const dest = headers.get("sec-fetch-dest");
  if (dest === "document" || headers.get("sec-fetch-mode") === "navigate") return true;
  // El service worker reenvía la navegación con fetch(event.request): llega como
  // "empty" (o sin cabeceras Sec-Fetch), pero conserva Accept: text/html.
  if (dest && dest !== "empty") return false;
  return (headers.get("accept") ?? "").includes("text/html");
}

/**
 * Página 404 prerenderizada (con el shell del área y el mismo mensaje que la
 * ruta) a la que el proxy reescribe un detalle que no existe o es ajeno.
 * notFound() durante el prerender conserva el estado 404 (app/no-encontrado).
 */
export const NOT_FOUND_PATH: Record<DetailKind, string> = {
  "coach-atleta": "/no-encontrado/coach/atleta",
  "coach-progreso-atleta": "/no-encontrado/coach/progreso-atleta",
  "coach-ejercicio": "/no-encontrado/coach/ejercicio",
  "coach-ejercicio-editar": "/no-encontrado/coach/ejercicio",
  "coach-plantilla": "/no-encontrado/coach/plantilla",
  "coach-plantilla-editar": "/no-encontrado/coach/plantilla",
  "coach-sesion": "/no-encontrado/coach/sesion",
  "coach-sesion-atleta": "/no-encontrado/coach/sesion",
  "atleta-sesion": "/no-encontrado/atleta/sesion",
  "atleta-ejecucion": "/no-encontrado/atleta/sesion",
  "atleta-ejercicio": "/no-encontrado/atleta/ejercicio",
};

/** Las páginas 404 internas solo se alcanzan por reescritura del proxy, nunca visitándolas. */
export const isInternalNotFoundPath = (pathname: string) => pathname === "/no-encontrado" || pathname.startsWith("/no-encontrado/");
