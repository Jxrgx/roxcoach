import { migrateOp, QUEUE_SCHEMA_VERSION, type QueuedOp, type RestState } from "@/lib/offline/queue";

/**
 * Persistencia local de la ejecución en IndexedDB (API nativa, sin
 * dependencias). Base "roxcoach-ejecucion" con la versión del esquema de la
 * cola. Guarda solo operaciones pendientes (sin tokens ni credenciales) y el
 * descanso en curso; todo va ligado al userId para que en un dispositivo
 * compartido nadie vea pendientes de otra persona.
 * Si IndexedDB no está disponible (algunos modos privados), usa memoria y lo
 * indica con `available: false`.
 */

const DB_NAME = "roxcoach-ejecucion";
const OPS = "ops";
const STATE = "state";

export interface ExecutionStore {
  available: boolean;
  listOps(userId: string, sessionId: string): Promise<QueuedOp[]>;
  putOps(ops: QueuedOp[]): Promise<void>;
  deleteOps(opIds: string[]): Promise<void>;
  getRest(userId: string, sessionId: string): Promise<RestState | null>;
  putRest(userId: string, sessionId: string, rest: RestState | null): Promise<void>;
}

const restKey = (userId: string, sessionId: string) => `${userId}:${sessionId}:rest`;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, QUEUE_SCHEMA_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1: esquema inicial. Las versiones futuras migran aquí (y migrateOp convierte cada registro al leerlo).
      if (!db.objectStoreNames.contains(OPS)) {
        const store = db.createObjectStore(OPS, { keyPath: "opId" });
        store.createIndex("byUserSession", ["userId", "sessionId"]);
      }
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
  });
}

function memoryStore(): ExecutionStore {
  const ops = new Map<string, QueuedOp>();
  const state = new Map<string, RestState | null>();
  return {
    available: false,
    listOps: async (userId, sessionId) => [...ops.values()].filter((o) => o.userId === userId && o.sessionId === sessionId),
    putOps: async (list) => list.forEach((o) => ops.set(o.opId, o)),
    deleteOps: async (ids) => ids.forEach((id) => ops.delete(id)),
    getRest: async (u, s) => state.get(restKey(u, s)) ?? null,
    putRest: async (u, s, rest) => void state.set(restKey(u, s), rest),
  };
}

let storePromise: Promise<ExecutionStore> | null = null;

/** Abre (una vez) el almacén local de la ejecución. */
export function openExecutionStore(): Promise<ExecutionStore> {
  if (storePromise) return storePromise;
  storePromise = (async (): Promise<ExecutionStore> => {
    if (typeof indexedDB === "undefined") return memoryStore();
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch {
      return memoryStore();
    }
    return {
      available: true,
      async listOps(userId, sessionId) {
        const tx = db.transaction(OPS, "readonly");
        const rows = await request(tx.objectStore(OPS).index("byUserSession").getAll([userId, sessionId]));
        return rows.map(migrateOp).filter((o): o is QueuedOp => o !== null && o.userId === userId && o.sessionId === sessionId);
      },
      async putOps(list) {
        if (list.length === 0) return;
        const tx = db.transaction(OPS, "readwrite");
        for (const o of list) tx.objectStore(OPS).put(o);
        await done(tx);
      },
      async deleteOps(ids) {
        if (ids.length === 0) return;
        const tx = db.transaction(OPS, "readwrite");
        for (const id of ids) tx.objectStore(OPS).delete(id);
        await done(tx);
      },
      async getRest(userId, sessionId) {
        const tx = db.transaction(STATE, "readonly");
        const row = (await request(tx.objectStore(STATE).get(restKey(userId, sessionId)))) as { value: RestState | null } | undefined;
        return row?.value ?? null;
      },
      async putRest(userId, sessionId, rest) {
        const tx = db.transaction(STATE, "readwrite");
        if (rest) tx.objectStore(STATE).put({ key: restKey(userId, sessionId), value: rest });
        else tx.objectStore(STATE).delete(restKey(userId, sessionId));
        await done(tx);
      },
    };
  })();
  return storePromise;
}
