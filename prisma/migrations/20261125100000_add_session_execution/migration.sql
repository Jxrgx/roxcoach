-- CreateEnum
CREATE TYPE "session_log_status" AS ENUM ('en_curso', 'completada');

-- CreateEnum
CREATE TYPE "discomfort_zone" AS ENUM ('cuello', 'hombro', 'codo_muneca', 'espalda_alta', 'espalda_baja', 'cadera', 'muslo', 'rodilla', 'pantorrilla', 'tobillo_pie', 'otra');

-- CreateEnum
CREATE TYPE "discomfort_intensity" AS ENUM ('leve', 'moderada', 'fuerte');

-- CreateTable
CREATE TABLE "session_logs" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "status" "session_log_status" NOT NULL DEFAULT 'en_curso',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ(6),
    "paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "finished_at" TIMESTAMPTZ(6),
    "rpe" INTEGER,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_logs" (
    "id" UUID NOT NULL,
    "session_log_id" UUID NOT NULL,
    "block_index" INTEGER NOT NULL,
    "exercise_index" INTEGER NOT NULL,
    "set_number" INTEGER NOT NULL,
    "actual_reps" INTEGER,
    "actual_distance_meters" INTEGER,
    "actual_duration_seconds" INTEGER,
    "actual_load_kg" DOUBLE PRECISION,
    "rpe" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discomfort_reports" (
    "id" UUID NOT NULL,
    "session_log_id" UUID NOT NULL,
    "zone" "discomfort_zone" NOT NULL,
    "intensity" "discomfort_intensity" NOT NULL,
    "note" TEXT,
    "block_index" INTEGER,
    "exercise_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discomfort_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_logs_assignment_id_key" ON "session_logs"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "set_logs_session_log_id_block_index_exercise_index_set_numb_key" ON "set_logs"("session_log_id", "block_index", "exercise_index", "set_number");

-- CreateIndex
CREATE INDEX "discomfort_reports_session_log_id_idx" ON "discomfort_reports"("session_log_id");

-- AddForeignKey
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_log_id_fkey" FOREIGN KEY ("session_log_id") REFERENCES "session_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discomfort_reports" ADD CONSTRAINT "discomfort_reports_session_log_id_fkey" FOREIGN KEY ("session_log_id") REFERENCES "session_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas en la base de datos (SQL manual)
-- ============================================================================

-- session_logs: estado coherente con sus fechas y rangos de la retroalimentación.
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_finished_check"
  CHECK (("status" = 'completada') = ("finished_at" IS NOT NULL));
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_not_paused_when_done_check"
  CHECK ("status" = 'en_curso' OR "paused_at" IS NULL);
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_times_check"
  CHECK ("finished_at" IS NULL OR "finished_at" >= "started_at");
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_paused_seconds_check"
  CHECK ("paused_seconds" >= 0);
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_rpe_check"
  CHECK ("rpe" IS NULL OR "rpe" BETWEEN 1 AND 10);
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_comment_length_check"
  CHECK ("comment" IS NULL OR char_length("comment") <= 1000);

-- set_logs: posición válida, rangos reales y al menos un valor registrado.
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_position_check"
  CHECK ("block_index" >= 0 AND "exercise_index" >= 0 AND "set_number" >= 1);
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_ranges_check" CHECK (
  ("actual_reps" IS NULL OR "actual_reps" BETWEEN 0 AND 10000) AND
  ("actual_distance_meters" IS NULL OR "actual_distance_meters" BETWEEN 0 AND 100000) AND
  ("actual_duration_seconds" IS NULL OR "actual_duration_seconds" BETWEEN 0 AND 86400) AND
  ("actual_load_kg" IS NULL OR ("actual_load_kg" >= 0 AND "actual_load_kg" <= 500)) AND
  ("rpe" IS NULL OR "rpe" BETWEEN 1 AND 10)
);
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_has_value_check"
  CHECK (num_nonnulls("actual_reps", "actual_distance_meters", "actual_duration_seconds") >= 1);

-- discomfort_reports
ALTER TABLE "discomfort_reports" ADD CONSTRAINT "discomfort_reports_note_length_check"
  CHECK ("note" IS NULL OR char_length("note") <= 500);
ALTER TABLE "discomfort_reports" ADD CONSTRAINT "discomfort_reports_position_check"
  CHECK (("block_index" IS NULL) = ("exercise_index" IS NULL) AND ("block_index" IS NULL OR ("block_index" >= 0 AND "exercise_index" >= 0)));

-- Comenzar: solo con una asignación vigente de una sesión no cancelada.
CREATE OR REPLACE FUNCTION public.check_session_log_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.scheduled_sessions s ON s.id = a.session_id
    WHERE a.id = new.assignment_id AND a.status = 'asignada' AND s.status = 'programada'
  ) THEN
    RAISE EXCEPTION 'Solo se comienzan sesiones programadas y asignadas al atleta'
      USING ERRCODE = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER session_logs_check_start
  BEFORE INSERT ON "session_logs"
  FOR EACH ROW EXECUTE FUNCTION public.check_session_log_start();

-- Series: solo mientras la ejecución está en curso y en una posición que
-- exista en el snapshot congelado (bloque, ejercicio y número de serie).
CREATE OR REPLACE FUNCTION public.check_set_log_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  log_status public.session_log_status;
  snap jsonb;
  planned_sets int;
BEGIN
  SELECT l.status, s.snapshot INTO log_status, snap
  FROM public.session_logs l
  JOIN public.assignments a ON a.id = l.assignment_id
  JOIN public.scheduled_sessions s ON s.id = a.session_id
  WHERE l.id = new.session_log_id;

  IF log_status IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'Las series solo se registran mientras la sesión está en curso'
      USING ERRCODE = '23514';
  END IF;

  planned_sets := (snap -> 'blocks' -> new.block_index -> 'exercises' -> new.exercise_index ->> 'sets')::int;
  IF planned_sets IS NULL OR new.set_number > planned_sets THEN
    RAISE EXCEPTION 'La serie no existe en la sesión programada'
      USING ERRCODE = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER set_logs_check_position
  BEFORE INSERT OR UPDATE ON "set_logs"
  FOR EACH ROW EXECUTE FUNCTION public.check_set_log_position();

-- Historial: no se retira de la sesión a un atleta que ya la comenzó.
CREATE OR REPLACE FUNCTION public.check_assignment_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF old.status = 'asignada' AND new.status = 'retirada'
     AND EXISTS (SELECT 1 FROM public.session_logs WHERE assignment_id = old.id) THEN
    RAISE EXCEPTION 'No se puede quitar a un atleta que ya comenzó la sesión'
      USING ERRCODE = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER assignments_check_withdrawal
  BEFORE UPDATE ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_withdrawal();

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "session_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "set_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discomfort_reports" ENABLE ROW LEVEL SECURITY;
