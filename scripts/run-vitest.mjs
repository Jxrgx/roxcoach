// Lanza Vitest con la letra de unidad normalizada en Windows.
// Si la terminal abre el proyecto como `c:\...` (minúscula), Vitest carga dos
// instancias de su runner y falla con "failed to find the current suite".
import { spawnSync } from "node:child_process";

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const result = spawnSync("npx", ["vitest", ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
