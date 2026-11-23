// Mide la navegación cliente entre módulos del coach y del atleta (fase 14).
//
// Uso (con un servidor ya en marcha, p. ej. el de las e2e en :3100 o `npm start`).
// `--slow 1` simula 4G lenta y CPU ×4:
//   node scripts/measure-navigation.mjs [--base http://localhost:3100] [--runs 5] [--slow 1] [--json salida.json] [--serverlog server.log] [--only perfil]
//
// Requiere las sesiones de prueba de Playwright (tests/e2e/.auth/coach.json y
// athlete.json): ejecuta antes `npx playwright test --project=setup`.
//
// Por cada navegación (desde Inicio, con clic en el enlace de la navegación) registra:
//   - estructura: ms hasta que la pantalla nueva muestra algo propio (su título o su
//     estado de carga) en lugar de la pantalla anterior;
//   - datos: ms hasta que el título de destino es visible y no queda ningún estado de
//     carga (role="status" con esqueletos) visible en <main>;
//   - peticiones RSC de la navegación y de prefetch (las de los enlaces de la pantalla nueva),
//     y cuántas se repitieron exactamente (misma ruta y segmento);
//   - errores de consola y de página;
//   - con --serverlog <archivo>: consultas a la base de datos durante la navegación. Requiere
//     un servidor iniciado con ROXCOACH_DB_TRACE=1 y su salida redirigida a ese archivo.
// No imprime cookies, tokens ni datos de usuarios.

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = args.base ?? "http://localhost:3100";
const RUNS = Number(args.runs ?? 5);
const queryLines = () => (args.serverlog ? readFileSync(args.serverlog, "utf8").split(/\r?\n/).filter((l) => l.startsWith("[q] ")) : []);

const SCENARIOS = [
  { role: "athlete", state: "tests/e2e/.auth/athlete.json", from: "/atleta/inicio", fromTitle: /^Hola,/, to: "/atleta/perfil", title: /^Perfil$/ },
  { role: "athlete", state: "tests/e2e/.auth/athlete.json", from: "/atleta/inicio", fromTitle: /^Hola,/, to: "/atleta/progreso", title: /^Progreso$/ },
  { role: "athlete", state: "tests/e2e/.auth/athlete.json", from: "/atleta/inicio", fromTitle: /^Hola,/, to: "/atleta/agenda", title: /^Agenda$/ },
  { role: "athlete", state: "tests/e2e/.auth/athlete.json", from: "/atleta/inicio", fromTitle: /^Hola,/, to: "/atleta/sesiones", title: /^Entrenamiento/ },
  { role: "coach", state: "tests/e2e/.auth/coach.json", from: "/coach/inicio", fromTitle: /^Hola,/, to: "/coach/atletas", title: /^Atletas$/ },
  { role: "coach", state: "tests/e2e/.auth/coach.json", from: "/coach/inicio", fromTitle: /^Hola,/, to: "/coach/calendario", title: /^Calendario$/ },
  { role: "coach", state: "tests/e2e/.auth/coach.json", from: "/coach/inicio", fromTitle: /^Hola,/, to: "/coach/biblioteca", title: /^Biblioteca/ },
  { role: "coach", state: "tests/e2e/.auth/coach.json", from: "/coach/inicio", fromTitle: /^Hola,/, to: "/coach/entrenamientos", title: /^Entrenamientos$/ },
  { role: "coach", state: "tests/e2e/.auth/coach.json", from: "/coach/inicio", fromTitle: /^Hola,/, to: "/coach/avisos", title: /^Avisos$/ },
];

