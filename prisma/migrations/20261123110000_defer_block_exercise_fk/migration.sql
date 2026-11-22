-- Corrige block_exercises_exercise_id_fkey (migración add_workout_templates).
-- Con NO ACTION inmediato, borrar la cuenta de un coach fallaba: la cascada
-- borra sus ejercicios y Postgres revisa la FK antes de terminar de borrar los
-- bloques de sus plantillas (que también caen en cascada).
-- DEFERRABLE INITIALLY DEFERRED revisa al confirmar la transacción, cuando la
-- cascada ya terminó. Se conserva la protección: un ejercicio usado en una
-- plantilla sigue sin poder borrarse por sí solo.
ALTER TABLE "block_exercises" DROP CONSTRAINT "block_exercises_exercise_id_fkey";
ALTER TABLE "block_exercises" ADD CONSTRAINT "block_exercises_exercise_id_fkey"
  FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
