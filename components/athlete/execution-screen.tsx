"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flag,
  MoreHorizontal,
  Pause,
  Play,
  PlayCircle,
  StickyNote,
  UserCog,
} from "lucide-react";
import type { EffectiveExercise } from "@/lib/overrides/apply";
import { activeSeconds, nextPendingIndex, setSlots, slotKey, type LoggedSet, type SetPosition } from "@/lib/execution/progress";
import { foldPauses, mergeSets, restRemaining, type OpResult, type RestState } from "@/lib/offline/queue";
import { buildSessionCopy } from "@/lib/offline/restore";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import { formatClock } from "@/lib/utils/format";
import type { WeightUnit } from "@/lib/workouts/rules";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SetLogger } from "@/components/athlete/set-logger";
import { Timer } from "@/components/athlete/timer";
import { DiscomfortDialog } from "@/components/athlete/discomfort-form";
import { useExecutionQueue } from "@/components/athlete/use-execution-queue";
import { SyncPanel, SyncStatus } from "@/components/athlete/sync-status";

type ServerSet = LoggedSet & { clientOpId: string | null };

interface ExecutionScreenProps {
  sessionId: string;
  /** Dueño de la cola local (nunca se muestran pendientes de otro usuario). */
  userId: string;
  title: string;
  snapshot: SessionSnapshotV1;
  unit: WeightUnit;
  log: { startedAt: Date; pausedAt: Date | null; pausedSeconds: number };
  sets: ServerSet[];
  /** Hora del servidor al renderizar (corrige el desfase del reloj del teléfono). */
  serverNow: number;
  /** Restaurada desde el dispositivo sin red (shell offline, fase 12). */
  restored?: boolean;
}

type Phase = { kind: "set" } | { kind: "rest"; rest: RestState };

/**
 * Ejecución de la sesión, pensada para usarse cansado, con una mano y con
 * conexión inestable (fase 11): cada acción se guarda primero en el
 * dispositivo, se muestra de inmediato y se envía en orden cuando hay red.
 * Nivel 1: la serie activa y "Completar serie" (o el descanso / reanudar / finalizar).
 * Nivel 2: estado de conexión, bloque, progreso y tiempo activo; pausa y finalizar.
 * Nivel 3 (panel inferior): ver ejercicio, instrucciones del bloque y reportar molestia.
 */
