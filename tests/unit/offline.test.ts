import { describe, expect, it } from "vitest";
import {
  applyResults,
  createOp,
  foldPauses,
  isTemporaryError,
  mergeSets,
  migrateOp,
  nextBatch,
  nextSeq,
  opsFor,
  pendingCount,
  problemOps,
  QUEUE_SCHEMA_VERSION,
  restRemaining,
  syncState,
  toWire,
  type QueuedOp,
} from "@/lib/offline/queue";
import { clampClientTime, decideSetWrite, invalidOpReason } from "@/lib/offline/server-rules";
import { activeSeconds } from "@/lib/execution/progress";

const USER = "user-a";
const SESSION = "11111111-1111-4111-8111-111111111111";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const T0 = new Date("2026-11-24T18:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

const logSet = (seq: number, setNumber: number, over: Partial<QueuedOp> = {}): QueuedOp => ({
  ...createOp(
    { userId: USER, sessionId: SESSION, seq, kind: "logSet", now: at(seq) },
    {
      position: { blockIndex: 0, exerciseIndex: 0, setNumber },
      input: { amount: "12", load: "60", rpe: "" },
      expect: { kind: "new" },
      preview: { actualReps: null, actualDistanceMeters: 12, actualDurationSeconds: null, actualLoadKg: 60, rpe: null },
    },
    id,
  ),
  ...over,
});

describe("operaciones idempotentes", () => {
  it("cada operación tiene un id único, versión y hora local; al servidor solo viaja lo necesario", () => {
    const a = logSet(1, 1);
    const b = logSet(2, 2);
    expect(a.opId).not.toBe(b.opId);
    expect(a).toMatchObject({ v: QUEUE_SCHEMA_VERSION, status: "pending", attempts: 0, createdAt: at(1).toISOString() });
    const wire = toWire(a);
    expect(Object.keys(wire).sort()).toEqual(["clientAt", "expect", "input", "kind", "opId", "position"]);
    expect(JSON.stringify(wire)).not.toMatch(/preview|userId|token/);
  });

  it("orden: el lote sale por seq y nextSeq sigue la secuencia", () => {
    const ops = [logSet(3, 3), logSet(1, 1), logSet(2, 2)];
    expect(nextBatch(ops).map((o) => o.seq)).toEqual([1, 2, 3]);
    expect(nextSeq(ops)).toBe(4);
  });

  it("aislamiento entre usuarios: nunca se mezclan operaciones de otra persona", () => {
    const mine = logSet(1, 1);
    const other = { ...logSet(2, 2), userId: "user-b" };
    expect(opsFor([mine, other], USER, SESSION).map((o) => o.opId)).toEqual([mine.opId]);
  });
});

describe("resultados y reintentos", () => {
  it("aplicada o duplicada se limpia (reintentar no duplica); conflicto y rechazo quedan con motivo", () => {
    const [a, b, c, d] = [logSet(1, 1), logSet(2, 2), logSet(3, 3), logSet(4, 4)];
    const next = applyResults([a!, b!, c!, d!], [
      { opId: a!.opId, outcome: "applied" },
      { opId: b!.opId, outcome: "duplicate" },
      { opId: c!.opId, outcome: "conflict", message: "La sesión ya había finalizado" },
      { opId: d!.opId, outcome: "rejected", message: "Datos inválidos" },
    ]);
    expect(next.map((o) => [o.seq, o.status, o.error])).toEqual([
      [3, "conflict", "La sesión ya había finalizado"],
      [4, "rejected", "Datos inválidos"],
    ]);
    expect(problemOps(next)).toHaveLength(2);
    expect(pendingCount(next)).toBe(0);
  });

  it("error temporal: queda pendiente con un intento más, y lo que sigue se conserva en orden", () => {
    const [a, b] = [logSet(1, 1), logSet(2, 2)];
    const sending = [a!, b!].map((o) => ({ ...o, status: "sending" as const }));
    const next = applyResults(sending, [
      { opId: a!.opId, outcome: "retry" },
      { opId: b!.opId, outcome: "skipped" },
    ]);
    expect(next.map((o) => [o.status, o.attempts])).toEqual([
      ["pending", 1],
      ["pending", 0],
    ]);
    // Sin respuesta (sin red): todo vuelve a pendiente.
    expect(applyResults(sending, []).every((o) => o.status === "pending")).toBe(true);
    expect(isTemporaryError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTemporaryError(new Error("Datos inválidos"))).toBe(false);
  });

  it("estados de sincronización", () => {
    const p = logSet(1, 1);
    expect(syncState([], true, false, false)).toBe("online");
    expect(syncState([], false, false, false)).toBe("offline");
    expect(syncState([p], false, false, false)).toBe("saved-locally");
    expect(syncState([p], true, true, false)).toBe("syncing");
    expect(syncState([], true, false, true)).toBe("synced");
    expect(syncState([{ ...p, status: "conflict" }], true, false, true)).toBe("attention");
  });

  it("datos pendientes visibles: una serie local nunca se oculta y gana sobre la del servidor", () => {
    const server = [{ blockIndex: 0, exerciseIndex: 0, setNumber: 1, actualReps: null, actualDistanceMeters: 10, actualDurationSeconds: null, actualLoadKg: 50, rpe: null, clientOpId: null }];
    const map = mergeSets(server, [logSet(1, 1), logSet(2, 2)]);
    expect(map.get("0.0.1")).toMatchObject({ actualLoadKg: 60, local: "pending" });
    expect(map.get("0.0.2")).toMatchObject({ local: "pending" });
  });

  it("limpieza: tras confirmar todo, la cola queda vacía", () => {
    const ops = [logSet(1, 1), logSet(2, 2)];
    expect(applyResults(ops, ops.map((o) => ({ opId: o.opId, outcome: "applied" as const })))).toEqual([]);
  });
});

describe("reglas del servidor", () => {
  it("rechaza datos inválidos o incompletos", () => {
    const ok = toWire(logSet(1, 1));
    expect(invalidOpReason(ok)).toBeNull();
    expect(invalidOpReason({ ...ok, opId: "1" })).toMatch(/identificador/);
    expect(invalidOpReason({ ...ok, kind: "borrar" })).toMatch(/desconocido/);
    expect(invalidOpReason({ ...ok, clientAt: "ayer" })).toMatch(/Hora/);
    expect(invalidOpReason({ ...ok, position: { blockIndex: -1, exerciseIndex: 0, setNumber: 1 } })).toMatch(/no existe/);
    expect(invalidOpReason({ ...ok, input: undefined })).toMatch(/Faltan/);
    expect(invalidOpReason({ ...ok, expect: undefined })).toMatch(/incompleta/);
  });

  it("nunca sobrescribe: nueva exige vacío; corrección exige la misma versión", () => {
    expect(decideSetWrite(null, { kind: "new" })).toBe("write");
    expect(decideSetWrite({ clientOpId: "x" }, { kind: "new" })).toBe("conflict-existing");
    expect(decideSetWrite({ clientOpId: "x" }, { kind: "correct", opId: "x" })).toBe("write");
    expect(decideSetWrite({ clientOpId: null }, { kind: "correct", opId: null })).toBe("write");
    expect(decideSetWrite({ clientOpId: "y" }, { kind: "correct", opId: "x" })).toBe("conflict-changed");
    expect(decideSetWrite(null, { kind: "correct", opId: "x" })).toBe("conflict-changed");
    // La misma operación procesada en paralelo por otra petición: duplicado, no conflicto.
    expect(decideSetWrite({ clientOpId: "op-1" }, { kind: "new" }, "op-1")).toBe("duplicate");
    expect(decideSetWrite({ clientOpId: "op-1" }, { kind: "correct", opId: "op-0" }, "op-1")).toBe("duplicate");
  });

  it("acota la hora del dispositivo: ni antes del inicio ni en el futuro", () => {
    const bounds = { min: at(0), max: at(30) };
    expect(clampClientTime(at(10).toISOString(), bounds)).toEqual(at(10));
    expect(clampClientTime(at(-5).toISOString(), bounds)).toEqual(at(0));
    expect(clampClientTime(at(90).toISOString(), bounds)).toEqual(at(30));
  });
});

describe("temporizadores con timestamps", () => {
  it("tiempo pausado: pausas locales pendientes se descuentan una sola vez", () => {
    const pause = createOp({ userId: USER, sessionId: SESSION, seq: 1, kind: "pause", now: at(10) }, {}, id);
    const resume = createOp({ userId: USER, sessionId: SESSION, seq: 2, kind: "resume", now: at(15) }, {}, id);
    const folded = foldPauses({ pausedAt: null, pausedSeconds: 60 }, [resume, pause]);
    expect(folded).toEqual({ pausedAt: null, pausedSeconds: 60 + 300 });
    // En pausa sin conexión: el reloj se detiene en la hora de la pausa local.
    const open = foldPauses({ pausedAt: null, pausedSeconds: 0 }, [pause]);
    expect(activeSeconds({ startedAt: at(0), ...open, finishedAt: null }, at(40))).toBe(600);
    // Una pausa rechazada no cuenta.
    expect(foldPauses({ pausedAt: null, pausedSeconds: 0 }, [{ ...pause, status: "rejected" }]).pausedAt).toBeNull();
  });

  it("recuperación tras suspender: el tiempo activo y el descanso se calculan desde la hora de inicio", () => {
    // La pestaña estuvo suspendida 20 min: no hay ticks, pero el cálculo usa timestamps.
    expect(activeSeconds({ startedAt: at(0), pausedAt: null, pausedSeconds: 0, finishedAt: null }, at(20))).toBe(1200);
    const rest = { startedAt: at(0).toISOString(), seconds: 90, nextIndex: 1 };
    expect(restRemaining(rest, new Date(at(0).getTime() + 30_000))).toBe(60);
    expect(restRemaining(rest, at(5))).toBe(0); // terminó mientras estaba suspendida
  });
});

describe("migración de la cola local", () => {
  it("convierte registros de la versión 0 y descarta los irreconocibles", () => {
    const legacy = { id: "op-1", userId: USER, sessionId: SESSION, seq: 3, kind: "logSet", ts: at(2).toISOString(), position: { blockIndex: 0, exerciseIndex: 0, setNumber: 1 }, input: { amount: "10", load: "", rpe: "" } };
    expect(migrateOp(legacy)).toMatchObject({ v: QUEUE_SCHEMA_VERSION, opId: "op-1", createdAt: at(2).toISOString(), status: "pending", expect: { kind: "new" } });
    const current = logSet(1, 1);
    expect(migrateOp(current)).toBe(current);
    expect(migrateOp({ foo: 1 })).toBeNull();
    expect(migrateOp({ ...legacy, kind: "borrar" })).toBeNull();
  });
});
