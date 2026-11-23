"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { syncExecutionAction } from "@/app/atleta/sesiones/actions";
import { openExecutionStore, type ExecutionStore } from "@/lib/offline/idb";
import {
  applyResults,
  createOp,
  nextBatch,
  nextSeq,
  opsFor,
  pendingCount,
  problemOps,
  syncState,
  toWire,
  type OpKind,
  type OpResult,
  type QueuedOp,
} from "@/lib/offline/queue";
import { useOnline } from "@/lib/utils/use-online";

/** Reintento automático mientras haya pendientes y conexión. */
const RETRY_MS = 15_000;

/**
 * Cola local de la ejecución: guarda cada operación en IndexedDB antes de
 * enviarla, la envía en orden cuando hay conexión y aplica las respuestas.
 * `onResults` recibe lo que confirmó el servidor (series y pausas).
 *
 * `autoFlush: false` (pantalla restaurada en el shell offline): solo guarda en
 * IndexedDB y NO envía al volver la red. El shell carga entonces la ruta real,
 * cuya cola envía todo en orden. Si ambas enviaran, la recarga del shell podía
 * cancelar la navegación al resumen tras finalizar y la ruta real quedaba sin
 * nada pendiente que la llevara ahí (fase 14).
 */
export function useExecutionQueue({
  userId,
  sessionId,
  onResults,
  onLoaded,
  autoFlush = true,
}: {
  userId: string;
  sessionId: string;
  onResults: (results: OpResult[]) => void;
  /** Al terminar de leer lo guardado (para retomar la serie y el descanso). */
  onLoaded?: (ops: QueuedOp[], store: ExecutionStore) => void;
  /** Enviar automáticamente al cargar, al recuperar la red y al encolar. */
  autoFlush?: boolean;
}) {
  const online = useOnline();
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [everSynced, setEverSynced] = useState(false);
  const [rerunTick, setRerunTick] = useState(0);
  const storeRef = useRef<ExecutionStore | null>(null);
  const opsRef = useRef<QueuedOp[]>([]);
  const flushing = useRef(false);
  /** Llegó algo nuevo mientras se enviaba: otra pasada al terminar. */
  const rerun = useRef(false);
  const resultsRef = useRef(onResults);
  const loadedRef = useRef(onLoaded);
  useEffect(() => {
    resultsRef.current = onResults;
    loadedRef.current = onLoaded;
  });

  // Primero se escribe en el dispositivo y DESPUÉS se muestra: "Guardado localmente"
  // significa que ya está en IndexedDB (una recarga inmediata no lo pierde).
  const commit = useCallback(async (next: QueuedOp[]) => {
    const prev = opsRef.current;
    opsRef.current = next;
    const store = storeRef.current;
    if (store) {
      const keep = new Set(next.map((o) => o.opId));
      await store.deleteOps(prev.filter((o) => !keep.has(o.opId)).map((o) => o.opId));
      await store.putOps(next.filter((o) => prev.find((p) => p.opId === o.opId) !== o));
    }
    setOps(next);
  }, []);

  const flush = useCallback(async () => {
    if (!loaded) return;
    if (flushing.current) {
      rerun.current = true;
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const batch = nextBatch(opsRef.current);
    if (batch.length === 0) return;
    flushing.current = true;
    setSyncing(true);
    const ids = new Set(batch.map((o) => o.opId));
    await commit(opsRef.current.map((o) => (ids.has(o.opId) ? { ...o, status: "sending" as const } : o)));
    let ok = false;
    try {
      const res = await syncExecutionAction(sessionId, batch.map(toWire));
      if (!res.ok) throw new Error(res.message);
      resultsRef.current(res.results);
      await commit(applyResults(opsRef.current, res.results));
      setEverSynced(true);
      ok = !res.results.some((r) => r.outcome === "retry");
    } catch {
      // Sin red o error temporal: todo vuelve a pendiente, en el mismo orden.
      await commit(applyResults(opsRef.current, []));
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
    // Lo que se encoló durante el envío sale de inmediato (sin esperar al reintento periódico).
    if (rerun.current && ok) {
      rerun.current = false;
      setRerunTick((t) => t + 1);
    }
  }, [commit, loaded, sessionId]);

  useEffect(() => {
    if (rerunTick > 0) void flush();
  }, [rerunTick, flush]);

  // Cargar lo pendiente de este usuario y sesión (sobrevive a recargas).
  useEffect(() => {
    let cancelled = false;
    openExecutionStore().then(async (store) => {
      const list = opsFor(await store.listOps(userId, sessionId), userId, sessionId);
      if (cancelled) return;
      storeRef.current = store;
      setAvailable(store.available);
      opsRef.current = list;
      setOps(list);
      setLoaded(true);
      loadedRef.current?.(list, store);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, sessionId]);

  // Al cargar o al recuperar la conexión, enviar lo pendiente; reintentar periódicamente.
  useEffect(() => {
    if (!loaded || !online || !autoFlush) return;
    void flush();
    const id = window.setInterval(() => {
      if (pendingCount(opsRef.current) > 0) void flush();
    }, RETRY_MS);
    return () => window.clearInterval(id);
  }, [loaded, online, flush, autoFlush]);

  const enqueue = useCallback(
    async (kind: OpKind, extra: Pick<QueuedOp, "position" | "input" | "expect" | "preview"> = {}) => {
      const op = createOp({ userId, sessionId, seq: nextSeq(opsRef.current), kind, now: new Date() }, extra);
      await commit([...opsRef.current, op]);
      if (autoFlush) void flush();
      return op;
    },
    [autoFlush, commit, flush, sessionId, userId],
  );

  const discard = useCallback(async (opId: string) => commit(opsRef.current.filter((o) => o.opId !== opId)), [commit]);

  return {
    ops,
    loaded,
    available,
    online,
    syncing,
    state: syncState(ops, online, syncing, everSynced),
    pending: pendingCount(ops),
    problems: problemOps(ops),
    enqueue,
    flush,
    discard,
    store: storeRef,
  };
}