export function ExecutionScreen({ sessionId, userId, title, snapshot, unit, log, sets, serverNow, restored = false }: ExecutionScreenProps) {
  const router = useRouter();
  const slots = useMemo(() => setSlots(snapshot), [snapshot]);
  const [serverSets, setServerSets] = useState(() => new Map(sets.map((s) => [slotKey(s), s])));
  const [serverTimes, setServerTimes] = useState({ pausedAt: log.pausedAt, pausedSeconds: log.pausedSeconds });

  const [current, setCurrent] = useState(() => {
    const next = nextPendingIndex(slots, new Set(sets.map(slotKey)));
    return next === -1 ? Math.max(0, slots.length - 1) : next;
  });
  const [phase, setPhase] = useState<Phase>({ kind: "set" });

  function onResults(results: OpResult[]) {
    const nextSets = new Map(serverSets);
    let finished = false;
    for (const r of results) {
      if (r.set && (r.outcome === "applied" || r.outcome === "duplicate")) nextSets.set(slotKey(r.set), r.set);
      if (r.times) setServerTimes({ pausedAt: r.times.pausedAt ? new Date(r.times.pausedAt) : null, pausedSeconds: r.times.pausedSeconds });
      if (r.finished) finished = true;
    }
    setServerSets(nextSets);
    if (finished) router.push(`/atleta/sesiones/${sessionId}/resumen?finalizada=1`);
  }

  const queue = useExecutionQueue({
    userId,
    sessionId,
    onResults,
    // Al cargar lo guardado: ubicar la siguiente serie pendiente y retomar un descanso en curso.
    onLoaded: (ops, store) => {
      const next = nextPendingIndex(slots, new Set(mergeSets(sets, ops).keys()));
      if (next !== -1) setCurrent(next);
      void store.getRest(userId, sessionId).then((rest) => {
        if (rest && restRemaining(rest, new Date()) > 0) setPhase({ kind: "rest", rest });
      });
    },
  });
  const displayed = useMemo(() => mergeSets([...serverSets.values()], queue.ops), [serverSets, queue.ops]);

  // Copia local para poder recargar sin red (fase 12): se guarda al abrir con red y
  // se actualiza con cada confirmación del servidor. Ligada a este usuario.
  useEffect(() => {
    const store = queue.store.current;
    if (!queue.loaded || !store) return;
    void (async () => {
      if (!restored) await store.setLastUser(userId);
      await store.putSessionCopy(
        buildSessionCopy(
          {
            userId,
            sessionId,
            title,
            snapshot,
            unit,
            log: { startedAt: log.startedAt.toISOString(), pausedAt: serverTimes.pausedAt?.toISOString() ?? null, pausedSeconds: serverTimes.pausedSeconds },
            sets: [...serverSets.values()],
          },
          new Date(),
        ),
      );
    })();
  }, [queue.loaded, queue.store, restored, userId, sessionId, title, snapshot, unit, log.startedAt, serverTimes, serverSets]);
  const times = foldPauses(serverTimes, queue.ops);
  const finishQueued = queue.ops.some((o) => o.kind === "finish" && (o.status === "pending" || o.status === "sending"));

  const [now, setNow] = useState(serverNow);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [discomfortOpen, setDiscomfortOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  // Reloj del tiempo activo, alineado con la hora del servidor (se recalcula desde timestamps).
  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);



  const paused = times.pausedAt !== null;
  const slot = slots[current];
  const done = [...displayed.keys()].filter((k) => slots.some((s) => slotKey(s) === k)).length;
  const total = slots.length;
  const allDone = total > 0 && done === total;
  const elapsed = activeSeconds({ startedAt: log.startedAt, pausedAt: times.pausedAt, pausedSeconds: times.pausedSeconds, finishedAt: null }, new Date(now));
  const exerciseSlots = slot ? slots.map((s, i) => ({ s, i })).filter(({ s }) => s.blockIndex === slot.blockIndex && s.exerciseIndex === slot.exerciseIndex) : [];
  const blockNotes = slot ? snapshot.blocks[slot.blockIndex]?.notes : null;

  function setRest(rest: RestState | null) {
    void queue.store.current?.putRest(userId, sessionId, rest);
    setPhase(rest ? { kind: "rest", rest } : { kind: "set" });
  }

  async function saveSet(position: SetPosition, value: Omit<LoggedSet, keyof SetPosition>, input: { amount: string; load: string; rpe: string }) {
    const shown = displayed.get(slotKey(position));
    await queue.enqueue("logSet", {
      position,
      input,
      // Corregir solo si la serie sigue siendo la que el atleta vio; si no, conflicto (nunca sobrescribe).
      expect: shown ? { kind: "correct", opId: shown.clientOpId } : { kind: "new" },
      preview: value,
    });
    const keys = new Set([...displayed.keys(), slotKey(position)]);
    const next = nextPendingIndex(slots, keys, current + 1);
    const rest = slots[current]?.exercise.restSeconds ?? 0;
    if (next === -1) setPhase({ kind: "set" });
    else if (!shown && rest > 0) setRest({ startedAt: new Date().toISOString(), seconds: rest, nextIndex: next });
    else {
      setCurrent(next);
      setPhase({ kind: "set" });
    }
    return { ok: true as const };
  }

  function endRest() {
    if (phase.kind === "rest") setCurrent(phase.rest.nextIndex);
    setRest(null);
  }

  function togglePause() {
    void queue.enqueue(paused ? "resume" : "pause");
    // Al pausar en un descanso, se retoma directo en la siguiente serie.
    if (phase.kind === "rest") endRest();
  }

  function finish() {
    setFinishOpen(false);
    // Va al final de la cola: primero se envían las series pendientes.
    void queue.enqueue("finish");
  }

  const nextSlot = phase.kind === "rest" ? slots[phase.rest.nextIndex] : undefined;
  const missingSets = total - done;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {/* Nivel 2: contexto y controles siempre a la vista. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{slot ? `Bloque ${slot.blockIndex + 1} de ${slot.blockCount} · ${slot.blockName}` : title}</p>
            <h1 className="mt-0.5 text-lg leading-snug font-bold break-words text-ink">{title}</h1>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-sm text-muted">{paused ? "En pausa" : "Tiempo activo"}</span>
            <span className={cn("block text-2xl font-bold tabular-nums", paused ? "text-warning" : "text-ink")}>{formatClock(elapsed)}</span>
          </p>
        </div>
        <SyncStatus
          state={queue.state}
          pending={queue.pending}
          online={queue.online}
          syncing={queue.syncing}
          available={queue.available}
          restored={restored}
          onRetry={() => void queue.flush()}
        />
        <ProgressBar value={done} max={Math.max(1, total)} label="Progreso de la sesión" showLabel valueText={`${done} de ${total} series`} />
        {!finishQueued && (
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Button variant="secondary" onClick={togglePause} icon={paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}>
              {paused ? "Reanudar" : "Pausar"}
            </Button>
            <Button variant="secondary" onClick={() => setFinishOpen(true)} icon={<Flag aria-hidden className="size-4" />}>
              Finalizar
            </Button>
            <IconButton label="Más opciones" icon={<MoreHorizontal />} variant="secondary" onClick={() => setSheetOpen(true)} />
          </div>
        )}
      </header>


      {/* Nivel 1: una sola acción principal según el momento. */}
      {finishQueued ? (
        <section aria-labelledby="final-pendiente" className="rounded-2xl border border-electric/40 bg-surface p-6 text-center">
          <Clock3 aria-hidden className="mx-auto size-10 text-electric" />
          <h2 id="final-pendiente" className="mt-3 text-xl font-bold text-ink">
            Entrenamiento finalizado en este dispositivo
          </h2>
          <p className="mt-1 text-sm text-muted">
            {queue.online ? "Enviando tus series y la finalización…" : "Se enviará en cuanto vuelva la conexión. No cierres sesión en este dispositivo."}
          </p>
          <Button size="lg" fullWidth className="mt-5" onClick={() => void queue.flush()} disabled={!queue.online || queue.syncing} loading={queue.syncing} loadingLabel="Enviando…">
            Reintentar envío
          </Button>
        </section>
      ) : paused ? (
        <section aria-labelledby="pausa-titulo" className="rounded-2xl border border-warning/40 bg-surface p-6 text-center">
          <Pause aria-hidden className="mx-auto size-10 text-warning" />
          <h2 id="pausa-titulo" className="mt-3 text-xl font-bold text-ink">
            Sesión en pausa
          </h2>
          <p className="mt-1 text-sm text-muted">El tiempo activo está detenido. Tu progreso está guardado.</p>
          <Button size="lg" fullWidth className="mt-5" onClick={togglePause} icon={<PlayCircle aria-hidden className="size-5" />}>
            Reanudar sesión
          </Button>
        </section>
      ) : phase.kind === "rest" ? (
        <div className="flex flex-col gap-3">
          <Timer
            key={`rest-${phase.rest.startedAt}`}
            label="Descanso"
            mode="countdown"
            durationSeconds={phase.rest.seconds}
            autoStart
            startedAtMs={new Date(phase.rest.startedAt).getTime()}
            showControls={false}
          />
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
        <div className="flex flex-col gap-2">
          {(() => {
            // Ajuste individual del coach (fase 10): se avisa sin estorbar la serie.
            const eff = slot.exercise as Partial<EffectiveExercise>;
            if (!eff.adapted) return null;
            return (
              <p role="note" className="flex items-start gap-2 rounded-xl border border-electric/40 bg-electric/10 px-3 py-2 text-sm text-ink">
                <UserCog aria-hidden className="mt-0.5 size-4 shrink-0 text-electric" />
                <span>
                  <span className="font-semibold">Adaptado para ti</span>
                  {eff.replaced && eff.original ? ` · en lugar de ${eff.original.name}` : ""}
                  {eff.athleteNote ? ` · ${eff.athleteNote}` : ""}
                </span>
              </p>
            );
          })()}
          <SetLogger
            key={slotKey(slot)}
            exerciseName={slot.exercise.name}
            setNumber={slot.setNumber}
            totalSets={slot.exercise.sets}
            planned={slot.exercise}
            unit={unit}
            initial={displayed.get(slotKey(slot)) ?? null}
            submitLabel={displayed.has(slotKey(slot)) ? "Guardar corrección" : "Completar serie"}
            stickySubmit
            onSave={(value, input) => saveSet({ blockIndex: slot.blockIndex, exerciseIndex: slot.exerciseIndex, setNumber: slot.setNumber }, value, input)}
          />
        </div>
      ) : (
        <p role="status" className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          Esta sesión no tiene series para registrar.
        </p>
      )}

      {/* Datos que no se pudieron enviar: debajo de la acción principal para no frenar el entrenamiento. */}
      <SyncPanel problems={queue.problems} snapshot={snapshot} unit={unit} onDiscard={(id) => void queue.discard(id)} />

      {/* Series del ejercicio actual: para volver a una y corregirla. */}
      {slot && exerciseSlots.length > 1 && !paused && !finishQueued && phase.kind === "set" && !allDone && (
        <nav aria-label={`Series de ${slot.exercise.name}`}>
          <ol className="flex flex-wrap gap-2">
            {exerciseSlots.map(({ s, i }) => {
              const shown = displayed.get(slotKey(s));
              const local = shown?.local === "pending" || shown?.local === "sending";
              const active = i === current;
              return (
                <li key={slotKey(s)}>
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={active ? "step" : undefined}
                    aria-label={`Serie ${s.setNumber}${shown ? (local ? ", guardada en este dispositivo" : ", registrada") : ""}`}
                    className={cn(
                      "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold tabular-nums",
                      active ? "border-acid text-acid" : "border-line text-ink",
                      shown ? "bg-surface-2" : "bg-surface",
                    )}
                  >
                    {shown && (local ? <Clock3 aria-hidden className="size-4 text-electric" /> : <CheckCircle2 aria-hidden className="size-4 text-positive" />)}
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
            <Link href={`/atleta/ejercicios/${slot.exercise.exerciseId}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4 text-ink hover:bg-surface-2">
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
        tone={missingSets > 0 || queue.problems.length > 0 ? "danger" : "default"}
        title={missingSets > 0 ? "¿Finalizar con series pendientes?" : "¿Finalizar entrenamiento?"}
        description={[
          missingSets > 0
            ? `Te ${missingSets === 1 ? "falta 1 serie; quedará" : `faltan ${missingSets} series; quedarán`} como no realizada${missingSets === 1 ? "" : "s"}. Después ya no podrás registrar series.`
            : "Verás tu resumen y podrás enviar tu RPE y un comentario a tu coach.",
          queue.pending > 0 ? `Tienes ${queue.pending} ${queue.pending === 1 ? "registro sin enviar; se enviará" : "registros sin enviar; se enviarán"} antes de finalizar.` : "",
          queue.problems.length > 0 ? `${queue.problems.length} ${queue.problems.length === 1 ? "dato no se pudo enviar y se conservará" : "datos no se pudieron enviar y se conservarán"} en este dispositivo.` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel="Sí, finalizar"
        cancelLabel="Seguir entrenando"
      />
    </div>
  );
}
