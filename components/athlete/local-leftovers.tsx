"use client";

import { useEffect, useState } from "react";
import { openExecutionStore } from "@/lib/offline/idb";
import { opsFor, problemOps, type QueuedOp } from "@/lib/offline/queue";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { WeightUnit } from "@/lib/workouts/rules";
import { SyncPanel } from "@/components/athlete/sync-status";

/**
 * En el resumen: datos de esta sesión que quedaron en el dispositivo sin poder
 * enviarse (p. ej. la sesión ya había finalizado). Solo los del usuario actual.
 */
export function LocalLeftovers({ userId, sessionId, snapshot, unit }: { userId: string; sessionId: string; snapshot: SessionSnapshotV1; unit: WeightUnit }) {
  const [problems, setProblems] = useState<QueuedOp[]>([]);

  useEffect(() => {
    let cancelled = false;
    openExecutionStore().then(async (store) => {
      const list = problemOps(opsFor(await store.listOps(userId, sessionId), userId, sessionId));
      if (!cancelled) setProblems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, sessionId]);

  async function discard(opId: string) {
    const store = await openExecutionStore();
    await store.deleteOps([opId]);
    setProblems((prev) => prev.filter((o) => o.opId !== opId));
  }

  return <SyncPanel problems={problems} snapshot={snapshot} unit={unit} onDiscard={(id) => void discard(id)} />;
}
