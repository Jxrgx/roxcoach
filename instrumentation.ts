/**
 * Se ejecuta una vez al arrancar el servidor (no durante `next build`).
 * En producción valida la configuración y detiene el arranque si falta algo:
 * es preferible fallar al desplegar que enviar enlaces con un dominio
 * equivocado. El error solo nombra variables, nunca sus valores.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { formatEnvProblems, validateEnv } = await import("@/lib/config/env-rules");
  const problems = validateEnv(process.env, "production");
  if (problems.length > 0) throw new Error(formatEnvProblems(problems));
}
