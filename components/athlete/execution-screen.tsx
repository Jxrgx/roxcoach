"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Flag, MoreHorizontal, Pause, Play, PlayCircle, StickyNote } from "lucide-react";
import { finishSessionAction, logSetAction, pauseSessionAction, resumeSessionAction } from "@/app/atleta/sesiones/actions";
import { activeSeconds, nextPendingIndex, setSlots, slotKey, type LoggedSet } from "@/lib/execution/progress";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import { formatClock } from "@/lib/utils/format";
import type { WeightUnit } from "@/lib/workouts/rules";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useToast } from "@/components/ui/toast";
import { SetLogger } from "@/components/athlete/set-logger";
import { Timer } from "@/components/athlete/timer";
import { DiscomfortDialog } from "@/components/athlete/discomfort-form";

interface ExecutionScreenProps {
  sessionId: string;
  title: string;
  snapshot: SessionSnapshotV1;
  unit: WeightUnit;
  log: { startedAt: Date; pausedAt: Date | null; pausedSeconds: number };
  sets: LoggedSet[];
  /** Hora del servidor al renderizar (corrige el desfase del reloj del teléfono). */
  serverNow: number;
}

type Phase = { kind: "set" } | { kind: "rest"; seconds: number; nextIndex: number };

/**
 * Ejecución de la sesión, pensada para usarse cansado y con una mano.
 * Nivel 1: la serie activa y "Completar serie" (o el descanso / reanudar).
 * Nivel 2: bloque, progreso y tiempo activo; pausa y finalizar a la vista.
 * Nivel 3 (panel inferior): ver ejercicio, instrucciones del bloque y reportar molestia.
 */
