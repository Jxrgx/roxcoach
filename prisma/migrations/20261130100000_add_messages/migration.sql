-- Fase 16: mensajes uno a uno atleta–coach. Solo agrega un tipo y una tabla;
-- no modifica ni borra datos existentes.

-- CreateEnum
CREATE TYPE "message_sender" AS ENUM ('coach', 'athlete');

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "sender" "message_sender" NOT NULL,
    "body" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_client_id_key" ON "messages"("client_id");

-- CreateIndex
CREATE INDEX "messages_coach_id_athlete_id_created_at_idx" ON "messages"("coach_id", "athlete_id", "created_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ============================================================================
-- Reglas en la base de datos (SQL manual)
-- ============================================================================

-- Texto: 1 a 2000 caracteres y no solo espacios.
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_check"
  CHECK (char_length(btrim("body")) >= 1 AND char_length("body") <= 2000);
-- Sin CHECK read_at >= created_at: read_at lo fija el servidor de la app y
-- created_at la BD (mismo motivo que 20261126101000_drop_alert_read_check).

-- No leídos por destinatario (contadores del encabezado y de la lista).
CREATE INDEX "messages_unread_by_coach_idx" ON "messages"("coach_id", "athlete_id")
  WHERE "read_at" IS NULL AND "sender" = 'athlete';
CREATE INDEX "messages_unread_by_athlete_idx" ON "messages"("athlete_id", "coach_id")
  WHERE "read_at" IS NULL AND "sender" = 'coach';

-- Escribir exige relación ACTIVA entre el par (la app también lo valida).
-- Después de creado, solo cambia read_at, una vez (de NULL a una fecha).
CREATE OR REPLACE FUNCTION public.check_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."read_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Un mensaje nuevo no puede estar leído' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = NEW."coach_id" AND ca.athlete_id = NEW."athlete_id" AND ca.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Solo se envían mensajes con una relación activa' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."coach_id" IS DISTINCT FROM OLD."coach_id"
     OR NEW."athlete_id" IS DISTINCT FROM OLD."athlete_id"
     OR NEW."sender" IS DISTINCT FROM OLD."sender"
     OR NEW."body" IS DISTINCT FROM OLD."body"
     OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Un mensaje enviado no se modifica' USING ERRCODE = '23514';
  END IF;
  IF OLD."read_at" IS NOT NULL AND NEW."read_at" IS DISTINCT FROM OLD."read_at" THEN
    RAISE EXCEPTION 'Un mensaje leído no vuelve a cambiar' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_check
  BEFORE INSERT OR UPDATE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION public.check_message();

-- Mínimo privilegio (fase 13): la función de trigger no es ejecutable por la API pública.
REVOKE EXECUTE ON FUNCTION public.check_message() FROM PUBLIC, anon, authenticated;

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
