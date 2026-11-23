import { migrateOp, type QueuedOp, type RestState } from "@/lib/offline/queue";
import { migrateSessionCopy, type LocalSessionCopy } from "@/lib/offline/restore";

/**
 * Persistencia local de la ejecución en IndexedDB (API nativa, sin
 * dependencias). Base "roxcoach-ejecucion". Guarda la cola de operaciones
 * pendientes, el descanso en curso y (fase 12) una copia local de la ejecución
 * abierta para restaurarla sin red. Nunca tokens ni credenciales. Todo va ligado
 * al userId: en un dispositivo compartido nadie ve datos de otra persona, y al
 * cerrar sesión se borra lo de ese usuario (clearUser).
 * Si IndexedDB no está disponible (algunos modos privados), usa memoria y lo
 * indica con `available: false`.
 */

const DB_NAME = "roxcoach-ejecucion";
/**
 * Versión de la BASE (no de los registros): v1 = ops + state (fase 11);
 * v2 = + sessions (copia local de la ejecución) + meta (último usuario) (fase 12).
 */
export const DB_VERSION = 2;
const OPS = "ops";
const STATE = "state";
const SESSIONS = "sessions";
const META = "meta";
const LAST_USER = "lastUser";

export interface ExecutionStore {
  available: boolean;
  listOps(userId: string, sessionId: string): Promise<QueuedOp[]>;
  putOps(ops: QueuedOp[]): Promise<void>;
  deleteOps(opIds: string[]): Promise<void>;
  getRest(userId: string, sessionId: string): Promise<RestState | null>;
  putRest(userId: string, sessionId: string, rest: RestState | null): Promise<void>;
  /** Copia local de la ejecución abierta (para restaurarla sin red). */
  putSessionCopy(copy: LocalSessionCopy): Promise<void>;
  getSessionCopy(userId: string, sessionId: string): Promise<LocalSessionCopy | null>;
  /** Copias locales de un usuario, la más reciente primero. */
  listSessionCopies(userId: string): Promise<LocalSessionCopy[]>;
  /** Último usuario que abrió una ejecución aquí; al cambiar, se borran las copias del anterior. */
  getLastUser(): Promise<string | null>;
  setLastUser(userId: string): Promise<void>;
  /** Borra TODO lo privado de un usuario (copias, cola y descanso). */
  clearUser(userId: string): Promise<void>;
  /** Operaciones del usuario aún en el dispositivo (pendientes, rechazadas o en conflicto). */
  countPending(userId: string): Promise<number>;
}

const restKey = (userId: string, sessionId: string) => `${userId}:${sessionId}:rest`;
export const sessionKey = (userId: string, sessionId: string) => `${userId}:${sessionId}`;

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
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Migración incremental: crea lo que falte (v1 a v2 conserva la cola existente).
      // Además, migrateOp y migrateSessionCopy convierten cada registro al leerlo.
      if (!db.objectStoreNames.contains(OPS)) {
        const store = db.createObjectStore(OPS, { keyPath: "opId" });
        store.createIndex("byUserSession", ["userId", "sessionId"]);
      }
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: "key" }).createIndex("byUser", "userId");
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
  });
}

/** Almacén en memoria (sin IndexedDB). También se usa en las pruebas unitarias. */
export function memoryStore(): ExecutionStore {
  const ops = new Map<string, QueuedOp>();
  const state = new Map<string, RestState | null>();
  const sessions = new Map<string, LocalSessionCopy>();
  let lastUser: string | null = null;
  return {
    available: false,
    listOps: async (userId, sessionId) => [...ops.values()].filter((o) => o.userId === userId && o.sessionId === sessionId),
    putOps: async (list) => list.forEach((o) => ops.set(o.opId, o)),
    deleteOps: async (ids) => ids.forEach((id) => ops.delete(id)),
    getRest: async (u, s) => state.get(restKey(u, s)) ?? null,
    putRest: async (u, s, rest) => void state.set(restKey(u, s), rest),
    putSessionCopy: async (copy) => void sessions.set(copy.key, copy),
    getSessionCopy: async (u, s) => sessions.get(sessionKey(u, s)) ?? null,
    listSessionCopies: async (u) => [...sessions.values()].filter((c) => c.userId === u).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    getLastUser: async () => lastUser,
    setLastUser: async (userId) => {
      if (lastUser !== userId) for (const [k, c] of sessions) if (c.userId !== userId) sessions.delete(k);
      lastUser = userId;
    },
    clearUser: async (userId) => {
      for (const [k, o] of ops) if (o.userId === userId) ops.delete(k);
      for (const k of [...state.keys()]) if (k.startsWith(`${userId}:`)) state.delete(k);
      for (const [k, c] of sessions) if (c.userId === userId) sessions.delete(k);
      if (lastUser === userId) lastUser = null;
    },
    countPending: async (userId) => [...ops.values()].filter((o) => o.userId === userId).length,
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
      async putSessionCopy(copy) {
        const tx = db.transaction(SESSIONS, "readwrite");
        tx.objectStore(SESSIONS).put(copy);
        await done(tx);
      },
      async getSessionCopy(userId, sessionId) {
        const tx = db.transaction(SESSIONS, "readonly");
        const row = await request(tx.objectStore(SESSIONS).get(sessionKey(userId, sessionId)));
        const copy = migrateSessionCopy(row);
        return copy && copy.userId === userId && copy.sessionId === sessionId ? copy : null;
      },
      async listSessionCopies(userId) {
        const tx = db.transaction(SESSIONS, "readonly");
        const rows = await request(tx.objectStore(SESSIONS).index("byUser").getAll(userId));
        return rows
          .map(migrateSessionCopy)
          .filter((c): c is LocalSessionCopy => c !== null && c.userId === userId)
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      },
      async getLastUser() {
        const tx = db.transaction(META, "readonly");
        const row = (await request(tx.objectStore(META).get(LAST_USER))) as { value: string } | undefined;
        return row?.value ?? null;
      },
      async setLastUser(userId) {
        const tx = db.transaction([META, SESSIONS], "readwrite");
        const sessions = tx.objectStore(SESSIONS);
        // Otro usuario entró en este dispositivo: las copias del anterior no deben quedar a la vista.
        const all = (await request(sessions.getAll())) as LocalSessionCopy[];
        for (const c of all) if (c.userId !== userId) sessions.delete(c.key);
        tx.objectStore(META).put({ key: LAST_USER, value: userId });
        await done(tx);
      },
      async clearUser(userId) {
        const tx = db.transaction([OPS, STATE, SESSIONS, META], "readwrite");
        const ops = (await request(tx.objectStore(OPS).getAll())) as QueuedOp[];
        for (const o of ops) if (o.userId === userId) tx.objectStore(OPS).delete(o.opId);
        const states = (await request(tx.objectStore(STATE).getAll())) as { key: string }[];
        for (const st of states) if (st.key.startsWith(`${userId}:`)) tx.objectStore(STATE).delete(st.key);
        const copies = (await request(tx.objectStore(SESSIONS).getAll())) as LocalSessionCopy[];
        for (const c of copies) if (c.userId === userId) tx.objectStore(SESSIONS).delete(c.key);
        const last = (await request(tx.objectStore(META).get(LAST_USER))) as { value: string } | undefined;
        if (last?.value === userId) tx.objectStore(META).delete(LAST_USER);
        await done(tx);
      },
      async countPending(userId) {
        const tx = db.transaction(OPS, "readonly");
        const ops = (await request(tx.objectStore(OPS).getAll())) as QueuedOp[];
        return ops.filter((o) => o.userId === userId).length;
      },
    };
  })();
  return storePromise;
}
