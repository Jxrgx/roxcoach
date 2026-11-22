"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Clave estable del día local actual, p. ej. "2026-11-21". */
function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Fecha de hoy en la zona horaria del dispositivo.
 * Devuelve `null` durante el render en servidor/prerender para no fijar una
 * fecha en el HTML estático; el cliente la resuelve al hidratar.
 */
export function useToday(): Date | null {
  const key = useSyncExternalStore(noopSubscribe, getTodayKey, () => null);
  if (key === null) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
