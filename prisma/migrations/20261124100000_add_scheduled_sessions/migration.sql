-- CreateEnum
CREATE TYPE "scheduled_session_status" AS ENUM ('programada', 'cancelada');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('asignada', 'retirada');

-- CreateTable
CREATE TABLE "scheduled_sessions" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "template_id" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduled_date" DATE NOT NULL,
    "start_time" TEXT,
    "status" "scheduled_session_status" NOT NULL DEFAULT 'programada',
    "cancelled_at" TIMESTAMPTZ(6),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "assignment_status" NOT NULL DEFAULT 'asignada',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_sessions_coach_id_scheduled_date_idx" ON "scheduled_sessions"("coach_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "assignments_athlete_id_status_idx" ON "assignments"("athlete_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_session_id_athlete_id_key" ON "assignments"("session_id", "athlete_id");

-- AddForeignKey
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workout_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "scheduled_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas que Prisma no expresa (SQL manual)
-- ============================================================================

ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_title_length_check"
  CHECK (char_length(btrim("title")) BETWEEN 2 AND 80);
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_notes_length_check"
  CHECK ("notes" IS NULL OR char_length("notes") <= 500);
-- Hora opcional en formato 24 h "HH:MM".
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_start_time_check"
  CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
-- Cancelada ⇔ tiene fecha de cancelación.
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_cancelled_check"
  CHECK (("status" = 'cancelada') = ("cancelled_at" IS NOT NULL));
-- El snapshot es un objeto JSON versionado con bloques.
ALTER TABLE "scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_snapshot_check" CHECK (
  jsonb_typeof("snapshot") = 'object' AND
  "snapshot" ? 'version' AND
  jsonb_typeof("snapshot" -> 'blocks') = 'array'
);

-- Al asignar (o reasignar) a un atleta, debe tener una relación ACTIVA con el
-- coach de la sesión. Defensa en profundidad: atletas en pausa, retirados o de
-- otro coach no pueden recibir sesiones aunque la app fallara.
CREATE OR REPLACE FUNCTION public.check_assignment_relation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  session_coach uuid;
BEGIN
  IF new.status <> 'asignada' OR (tg_op = 'UPDATE' AND old.status = 'asignada') THEN
    RETURN new;
  END IF;
  SELECT coach_id INTO session_coach FROM public.scheduled_sessions WHERE id = new.session_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_athletes
     WHERE coach_id = session_coach AND athlete_id = new.athlete_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Solo se asignan sesiones a atletas activos del coach' USING errcode = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER assignments_active_relation
  BEFORE INSERT OR UPDATE ON "assignments"
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_relation();

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "scheduled_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;
