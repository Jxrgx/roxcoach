import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/idb";
import { applyResults, createOp, mergeSets, nextBatch, restRemaining, toWire, type QueuedOp } from "@/lib/offline/queue";
import { buildSessionCopy, decideRestore, migrateSessionCopy, sessionIdFromPath, type LocalSessionCopy } from "@/lib/offline/restore";
import { activeSeconds } from "@/lib/execution/progress";

/** Reglas del service worker cargadas como las carga el navegador (script clásico). */
interface RoxSW {
  SW_VERSION: string;
  PREFIX: string;
  STATIC_CACHE: string;
  PAGES_CACHE: string;
  OFFLINE_SHELL: string;
  OFFLINE_PAGE: string;
  currentCaches(): string[];
  staleCaches(names: string[]): string[];
  classify(req: { method: string; url: string; mode?: string; headers?: Record<string, string> }, origin: string): "navigation" | "static" | "ignore";
  fallbackFor(pathname: string): string;
  offlineRedirect(url: string): string | null;
  isCacheableResponse(res: { status: number; type?: string; redirected?: boolean; headers: Record<string, string> }): boolean;
  assetUrlsFromHtml(html: string): string[];
}
const sandbox: { self: { RoxSW?: RoxSW }; URL: typeof URL } = { self: {}, URL };
runInNewContext(readFileSync(join(process.cwd(), "public/sw-rules.js"), "utf8"), sandbox);
const SW = sandbox.self.RoxSW!;
const ORIGIN = "https://roxcoach.test";
const SESSION = "11111111-1111-4111-8111-111111111111";

describe("service worker: versionado y limpieza", () => {
  it("las cachés llevan prefijo y versión", () => {
    expect(SW.STATIC_CACHE).toBe(`roxcoach-static-${SW.SW_VERSION}`);
    expect(SW.currentCaches()).toEqual([SW.STATIC_CACHE, SW.PAGES_CACHE]);
  });

  it("borra solo cachés de RoxCoach de versiones anteriores", () => {
    const names = ["roxcoach-static-2026-01-01.1", "roxcoach-pages-viejo", SW.STATIC_CACHE, SW.PAGES_CACHE, "otra-app-cache"];
    expect(SW.staleCaches(names)).toEqual(["roxcoach-static-2026-01-01.1", "roxcoach-pages-viejo"]);
  });
});

describe("service worker: qué intercepta", () => {
  const get = (path: string, extra: Partial<{ mode: string; headers: Record<string, string>; method: string }> = {}) =>
    SW.classify({ method: "GET", url: `${ORIGIN}${path}`, ...extra }, ORIGIN);

  it("estáticos con hash, iconos y manifest: primero caché", () => {
    expect(get("/_next/static/chunks/app-abc123.js")).toBe("static");
    expect(get("/icons/icon-192.png")).toBe("static");
    expect(get("/manifest.webmanifest")).toBe("static");
  });

  it("navegaciones: red con respaldo offline", () => {
    expect(get(`/atleta/sesiones/${SESSION}/ejecutar`, { mode: "navigate" })).toBe("navigation");
    expect(get("/coach/inicio", { mode: "navigate" })).toBe("navigation");
  });

  it("no toca POST, Server Actions, RSC, datos privados ni otros orígenes", () => {
    expect(get(`/atleta/sesiones/${SESSION}/ejecutar`, { method: "POST" })).toBe("ignore");
    expect(get("/atleta/inicio", { headers: { "Next-Action": "abc" } })).toBe("ignore");
    expect(get("/atleta/inicio?_rsc=1x2y")).toBe("ignore");
    expect(get("/atleta/inicio", { headers: { RSC: "1" } })).toBe("ignore");
    expect(get("/api/algo")).toBe("ignore");
    expect(get("/atleta/progreso")).toBe("ignore"); // fetch no navegacional
    expect(SW.classify({ method: "GET", url: "https://xyz.supabase.co/auth/v1/user" }, ORIGIN)).toBe("ignore");
  });

  it("rutas offline no disponibles: la ejecución usa el shell, todo lo demás /sin-conexion", () => {
    expect(SW.fallbackFor(`/atleta/sesiones/${SESSION}/ejecutar`)).toBe(SW.OFFLINE_SHELL);
    expect(SW.fallbackFor(`/atleta/sesiones/${SESSION}`)).toBe(SW.OFFLINE_PAGE);
    expect(SW.fallbackFor("/coach/inicio")).toBe(SW.OFFLINE_PAGE);
    expect(SW.fallbackFor(SW.OFFLINE_SHELL)).toBe(SW.OFFLINE_SHELL); // el destino de la redirección
    expect(SW.fallbackFor(SW.OFFLINE_PAGE)).toBe(SW.OFFLINE_PAGE);
    expect(SW.fallbackFor("/atleta/sesiones/no-es-uuid/ejecutar")).toBe(SW.OFFLINE_PAGE);
  });

  it("redirige (no sirve con otra URL) y conserva el contexto para volver", () => {
    expect(SW.offlineRedirect(`${ORIGIN}/atleta/sesiones/${SESSION}/ejecutar`)).toBe(`/offline/ejecucion?sesion=${SESSION}`);
    expect(SW.offlineRedirect(`${ORIGIN}/atleta/progreso?periodo=7`)).toBe(`/sin-conexion?desde=${encodeURIComponent("/atleta/progreso?periodo=7")}`);
    // Ya es una página offline: se sirve directo desde la caché.
    expect(SW.offlineRedirect(`${ORIGIN}/sin-conexion?desde=%2Fx`)).toBeNull();
    expect(SW.offlineRedirect(`${ORIGIN}/offline/ejecucion?sesion=${SESSION}`)).toBeNull();
  });
});

