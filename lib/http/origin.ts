import "server-only";

import { headers } from "next/headers";
import { resolvePublicOrigin } from "@/lib/config/env-rules";

/** Origen de la petición según sus cabeceras (NO confiable: solo como pista en desarrollo). */
async function requestHeaderOrigin(): Promise<string | null> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Origen público para enlaces absolutos (correo de confirmación, invitaciones).
 * En producción sale SIEMPRE de APP_URL; las cabeceras Host/Origin de la
 * petición nunca deciden a dónde apunta un enlace (ver lib/config/env-rules).
 */
export async function publicOrigin(): Promise<string> {
  const origin = resolvePublicOrigin({
    appUrl: process.env.APP_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    requestOrigin: process.env.APP_URL ? null : await requestHeaderOrigin(),
    production: process.env.NODE_ENV === "production",
  });
  if (!origin) throw new Error("Falta APP_URL: es obligatoria en producción (ver docs/deployment.md).");
  return origin;
}
