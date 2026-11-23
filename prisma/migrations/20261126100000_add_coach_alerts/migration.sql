-- CreateEnum
CREATE TYPE "alert_kind" AS ENUM ('molestia', 'sesion_incompleta', 'rpe_alto', 'en_curso_prolongada', 'no_iniciada', 'relacion_aceptada');

-- CreateTable
CREATE TABLE "coach_alerts" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID,
    "session_id" UUID,
    "kind" "alert_kind" NOT NULL,
    "source_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "athlete_name" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_alerts_coach_id_read_at_idx" ON "coach_alerts"("coach_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "coach_alerts_coach_id_kind_source_id_key" ON "coach_alerts"("coach_id", "kind", "source_id");

-- AddForeignKey
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "scheduled_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Reglas en la base de datos (SQL manual)
-- ============================================================================

-- Prioridad: 1 prioritaria · 2 revisar · 3 seguimiento · 4 información.
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_priority_check"
  CHECK ("priority" BETWEEN 1 AND 4);
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_text_check" CHECK (
  char_length(btrim("title")) BETWEEN 1 AND 120 AND
  char_length("description") <= 300 AND
  char_length("athlete_name") BETWEEN 1 AND 120
);
-- Leído nunca antes de existir.
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_read_check"
  CHECK ("read_at" IS NULL OR "read_at" >= "created_at");

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "coach_alerts" ENABLE ROW LEVEL SECURITY;
