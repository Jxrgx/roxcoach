"use client";

import { AlertTriangle, CheckCircle2, CloudUpload, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { SYNC_LABEL, type QueuedOp, type SyncState } from "@/lib/offline/queue";
import { formatActualSet } from "@/lib/execution/format";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { WeightUnit } from "@/lib/workouts/rules";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

const ICON: Record<SyncState, typeof Wifi> = {
  online: Wifi,
  offline: WifiOff,
  "saved-locally": CloudUpload,
  syncing: RefreshCw,
  synced: CheckCircle2,
  attention: AlertTriangle,
};

const TONE: Record<SyncState, string> = {
  online: "text-muted",
  offline: "text-warning",
  "saved-locally": "text-electric",
  syncing: "text-electric",
  synced: "text-positive",
  attention: "text-warning",
};

/**
 * Estado breve de conexión y envío (texto + icono, no solo color). Se anuncia
 * a lectores de pantalla cuando cambia. "Reintentar" fuerza el envío manual.
 */
export function SyncStatus({
  state,
  pending,
  online,
  syncing,
  available,
  onRetry,
}: {
  state: SyncState;
  pending: number;
  online: boolean;
  syncing: boolean;
  available: boolean;
  onRetry: () => void;
}) {
  const Icon = ICON[state];
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3 py-1">
      <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-sm font-medium", TONE[state])}>
        <Icon aria-hidden className={cn("size-4 shrink-0", state === "syncing" && "animate-spin")} />
        <span>
          {SYNC_LABEL[state]}
          {pending > 0 && <span className="text-muted"> · {pending === 1 ? "1 pendiente" : `${pending} pendientes`}</span>}
          {!online && pending === 0 && <span className="text-muted"> · puedes seguir registrando</span>}
        </span>
      </p>
      {pending > 0 && online && !syncing && (
        <Button variant="ghost" icon={<RefreshCw aria-hidden className="size-4" />} onClick={onRetry}>
          Reintentar
        </Button>
      )}
      {!available && <p className="w-full text-sm text-warning">Este navegador no permite guardar sin conexión: mantén la conexión para no perder datos.</p>}
    </div>
  );
}

function describeOp(op: QueuedOp, snapshot: SessionSnapshotV1, unit: WeightUnit): string {
  if (op.kind === "logSet" && op.position) {
    const ex = snapshot.blocks[op.position.blockIndex]?.exercises[op.position.exerciseIndex];
    const value = op.preview ? `: ${formatActualSet({ ...op.preview }, unit)}` : "";
    return `Serie ${op.position.setNumber} de ${ex?.name ?? "un ejercicio"}${value}`;
  }
  return { pause: "Pausa", resume: "Reanudación", finish: "Finalización", logSet: "Serie" }[op.kind];
}

/**
 * Datos que no se pudieron enviar: qué quedó pendiente, qué ocurrió y qué puede
 * hacer el atleta. Nunca se borran solos; el atleta decide descartarlos.
 */
export function SyncPanel({ problems, snapshot, unit, onDiscard }: { problems: QueuedOp[]; snapshot: SessionSnapshotV1; unit: WeightUnit; onDiscard: (opId: string) => void }) {
  if (problems.length === 0) return null;
  return (
    <section aria-labelledby="sin-enviar" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <h2 id="sin-enviar" className="flex items-center gap-2 font-semibold text-ink">
        <AlertTriangle aria-hidden className="size-4 text-warning" />
        {problems.length === 1 ? "1 dato sin enviar" : `${problems.length} datos sin enviar`}
      </h2>
      <p className="mt-1 text-sm text-muted">Se conservan en este dispositivo. Descártalos si ya no hacen falta o coméntaselos a tu coach.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {problems.map((op) => (
          <li key={op.opId} className="rounded-xl border border-line bg-surface p-3 text-sm">
            <p className="font-medium text-ink">{describeOp(op, snapshot, unit)}</p>
            <p className="mt-0.5 text-muted">
              <span className="font-medium text-warning">{op.status === "conflict" ? "Conflicto" : "Rechazado"}: </span>
              {op.error}
            </p>
            <Button variant="ghost" className="mt-1" onClick={() => onDiscard(op.opId)} aria-label={`Descartar: ${describeOp(op, snapshot, unit)}`}>
              Descartar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