export function ExecutionScreen({ sessionId, title, snapshot, unit, log, sets, serverNow }: ExecutionScreenProps) {
  const slots = useMemo(() => setSlots(snapshot), [snapshot]);
  const [logged, setLogged] = useState(() => new Map(sets.map((s) => [slotKey(s), s])));
  const loggedKeys = useMemo(() => new Set(logged.keys()), [logged]);
  const [current, setCurrent] = useState(() => {
    const next = nextPendingIndex(slots, new Set(sets.map(slotKey)));
    return next === -1 ? Math.max(0, slots.length - 1) : next;
  });
  const [phase, setPhase] = useState<Phase>({ kind: "set" });
  const [times, setTimes] = useState({ pausedAt: log.pausedAt, pausedSeconds: log.pausedSeconds });
  const [now, setNow] = useState(serverNow);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [discomfortOpen, setDiscomfortOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Reloj del tiempo activo, alineado con la hora del servidor.
  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);

  const paused = times.pausedAt !== null;
  const slot = slots[current];
  const done = logged.size;
  const total = slots.length;
  const allDone = total > 0 && done === total;
  const elapsed = activeSeconds({ startedAt: log.startedAt, pausedAt: times.pausedAt, pausedSeconds: times.pausedSeconds, finishedAt: null }, new Date(now));
  const exerciseSlots = slot ? slots.map((s, i) => ({ s, i })).filter(({ s }) => s.blockIndex === slot.blockIndex && s.exerciseIndex === slot.exerciseIndex) : [];
  const blockNotes = slot ? snapshot.blocks[slot.blockIndex]?.notes : null;

  async function saveSet(position: { blockIndex: number; exerciseIndex: number; setNumber: number }, input: Parameters<typeof logSetAction>[2]) {
    const result = await logSetAction(sessionId, position, input);
    if (!result.ok) return { ok: false as const, message: result.message };
    const wasLogged = logged.has(slotKey(position));
    const nextLogged = new Map(logged).set(slotKey(result.set), result.set);
    setLogged(nextLogged);
    const next = nextPendingIndex(slots, new Set(nextLogged.keys()), current + 1);
    const rest = slots[current]?.exercise.restSeconds ?? 0;
    if (next === -1) setPhase({ kind: "set" });
    else if (!wasLogged && rest > 0) setPhase({ kind: "rest", seconds: rest, nextIndex: next });
    else {
      setCurrent(next);
      setPhase({ kind: "set" });
    }
    return { ok: true as const };
  }

  function endRest() {
    if (phase.kind === "rest") setCurrent(phase.nextIndex);
    setPhase({ kind: "set" });
  }

  function togglePause() {
    startTransition(async () => {
      const result = paused ? await resumeSessionAction(sessionId) : await pauseSessionAction(sessionId);
      if (!result.ok) {
        toast.show({ tone: "error", title: result.message });
        return;
      }
      setTimes({ pausedAt: result.log.pausedAt, pausedSeconds: result.log.pausedSeconds });
      // Al pausar en un descanso, se retoma directo en la siguiente serie.
      if (phase.kind === "rest") endRest();
    });
  }

  function finish() {
    startTransition(async () => {
      // Si todo sale bien, la acción redirige al resumen.
      const result = await finishSessionAction(sessionId);
      if (!result.ok) {
        setFinishOpen(false);
        toast.show({ tone: "error", title: "No se pudo finalizar", description: result.message });
      }
    });
  }

  const nextSlot = phase.kind === "rest" ? slots[phase.nextIndex] : undefined;
  const pendingCount = total - done;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {/* Nivel 2: contexto y controles siempre a la vista. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">
              {slot ? `Bloque ${slot.blockIndex + 1} de ${slot.blockCount} · ${slot.blockName}` : title}
            </p>
            <h1 className="mt-0.5 text-lg leading-snug font-bold break-words text-ink">{title}</h1>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-sm text-muted">{paused ? "En pausa" : "Tiempo activo"}</span>
            <span className={cn("block text-2xl font-bold tabular-nums", paused ? "text-warning" : "text-ink")}>{formatClock(elapsed)}</span>
          </p>
        </div>
        <ProgressBar value={done} max={Math.max(1, total)} label="Progreso de la sesión" showLabel valueText={`${done} de ${total} series`} />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Button
            variant="secondary"
            onClick={togglePause}
            disabled={pending}
            icon={paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
          >
            {paused ? "Reanudar" : "Pausar"}
          </Button>
          <Button variant="secondary" onClick={() => setFinishOpen(true)} disabled={pending} icon={<Flag aria-hidden className="size-4" />}>
            Finalizar
          </Button>
          <IconButton label="Más opciones" icon={<MoreHorizontal />} variant="secondary" onClick={() => setSheetOpen(true)} />
        </div>
      </header>

      {/* Nivel 1: una sola acción principal según el momento. */}
      {paused ? (
        <section aria-labelledby="pausa-titulo" className="rounded-2xl border border-warning/40 bg-surface p-6 text-center">
          <Pause aria-hidden className="mx-auto size-10 text-warning" />
          <h2 id="pausa-titulo" className="mt-3 text-xl font-bold text-ink">
            Sesión en pausa
          </h2>
          <p className="mt-1 text-sm text-muted">El tiempo activo está detenido. Tu progreso está guardado.</p>
          <Button size="lg" fullWidth className="mt-5" onClick={togglePause} loading={pending} loadingLabel="Reanudando…" icon={<PlayCircle aria-hidden className="size-5" />}>
            Reanudar sesión
          </Button>
        </section>
      ) : phase.kind === "rest" ? (
        <div className="flex flex-col gap-3">
          <Timer key={`rest-${current}`} label="Descanso" mode="countdown" durationSeconds={phase.seconds} autoStart showControls={false} />
          {nextSlot && (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
              Siguiente: <span className="font-semibold text-ink">{nextSlot.exercise.name}</span> · Serie {nextSlot.setNumber} de {nextSlot.exercise.sets}
            </p>
          )}
          <Button size="lg" fullWidth onClick={endRest} icon={<ChevronRight aria-hidden className="size-5" />}>
            Siguiente serie
          </Button>
        </div>
      ) : allDone ? (
        <section aria-labelledby="completo-titulo" className="rounded-2xl border border-positive/40 bg-surface p-6 text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-10 text-positive" />
          <h2 id="completo-titulo" className="mt-3 text-xl font-bold text-ink">
            ¡Registraste todas las series!
          </h2>
          <p className="mt-1 text-sm text-muted">Finaliza para ver tu resumen y contarle a tu coach cómo te fue.</p>
          <Button size="lg" fullWidth className="mt-5" onClick={() => setFinishOpen(true)} icon={<Flag aria-hidden className="size-5" />}>
            Finalizar entrenamiento
          </Button>
        </section>
      ) : slot ? (
        <SetLogger
          key={slotKey(slot)}
          exerciseName={slot.exercise.name}
          setNumber={slot.setNumber}
          totalSets={slot.exercise.sets}
          planned={slot.exercise}
          unit={unit}
          initial={logged.get(slotKey(slot)) ?? null}
          submitLabel={logged.has(slotKey(slot)) ? "Guardar corrección" : "Completar serie"}
          stickySubmit
          onSave={(_, input) => saveSet({ blockIndex: slot.blockIndex, exerciseIndex: slot.exerciseIndex, setNumber: slot.setNumber }, input)}
        />
      ) : (
        <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          Esta sesión no tiene series para registrar.
        </p>
      )}

      {/* Series del ejercicio actual: para volver a una y corregirla. */}
      {slot && exerciseSlots.length > 1 && !paused && phase.kind === "set" && !allDone && (
        <nav aria-label={`Series de ${slot.exercise.name}`}>
          <ol className="flex flex-wrap gap-2">
            {exerciseSlots.map(({ s, i }) => {
              const isDone = loggedKeys.has(slotKey(s));
              const active = i === current;
              return (
                <li key={slotKey(s)}>
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`Serie ${s.setNumber}${isDone ? ", registrada" : ""}`}
                    className={cn(
                      "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold tabular-nums",
                      active ? "border-acid text-acid" : "border-line text-ink",
                      isDone ? "bg-surface-2" : "bg-surface",
                    )}
                  >
                    {isDone && <CheckCircle2 aria-hidden className="size-4 text-positive" />}
                    {s.setNumber}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Más opciones">
        <div className="flex flex-col gap-2">
          {slot && (
            <Link
              href={`/atleta/ejercicios/${slot.exercise.exerciseId}`}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4 text-ink hover:bg-surface-2"
            >
              Ver ejercicio: {slot.exercise.name}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
            </Link>
          )}
          {slot?.exercise.notes && (
            <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-ink">
              <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>
                <span className="font-medium">Indicación: </span>
                {slot.exercise.notes}
              </span>
            </p>
          )}
          {blockNotes && (
            <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line text-ink">
              <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>
                <span className="font-medium">Instrucciones del bloque: </span>
                {blockNotes}
              </span>
            </p>
          )}
          <Button
            variant="secondary"
            fullWidth
            icon={<AlertTriangle aria-hidden className="size-4 text-warning" />}
            onClick={() => {
              setSheetOpen(false);
              setDiscomfortOpen(true);
            }}
          >
            Reportar molestia
          </Button>
        </div>
      </BottomSheet>

      <DiscomfortDialog
        open={discomfortOpen}
        onClose={() => setDiscomfortOpen(false)}
        sessionId={sessionId}
        at={slot ? { blockIndex: slot.blockIndex, exerciseIndex: slot.exerciseIndex } : null}
        exerciseName={slot?.exercise.name}
      />

      <ConfirmDialog
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onConfirm={finish}
        loading={pending}
        tone={pendingCount > 0 ? "danger" : "default"}
        title={pendingCount > 0 ? "¿Finalizar con series pendientes?" : "¿Finalizar entrenamiento?"}
        description={
          pendingCount > 0
            ? `Te ${pendingCount === 1 ? "falta 1 serie; quedará" : `faltan ${pendingCount} series; quedarán`} como no realizada${pendingCount === 1 ? "" : "s"}. Después ya no podrás registrar series.`
            : "Verás tu resumen y podrás enviar tu RPE y un comentario a tu coach."
        }
        confirmLabel="Sí, finalizar"
        cancelLabel="Seguir entrenando"
      />
    </div>
  );
}