describe("service worker: nunca guarda respuestas privadas", () => {
  it("acepta solo 200 públicas, sin cookies ni redirecciones", () => {
    expect(SW.isCacheableResponse({ status: 200, type: "basic", headers: { "cache-control": "public, max-age=31536000, immutable" } })).toBe(true);
    expect(SW.isCacheableResponse({ status: 200, type: "basic", headers: { "Set-Cookie": "sb=1" } })).toBe(false);
    expect(SW.isCacheableResponse({ status: 200, type: "basic", headers: { "Cache-Control": "private, no-cache" } })).toBe(false);
    expect(SW.isCacheableResponse({ status: 200, type: "basic", headers: { "cache-control": "no-store" } })).toBe(false);
    expect(SW.isCacheableResponse({ status: 302, type: "basic", headers: {} })).toBe(false);
    expect(SW.isCacheableResponse({ status: 200, type: "basic", redirected: true, headers: {} })).toBe(false);
    expect(SW.isCacheableResponse({ status: 200, type: "opaque", headers: {} })).toBe(false);
  });

  it("descubre los JS/CSS de una página offline", () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/a1.css"/><script src="/_next/static/chunks/b2.js" async></script><script src="/_next/static/chunks/b2.js"></script><img src="/icons/x.png">`;
    expect(SW.assetUrlsFromHtml(html)).toEqual(["/_next/static/css/a1.css", "/_next/static/chunks/b2.js"]);
  });
});

const copy = (userId: string, over: Partial<LocalSessionCopy> = {}): LocalSessionCopy =>
  buildSessionCopy(
    {
      userId,
      sessionId: SESSION,
      title: "Sesión",
      snapshot: { version: 1, templateName: "T", focus: null, intensity: "media", estimatedMinutes: 30, blocks: [] },
      unit: "kg",
      log: { startedAt: "2026-11-24T18:00:00.000Z", pausedAt: null, pausedSeconds: 0 },
      sets: [],
      ...over,
    },
    new Date("2026-11-24T18:05:00Z"),
  );

