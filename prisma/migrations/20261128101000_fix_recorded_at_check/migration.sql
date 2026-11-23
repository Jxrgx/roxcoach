-- Una corrección actualiza recorded_at pero no created_at: la cota debe ser
-- respecto a la última escritura (updated_at), no a la creación.
ALTER TABLE "set_logs" DROP CONSTRAINT "set_logs_recorded_at_check";
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_recorded_at_check"
  CHECK ("recorded_at" IS NULL OR "recorded_at" <= "updated_at" + interval '5 minutes');
