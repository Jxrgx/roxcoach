-- read_at lo fija el servidor de la app y created_at la BD (now()): con relojes
-- distintos, "leído antes de crearse" podría rechazar un "marcar como leído"
-- válido. La regla no protege nada importante, así que se elimina.
ALTER TABLE "coach_alerts" DROP CONSTRAINT "coach_alerts_read_check";
