import type { SessionSnapshotV1, SnapshotExercise } from "@/lib/scheduling/snapshot";

/**
 * Ejecución de una sesión (funciones puras).
 * Lo PLANEADO sale del snapshot congelado; lo REALIZADO, de los registros de
 * serie. Una serie se identifica por su posición en el snapshot.
 */

export type ExecutionStatus = "sin_iniciar" | "en_curso" | "completada";

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  sin_iniciar: "Sin iniciar",
  en_curso: "En curso",
  completada: "Completada",
};

export interface SetPosition {
  blockIndex: number;
  exerciseIndex: number;
  /** Empieza en 1. */
  setNumber: number;
}

export interface SetSlot extends SetPosition {
  blockName: string;
  blockCount: number;
  exercise: SnapshotExercise;
}

/** Valores reales de una serie (lo planeado nunca se guarda aquí). */
export interface ActualSet {
  actualReps: number | null;
  actualDistanceMeters: number | null;
  actualDurationSeconds: number | null;
  actualLoadKg: number | null;
  rpe: number | null;
}

export interface LoggedSet extends SetPosition, ActualSet {}

export const slotKey = (p: SetPosition) => `${p.blockIndex}.${p.exerciseIndex}.${p.setNumber}`;

/** Todas las series en orden: bloque → ejercicio → serie. */
export function setSlots(snap: SessionSnapshotV1): SetSlot[] {
  return snap.blocks.flatMap((b, blockIndex) =>
    b.exercises.flatMap((exercise, exerciseIndex) =>
      Array.from({ length: exercise.sets }, (_, i) => ({
        blockIndex,
        exerciseIndex,
        setNumber: i + 1,
        blockName: b.name,
        blockCount: snap.blocks.length,
        exercise,
      })),
    ),
  );
}

/** ¿Existe esa posición en el snapshot? (también lo revisa la BD). */
export function isValidPosition(snap: SessionSnapshotV1, p: SetPosition): boolean {
  const ex = snap.blocks[p.blockIndex]?.exercises[p.exerciseIndex];
  return !!ex && Number.isInteger(p.setNumber) && p.setNumber >= 1 && p.setNumber <= ex.sets;
}

/**
 * Siguiente serie pendiente a partir de `from` (índice en `slots`); si no hay
 * después, la primera pendiente anterior. -1 si todas están registradas.
 */
export function nextPendingIndex(slots: SetSlot[], logged: ReadonlySet<string>, from = 0): number {
  for (let i = Math.max(0, from); i < slots.length; i++) if (!logged.has(slotKey(slots[i]!))) return i;
  for (let i = 0; i < Math.min(from, slots.length); i++) if (!logged.has(slotKey(slots[i]!))) return i;
  return -1;
}

export interface LogTimes {
  startedAt: Date;
  pausedAt: Date | null;
  pausedSeconds: number;
  finishedAt: Date | null;
}

/** Segundos de trabajo (sin pausas) hasta `now`, o hasta el fin si ya terminó. */
export function activeSeconds(log: LogTimes, now: Date): number {
  const end = log.finishedAt ?? log.pausedAt ?? now;
  const total = Math.floor((end.getTime() - log.startedAt.getTime()) / 1000) - log.pausedSeconds;
  return Math.max(0, total);
}

/** Segundos de la pausa en curso al reanudar o finalizar. */
export function closedPauseSeconds(pausedAt: Date | null, now: Date): number {
  return pausedAt ? Math.max(0, Math.round((now.getTime() - pausedAt.getTime()) / 1000)) : 0;
}

/** Comenzar: sesión programada, asignada y de hoy o de días anteriores. */
export function startAvailability(input: {
  sessionStatus: "programada" | "cancelada";
  date: string;
  today: string;
  execution: ExecutionStatus;
}): "disponible" | "futura" | "cancelada" | "iniciada" {
  if (input.execution !== "sin_iniciar") return "iniciada";
  if (input.sessionStatus === "cancelada") return "cancelada";
  return input.date > input.today ? "futura" : "disponible";
}

export interface ExerciseSummary {
  blockIndex: number;
  exerciseIndex: number;
  exercise: SnapshotExercise;
  sets: { setNumber: number; actual: ActualSet | null }[];
}

export interface BlockSummary {
  name: string;
  done: number;
  total: number;
  exercises: ExerciseSummary[];
}

export interface SessionSummary {
  done: number;
  total: number;
  blocks: BlockSummary[];
}

/** Planeado vs. realizado por bloque y ejercicio. */
export function summarize(snap: SessionSnapshotV1, logs: LoggedSet[]): SessionSummary {
  const byKey = new Map(logs.map((l) => [slotKey(l), l]));
  const blocks = snap.blocks.map((b, blockIndex) => {
    const exercises = b.exercises.map((exercise, exerciseIndex) => ({
      blockIndex,
      exerciseIndex,
      exercise,
      sets: Array.from({ length: exercise.sets }, (_, i) => {
        const log = byKey.get(slotKey({ blockIndex, exerciseIndex, setNumber: i + 1 }));
        return {
          setNumber: i + 1,
          actual: log
            ? {
                actualReps: log.actualReps,
                actualDistanceMeters: log.actualDistanceMeters,
                actualDurationSeconds: log.actualDurationSeconds,
                actualLoadKg: log.actualLoadKg,
                rpe: log.rpe,
              }
            : null,
        };
      }),
    }));
    const total = exercises.reduce((n, e) => n + e.sets.length, 0);
    const done = exercises.reduce((n, e) => n + e.sets.filter((s) => s.actual).length, 0);
    return { name: b.name, done, total, exercises };
  });
  return {
    done: blocks.reduce((n, b) => n + b.done, 0),
    total: blocks.reduce((n, b) => n + b.total, 0),
    blocks,
  };
}
