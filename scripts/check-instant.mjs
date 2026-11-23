// Verificación de navegación instantánea (fase 14).
//
// Next.js solo valida "instant navigation" en `next dev`: los errores
// "uncached data during prerendering or a navigation" aparecen en la consola
// del navegador, no en el build de producción que usan las e2e. Este script
// recorre las rutas del coach y del atleta contra un `next dev` YA EN MARCHA,
// por carga directa y por navegación cliente desde Inicio, y falla (código 1)
// si aparece cualquier error de consola o de página.
//
// Uso: npm run check:instant [-- --base http://localhost:3000]
// Requiere las sesiones de prueba (npx playwright test --project=setup).
//
// Clasificación:
//   - error (console.error / excepción de página): FALLA. Incluye las
//     validaciones de Next (blocking-route) y errores de la app.
//   - warning: se lista, no falla (p. ej. avisos de desarrollo de React).
//   - log/info (Fast Refresh, React DevTools): se ignoran.
// No imprime cookies, tokens ni datos de usuarios.

import { existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = args.base ?? "http://localhost:3000";
const AUTH = "tests/e2e/.auth";
if (!existsSync(`${AUTH}/coach.json`) || !existsSync(`${AUTH}/athlete.json`)) {
  console.error("Faltan las sesiones de prueba: ejecuta `npx playwright test --project=setup`.");
  process.exit(1);
}
const ids = existsSync(`${AUTH}/ids.json`) ? JSON.parse(readFileSync(`${AUTH}/ids.json`, "utf8")) : {};
const SYSTEM_EXERCISE = "00000000-0000-4000-8000-000000000001";

const groups = [
  {
    role: "atleta",
    state: `${AUTH}/athlete.json`,
    home: "/atleta/inicio",
    routes: ["/atleta/inicio", "/atleta/agenda", "/atleta/sesiones", "/atleta/progreso", "/atleta/perfil", `/atleta/ejercicios/${SYSTEM_EXERCISE}`],
  },
  {
    role: "coach",
    state: `${AUTH}/coach.json`,
    home: "/coach/inicio",
    routes: [
      "/coach/inicio",
      "/coach/calendario",
      "/coach/atletas",
      "/coach/entrenamientos",
      "/coach/biblioteca",
      "/coach/progreso",
      "/coach/mensajes",
      "/coach/configuracion",
      "/coach/avisos",
      "/coach/sesiones/nueva",
      "/coach/biblioteca/nuevo",
      "/coach/entrenamientos/nueva",
      `/coach/biblioteca/${SYSTEM_EXERCISE}`,
      ...(ids.athleteId ? [`/coach/atletas/${ids.athleteId}`, `/coach/progreso/${ids.athleteId}`] : []),
    ],
  },
];

const errors = [];
const warnings = [];
const short = (t) => t.replace(/\s+/g, " ").slice(0, 300);
const browser = await chromium.launch();
try {
  for (const g of groups) {
    const ctx = await browser.newContext({ storageState: g.state, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    let where = "";
    page.on("console", (m) => {
      if (m.type() === "error") errors.push({ where, text: short(m.text()) });
      else if (m.type() === "warning") warnings.push({ where, text: short(m.text()) });
    });
    page.on("pageerror", (e) => errors.push({ where, text: `Error de página: ${short(e.message)}` }));

    for (const r of g.routes) {
      where = `carga ${r}`;
      await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 120_000 });
      // La validación de Next termina después de la hidratación.
      await page.waitForTimeout(1500);
    }
    for (const r of g.routes) {
      if (r === g.home) continue;
      where = `carga ${g.home}`;
      await page.goto(BASE + g.home, { waitUntil: "networkidle", timeout: 120_000 });
      const link = page.locator(`a[href="${r}"]:not(main a)`).filter({ visible: true }).first();
      if ((await link.count()) === 0) continue;
      where = `navegación ${g.home} → ${r}`;
      await link.click();
      await page.waitForURL(BASE + r, { timeout: 60_000 }).catch(() => {});
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const unique = (list) => [...new Map(list.map((e) => [`${e.where}|${e.text.slice(0, 160)}`, e])).values()];
for (const w of unique(warnings)) console.log(`aviso   [${w.where}] ${w.text}`);
for (const e of unique(errors)) console.log(`ERROR   [${e.where}] ${e.text}`);
console.log(`\n${unique(errors).length} errores · ${unique(warnings).length} avisos de desarrollo`);
process.exit(errors.length ? 1 : 0);
