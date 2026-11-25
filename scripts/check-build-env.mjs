// Validación de variables ANTES de `next build` (fase 15).
//
// En Vercel (Preview y Production) el build falla si falta una variable
// obligatoria, si hay variables de pruebas, si se mezclan proyectos de Supabase
// o si Production no cumple sus reglas. El mensaje solo nombra variables y
// motivos, nunca valores. En builds locales (dev, e2e) no hace nada.
//
// Vive aquí y no en next.config.ts porque next.config no debe importar módulos
// que también usa la app: en `next dev` provoca un bucle de recargas.
// Node 24 ejecuta el módulo TypeScript directamente (solo tipos borrables).

import { buildTimeProblems, formatEnvProblems } from "../lib/config/env-rules.ts";

const problems = buildTimeProblems(process.env);
if (problems.length > 0) {
  console.error(formatEnvProblems(problems));
  process.exit(1);
}
