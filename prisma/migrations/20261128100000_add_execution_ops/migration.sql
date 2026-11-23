-- CreateEnum
CREATE TYPE "execution_op_kind" AS ENUM ('log_set', 'pause', 'resume', 'finish');

-- AlterTable
ALTER TABLE "set_logs" ADD COLUMN     "client_op_id" UUID,
ADD COLUMN     "recorded_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "execution_ops" (
    "op_id" UUID NOT NULL,
    "session_log_id" UUID NOT NULL,
    "kind" "execution_op_kind" NOT NULL,
    "client_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_ops_pkey" PRIMARY KEY ("op_id")
);

-- CreateIndex
CREATE INDEX "execution_ops_session_log_id_idx" ON "execution_ops"("session_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "set_logs_client_op_id_key" ON "set_logs"("client_op_id");

-- AddForeignKey
ALTER TABLE "execution_ops" ADD CONSTRAINT "execution_ops_session_log_id_fkey" FOREIGN KEY ("session_log_id") REFERENCES "session_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas en la base de datos (SQL manual)
-- ============================================================================

-- La hora local de una serie no puede estar muy en el futuro respecto a su
-- sincronización (margen de 5 min por relojes desfasados; el servidor ya la acota).
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_recorded_at_check"
  CHECK ("recorded_at" IS NULL OR "recorded_at" <= "created_at" + interval '5 minutes');

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "execution_ops" ENABLE ROW LEVEL SECURITY;
