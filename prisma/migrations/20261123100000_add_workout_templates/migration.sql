-- CreateEnum
CREATE TYPE "workout_intensity" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('borrador', 'publicada', 'archivada');

-- CreateEnum
CREATE TYPE "target_type" AS ENUM ('reps', 'distance', 'time');

-- CreateTable
CREATE TABLE "workout_templates" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "focus" TEXT,
    "intensity" "workout_intensity" NOT NULL DEFAULT 'media',
    "estimated_minutes" INTEGER,
    "status" "template_status" NOT NULL DEFAULT 'borrador',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_blocks" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "workout_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_exercises" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "target_type" "target_type" NOT NULL,
    "reps" INTEGER,
    "distance_meters" INTEGER,
    "duration_seconds" INTEGER,
    "load_kg" DOUBLE PRECISION,
    "rest_seconds" INTEGER,
    "notes" TEXT,

    CONSTRAINT "block_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_templates_coach_id_status_idx" ON "workout_templates"("coach_id", "status");

-- CreateIndex
CREATE INDEX "workout_blocks_template_id_position_idx" ON "workout_blocks"("template_id", "position");

-- CreateIndex
CREATE INDEX "block_exercises_block_id_position_idx" ON "block_exercises"("block_id", "position");

-- CreateIndex
CREATE INDEX "block_exercises_exercise_id_idx" ON "block_exercises"("exercise_id");

-- AddForeignKey
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workout_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_exercises" ADD CONSTRAINT "block_exercises_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "workout_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_exercises" ADD CONSTRAINT "block_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ============================================================================
-- Reglas que Prisma no expresa (SQL manual)
-- ============================================================================

ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 2 AND 80);
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_focus_length_check"
  CHECK ("focus" IS NULL OR char_length("focus") <= 140);
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_minutes_check"
  CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" BETWEEN 5 AND 300);
-- Una plantilla publicada siempre tiene duración (el resto de la completitud
-- —bloques con ejercicios— la valida la app en la misma transacción).
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_published_minutes_check"
  CHECK ("status" <> 'publicada' OR "estimated_minutes" IS NOT NULL);

ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 60);
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_notes_length_check"
  CHECK ("notes" IS NULL OR char_length("notes") <= 280);
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_position_check" CHECK ("position" >= 0);

-- Prescripción: rangos razonables y EXACTAMENTE un objetivo según target_type.
ALTER TABLE "block_exercises" ADD CONSTRAINT "block_exercises_ranges_check" CHECK (
  "position" >= 0 AND
  "sets" BETWEEN 1 AND 50 AND
  ("reps" IS NULL OR "reps" BETWEEN 1 AND 1000) AND
  ("distance_meters" IS NULL OR "distance_meters" BETWEEN 1 AND 100000) AND
  ("duration_seconds" IS NULL OR "duration_seconds" BETWEEN 1 AND 36000) AND
  ("load_kg" IS NULL OR ("load_kg" > 0 AND "load_kg" <= 500)) AND
  ("rest_seconds" IS NULL OR "rest_seconds" BETWEEN 0 AND 3600) AND
  ("notes" IS NULL OR char_length("notes") <= 140)
);
ALTER TABLE "block_exercises" ADD CONSTRAINT "block_exercises_target_check" CHECK (
  ("target_type" = 'reps'     AND "reps" IS NOT NULL AND "distance_meters" IS NULL AND "duration_seconds" IS NULL) OR
  ("target_type" = 'distance' AND "distance_meters" IS NOT NULL AND "reps" IS NULL AND "duration_seconds" IS NULL) OR
  ("target_type" = 'time'     AND "duration_seconds" IS NOT NULL AND "reps" IS NULL AND "distance_meters" IS NULL)
);

-- Integridad de propiedad: una plantilla solo usa ejercicios del sistema o del
-- MISMO coach. Defensa en profundidad: aunque la app fallara, no se mezclan
-- bibliotecas entre coaches.
CREATE OR REPLACE FUNCTION public.check_block_exercise_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  template_coach uuid;
  exercise_coach uuid;
BEGIN
  SELECT t.coach_id INTO template_coach
    FROM public.workout_blocks b JOIN public.workout_templates t ON t.id = b.template_id
   WHERE b.id = new.block_id;
  SELECT coach_id INTO exercise_coach FROM public.exercises WHERE id = new.exercise_id;
  IF exercise_coach IS NOT NULL AND exercise_coach IS DISTINCT FROM template_coach THEN
    RAISE EXCEPTION 'La plantilla solo puede usar ejercicios del sistema o del mismo coach' USING errcode = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER block_exercises_owner
  BEFORE INSERT OR UPDATE ON "block_exercises"
  FOR EACH ROW EXECUTE FUNCTION public.check_block_exercise_owner();

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "workout_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "block_exercises" ENABLE ROW LEVEL SECURITY;
