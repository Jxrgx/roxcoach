-- Corrige scheduled_sessions_snapshot_check (migración add_scheduled_sessions).
-- jsonb_typeof de una clave inexistente es NULL y un CHECK con NULL no falla:
-- un snapshot sin "blocks" pasaba. coalesce lo convierte en falso.
ALTER TABLE "scheduled_sessions" DROP CONSTRAINT "scheduled_sessions_snapshot_check";
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_snapshot_check" CHECK (
  coalesce(jsonb_typeof("snapshot"), '') = 'object' AND
  coalesce(jsonb_typeof("snapshot" -> 'version'), '') = 'number' AND
  coalesce(jsonb_typeof("snapshot" -> 'blocks'), '') = 'array'
);
