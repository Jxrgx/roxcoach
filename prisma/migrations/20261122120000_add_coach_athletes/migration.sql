-- CreateEnum
CREATE TYPE "relation_status" AS ENUM ('active', 'paused', 'removed');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'cancelled');

-- CreateTable
CREATE TABLE "coach_athletes" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "relation_status" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_athletes_athlete_id_idx" ON "coach_athletes"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_athletes_coach_id_athlete_id_key" ON "coach_athletes"("coach_id", "athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_coach_id_status_idx" ON "invitations"("coach_id", "status");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- AddForeignKey
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "athlete_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Reglas que Prisma no expresa (SQL manual)
-- ============================================================================

-- Un atleta tiene como máximo UN coach activo o en pausa (MVP sin multi-gimnasio).
-- Garantizado en la base de datos para evitar condiciones de carrera.
CREATE UNIQUE INDEX "coach_athletes_one_current_coach_per_athlete"
  ON "coach_athletes" ("athlete_id")
  WHERE "status" IN ('active', 'paused');

-- Fechas coherentes con el estado.
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_status_dates_check" CHECK (
  ("status" <> 'paused' OR "paused_at" IS NOT NULL) AND
  ("status" <> 'removed' OR "removed_at" IS NOT NULL)
);

-- Una sola invitación pendiente por coach y correo.
CREATE UNIQUE INDEX "invitations_one_pending_per_coach_email"
  ON "invitations" ("coach_id", "email")
  WHERE "status" = 'pending';

-- El correo se guarda normalizado (la app ya lo hace; la BD lo garantiza).
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase_check" CHECK ("email" = lower("email"));

-- Una invitación aceptada registra quién y cuándo.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_check" CHECK (
  "status" <> 'accepted' OR ("accepted_at" IS NOT NULL AND "accepted_by_id" IS NOT NULL)
);

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
-- La API pública (publishable key) no puede leer ni escribir estas tablas.
ALTER TABLE "coach_athletes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
