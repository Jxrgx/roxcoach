"use client";

import { Flag, Repeat } from "lucide-react";
import { daysUntil } from "@/lib/utils/format";
import { useToday } from "@/lib/utils/use-today";

/**
 * "Faltan N días para tu carrera", calculado con la fecha del dispositivo.
 * La fecha de competencia es opcional: sin ella no hay cuenta regresiva y se
 * muestra "Entrenamiento continuo" (estado neutro, no un pendiente).
 */
export function RaceCountdown({ raceDate }: { raceDate: string }) {
  const today = useToday();

  if (!raceDate) {
    return (
      <p className="mt-1.5 inline-flex min-h-6 items-center gap-1.5 text-sm text-muted">
        <Repeat aria-hidden className="size-4" />
        Entrenamiento continuo
      </p>
    );
  }

  const days = today ? daysUntil(raceDate, today) : null;
  return (
    <p className="mt-1.5 inline-flex min-h-6 items-center gap-1.5 text-sm text-muted">
      <Flag aria-hidden className="size-4 text-acid" />
      {today === null ? (
        "Cuenta regresiva a tu carrera"
      ) : days === null ? (
        "Tu fecha de competencia ya pasó. Actualízala en tu perfil."
      ) : days === 0 ? (
        <strong className="font-semibold text-ink">¡Hoy es tu carrera!</strong>
      ) : (
        <>
          Faltan{" "}
          <strong className="font-semibold tabular-nums text-ink">
            {days} {days === 1 ? "día" : "días"}
          </strong>{" "}
          para tu carrera
        </>
      )}
    </p>
  );
}