/** Observador en la página: marca los tiempos con requestAnimationFrame. */
function installObserver({ to, title, fromTitle }) {
  const titleRe = new RegExp(title.source);
  const fromRe = new RegExp(fromTitle.source);
  const visible = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const t0 = performance.now();
  const out = { structure: null, data: null };
  window.__nav = out;
  const tick = () => {
    const main = document.querySelector("main");
    const h1s = [...(main?.querySelectorAll("h1") ?? [])].filter(visible).map((h) => h.textContent.trim());
    const loading = [...(main?.querySelectorAll('[role="status"]') ?? [])].some((s) => visible(s) && s.querySelector(".animate-pulse"));
    const onTarget = location.pathname === to;
    const showsTarget = h1s.some((t) => titleRe.test(t));
    const showsPrevious = h1s.some((t) => fromRe.test(t));
    if (out.structure === null && onTarget && (showsTarget || (loading && !showsPrevious))) out.structure = performance.now() - t0;
    if (out.data === null && onTarget && showsTarget && !loading) out.data = performance.now() - t0;
    if (out.data === null && performance.now() - t0 < 30_000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
  if (s.length === 0) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const browser = await chromium.launch();
const results = [];
const consoleErrors = [];
try {
  for (const sc of SCENARIOS.filter((x) => !args.only || x.to.includes(args.only))) {
    const samples = [];
    for (let run = 0; run < RUNS; run++) {
      const context = await browser.newContext({ storageState: sc.state, baseURL: BASE, viewport: { width: 1280, height: 800 }, locale: "es-MX", timezoneId: "America/Mexico_City" });
      const page = await context.newPage();
      if (args.slow !== undefined) {
        // Dispositivo modesto con 4G lenta: 150 ms de latencia, ~1.6 Mbps de bajada y CPU ×4.
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      page.on("console", (m) => m.type() === "error" && consoleErrors.push({ route: new URL(page.url()).pathname, text: m.text().slice(0, 300) }));
      page.on("pageerror", (e) => consoleErrors.push({ route: new URL(page.url()).pathname, text: `pageerror: ${e.message.slice(0, 300)}` }));
      await page.goto(sc.from, { waitUntil: "networkidle" });
      const rsc = [];
      page.on("request", (r) => {
        const u = new URL(r.url());
        const h = r.headers();
        if (!(u.searchParams.has("_rsc") || h["rsc"] === "1")) return;
        // Prefetch (App Shell de los enlaces visibles) vs. la navegación que trae los datos.
        const prefetch = Boolean(h["next-router-prefetch"] || h["next-router-segment-prefetch"]);
        rsc.push({ prefetch, key: `${r.method()} ${u.pathname} ${h["next-router-segment-prefetch"] ?? ""}` });
      });
      await page.waitForTimeout(300);
      const q0 = queryLines().length;
      await page.evaluate(installObserver, { to: sc.to, title: sc.title, fromTitle: sc.fromTitle });
      // Enlace de la navegación (barra lateral o superior, fuera de <main>; visible a 1280 px).
      await page.locator(`a[href="${sc.to}"]:not(main a)`).filter({ visible: true }).first().click();
      await page.waitForFunction(() => window.__nav?.data !== null, null, { timeout: 30_000 }).catch(() => {});
      const nav = await page.evaluate(() => window.__nav);
      await page.waitForLoadState("networkidle");
      const queries = queryLines().slice(q0);
      // Repetida = la MISMA petición (ruta + segmento) más de una vez.
      const counts = rsc.reduce((m, r) => m.set(r.key, (m.get(r.key) ?? 0) + 1), new Map());
      samples.push({
        structure: nav.structure,
        data: nav.data,
        rsc: rsc.filter((r) => !r.prefetch).length,
        prefetch: rsc.filter((r) => r.prefetch).length,
        repeated: [...counts.values()].filter((n) => n > 1).length,
        queries: queries.length,
      });
      await context.close();
    }
    const row = {
      role: sc.role,
      nav: `${sc.from} → ${sc.to}`,
      structureMs: Math.round(median(samples.map((s) => s.structure)) ?? -1),
      dataMs: Math.round(median(samples.map((s) => s.data)) ?? -1),
      rscRequests: median(samples.map((s) => s.rsc)),
      prefetchRequests: median(samples.map((s) => s.prefetch)),
      repeatedRsc: Math.max(...samples.map((s) => s.repeated)),
      queries: args.serverlog ? median(samples.map((s) => s.queries)) : null,
      samples: samples.map((s) => [s.structure && Math.round(s.structure), s.data && Math.round(s.data)]),
    };
    results.push(row);
    console.log(`${row.nav.padEnd(42)} estructura ${String(row.structureMs).padStart(5)} ms · datos ${String(row.dataMs).padStart(5)} ms · RSC navegación ${row.rscRequests} / prefetch ${row.prefetchRequests} (repetidas ${row.repeatedRsc})${row.queries === null ? "" : ` · consultas BD ${row.queries}`}`);
  }
} finally {
  await browser.close();
}
console.log(`Errores de consola: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 20)) console.log(`  [${e.route}] ${e.text}`);
if (args.json) writeFileSync(args.json, JSON.stringify({ base: BASE, runs: RUNS, results, consoleErrors }, null, 2));
