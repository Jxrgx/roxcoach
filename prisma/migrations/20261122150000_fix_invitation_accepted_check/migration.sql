-- Corrige invitations_accepted_check (migración add_coach_athletes).
-- Al eliminar la cuenta de un atleta, accepted_by_id pasa a NULL por
-- ON DELETE SET NULL; la restricción anterior exigía accepted_by_id en las
-- invitaciones aceptadas y bloqueaba el borrado del usuario.
-- Se conserva el historial: una invitación aceptada sigue exigiendo accepted_at.
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_accepted_check";
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_check" CHECK (
  "status" <> 'accepted' OR "accepted_at" IS NOT NULL
);