let n = 0;
const op = (userId: string, kind: QueuedOp["kind"], status: QueuedOp["status"] = "pending") => ({
  ...createOp({ userId, sessionId: SESSION, seq: ++n, kind, now: new Date("2026-11-24T18:10:00Z") }, kind === "logSet" ? { position: { blockIndex: 0, exerciseIndex: 0, setNumber: 1 }, input: { amount: "1", load: "", rpe: "" }, expect: { kind: "new" }, preview: { actualReps: 1, actualDistanceMeters: null, actualDurationSeconds: null, actualLoadKg: null, rpe: null } } : {}, () => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`),
  status,
});
const PATH = `/atleta/sesiones/${SESSION}/ejecutar`;

describe("restauración desde IndexedDB", () => {
  it("restaura la copia del último usuario con sus pendientes y conflictos", () => {
    const ops = [op("a", "logSet"), op("a", "logSet", "conflict")];
    const d = decideRestore({ pathname: PATH, lastUser: "a", copy: copy("a"), ops });
    expect(d.kind).toBe("restore");
    if (d.kind === "restore") expect(d.ops.map((o) => o.status)).toEqual(["pending", "conflict"]);
  });

  it("sin usuario o sin copia local: no inventa datos", () => {
    expect(decideRestore({ pathname: PATH, lastUser: null, copy: null, ops: [] })).toEqual({ kind: "none", reason: "no-user" });
    expect(decideRestore({ pathname: PATH, lastUser: "a", copy: null, ops: [] })).toEqual({ kind: "none", reason: "no-copy" });
    expect(decideRestore({ pathname: "/atleta/progreso", lastUser: "a", copy: copy("a"), ops: [] })).toEqual({ kind: "none", reason: "not-execution" });
  });

  it("A no puede recuperar la copia de B", () => {
    expect(decideRestore({ pathname: PATH, lastUser: "a", copy: copy("b"), ops: [] })).toEqual({ kind: "none", reason: "no-copy" });
    const d = decideRestore({ pathname: PATH, lastUser: "a", copy: copy("a"), ops: [op("b", "logSet")] });
    expect(d.kind === "restore" && d.ops).toEqual([]);
  });

  it("sesión finalizada localmente: resumen local con reintento", () => {
    expect(decideRestore({ pathname: PATH, lastUser: "a", copy: copy("a"), ops: [op("a", "logSet"), op("a", "finish")] }).kind).toBe("finished");
  });

  it("versiones de la copia y lectura de la ruta", () => {
    expect(migrateSessionCopy(copy("a"))).not.toBeNull();
    expect(migrateSessionCopy({ ...copy("a"), v: 0 })).toBeNull();
    expect(migrateSessionCopy({ ...copy("a"), sets: "x" })).toBeNull();
    expect(sessionIdFromPath(PATH.toUpperCase().replace("/ATLETA/SESIONES/", "/atleta/sesiones/").replace("/EJECUTAR", "/ejecutar"))).toBe(SESSION);
  });
});

describe("almacén local: cambio de usuario y cierre de sesión", () => {
  it("al entrar otro usuario se borran las copias del anterior; al cerrar sesión, todo lo suyo", async () => {
    const store = memoryStore();
    await store.setLastUser("a");
    await store.putSessionCopy(copy("a"));
    await store.putOps([op("a", "logSet")]);
    await store.putRest("a", SESSION, { startedAt: "2026-11-24T18:00:00Z", seconds: 60, nextIndex: 1 });
    expect(await store.countPending("a")).toBe(1);

    await store.setLastUser("b"); // otro atleta en el mismo dispositivo
    expect(await store.getSessionCopy("a", SESSION)).toBeNull();

    await store.setLastUser("a");
    await store.putSessionCopy(copy("a"));
    await store.clearUser("a");
    expect(await store.getSessionCopy("a", SESSION)).toBeNull();
    expect(await store.listOps("a", SESSION)).toEqual([]);
    expect(await store.getRest("a", SESSION)).toBeNull();
    expect(await store.getLastUser()).toBeNull();
  });
});

describe("después de recargar", () => {
  it("el temporizador se recupera desde timestamps (sin ticks)", () => {
    const c = copy("a", { log: { startedAt: "2026-11-24T18:00:00.000Z", pausedAt: "2026-11-24T18:20:00.000Z", pausedSeconds: 60 } });
    expect(activeSeconds({ startedAt: new Date(c.log.startedAt), pausedAt: new Date(c.log.pausedAt!), pausedSeconds: c.log.pausedSeconds, finishedAt: null }, new Date("2026-11-24T19:00:00Z"))).toBe(1140);
    expect(restRemaining({ startedAt: "2026-11-24T18:00:00Z", seconds: 90, nextIndex: 1 }, new Date("2026-11-24T18:01:00Z"))).toBe(30);
  });

  it("la cola restaurada se envía en orden y reenviar no duplica (idempotencia)", () => {
    const ops = [op("a", "logSet"), op("a", "pause"), op("a", "resume")];
    const batch = nextBatch(ops).map(toWire);
    expect(batch.map((w) => w.kind)).toEqual(["logSet", "pause", "resume"]);
    // El servidor ya había aplicado la primera (envío previo a la recarga): duplicada = éxito.
    const after = applyResults(ops, [
      { opId: batch[0]!.opId, outcome: "duplicate" },
      { opId: batch[1]!.opId, outcome: "applied" },
      { opId: batch[2]!.opId, outcome: "applied" },
    ]);
    expect(after).toEqual([]);
    // Las series de la copia + las pendientes se muestran juntas tras recargar.
    expect(mergeSets(copy("a").sets, [op("a", "logSet")]).size).toBe(1);
  });
});
