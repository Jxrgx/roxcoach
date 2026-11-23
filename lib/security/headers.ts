/**
 * Cabeceras de seguridad HTTP (función pura). La usa `next.config.ts`, que se
 * evalúa al compilar: NEXT_PUBLIC_SUPABASE_URL y APP_URL deben existir también
 * en el build (ver docs/deployment.md).
 *
 * CSP sin nonce (decisión de la fase 13): un nonce obligaría a renderizar todas
 * las páginas por petición y rompería las páginas offline estáticas y Cache
 * Components. Por eso `script-src` incluye 'unsafe-inline' (los scripts en línea
 * de Next). El resto de directivas sí es estricto.
 */

export interface HeaderOptions {
  /** URL del proyecto Supabase (solo se usa su origen). */
  supabaseUrl?: string;
  /** Origen público; HSTS solo se envía si es https. */
  appUrl?: string;
  /** `next dev` necesita 'unsafe-eval' (React en desarrollo). */
  development: boolean;
}

function origin(raw: string | undefined): string | null {
  try {
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl, appUrl, development }: HeaderOptions): string {
  const supabase = origin(supabaseUrl);
  const connect = ["'self'", ...(supabase ? [supabase, supabase.replace(/^http/, "ws")] : [])];
  const https = origin(appUrl)?.startsWith("https:") ?? false;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Imágenes de ejercicios: URLs https que captura el coach (sin optimizador).
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "media-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(options: HeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // La app no usa cámara, micrófono, ubicación ni pagos.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
  if (!options.development && origin(options.appUrl)?.startsWith("https:")) {
    // Sin `preload`: es una decisión irreversible que debe tomar el dueño del dominio.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}
