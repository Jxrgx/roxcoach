-- Avisos que ya no requieren atención (fase 9, cierre): p. ej. una sesión
-- "no iniciada" que el atleta comenzó, que se canceló o de la que se retiró al
-- atleta. Es independiente de read_at: no reactiva ni marca como leído nada.
ALTER TABLE "coach_alerts" ADD COLUMN "resolved_at" TIMESTAMPTZ(6);
