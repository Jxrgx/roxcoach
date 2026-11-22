"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { formatClock } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

interface TimerProps {
  /** "countdown" requiere `durationSeconds`. */
  mode?: "stopwatch" | "countdown";
  durationSeconds?: number;
  label: string;
  className?: string;
  /** Arranca solo al montarse (descanso entre series). */
  autoStart?: boolean;
  /** Oculta Iniciar/Reiniciar cuando la pantalla ya tiene su propia acción principal. */
  showControls?: boolean;
  /** Se llama una vez al terminar la cuenta regresiva. */
  onComplete?: () => void;
}

/**
 * Temporizador para usarse durante el esfuerzo: dígitos grandes y controles
 * de ancho completo al alcance del pulgar. El tiempo se calcula con marcas de
 * tiempo (no acumulando ticks) para no desfasarse si la pestaña se suspende.
 */
export function Timer({
  mode = "stopwatch",
  durationSeconds = 0,
  label,
  className,
  autoStart = false,
  showControls = true,
  onComplete,
}: TimerProps) {
  const [running, setRunning] = useState(autoStart);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);
  const baseMs = useRef(0);
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  });

  useEffect(() => {
    if (autoStart) startedAt.current = Date.now();
    // Solo al montarse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMs = durationSeconds * 1000;
  const finished = mode === "countdown" && elapsedMs >= totalMs && totalMs > 0;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      const next = baseMs.current + (Date.now() - startedAt.current);
      setElapsedMs(mode === "countdown" ? Math.min(next, totalMs) : next);
      if (mode === "countdown" && next >= totalMs) {
        setRunning(false);
        startedAt.current = null;
        baseMs.current = totalMs;
        completeRef.current?.();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [running, mode, totalMs]);

  function toggle() {
    if (running) {
      baseMs.current = elapsedMs;
      startedAt.current = null;
      setRunning(false);
    } else {
      if (finished) {
        baseMs.current = 0;
        setElapsedMs(0);
      }
      startedAt.current = Date.now();
      setRunning(true);
    }
  }

  function reset() {
    setRunning(false);
    startedAt.current = null;
    baseMs.current = 0;
    setElapsedMs(0);
  }

  const shownSeconds =
    mode === "countdown"
      ? Math.ceil((totalMs - elapsedMs) / 1000)
      : Math.floor(elapsedMs / 1000);
  const statusText = finished
    ? "Tiempo cumplido"
    : running
      ? "En marcha"
      : elapsedMs > 0
        ? "En pausa"
        : "Listo";

  return (
    <section
      aria-label={label}
      className={cn("rounded-2xl border border-line bg-surface p-5", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p
          aria-live="polite"
          className={cn(
            "text-sm font-semibold",
            finished ? "text-positive" : running ? "text-acid" : "text-muted",
          )}
        >
          {statusText}
        </p>
      </div>
      <p
        className="mt-2 text-center text-6xl font-bold tracking-tight tabular-nums text-ink sm:text-7xl"
        aria-label={`${mode === "countdown" ? "Tiempo restante" : "Tiempo transcurrido"}: ${formatClock(shownSeconds)}`}
      >
        {formatClock(shownSeconds)}
      </p>
      {showControls && (
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <Button
            size="lg"
            variant={running ? "secondary" : "primary"}
            onClick={toggle}
            icon={
              running ? (
                <Pause aria-hidden className="size-5" />
              ) : (
                <Play aria-hidden className="size-5" />
              )
            }
          >
            {running
              ? "Pausar"
              : elapsedMs > 0 && !finished
                ? "Reanudar"
                : "Iniciar"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={reset}
            disabled={elapsedMs === 0}
            icon={<RotateCcw aria-hidden className="size-5" />}
          >
            Reiniciar
          </Button>
        </div>
      )}
    </section>
  );
}
