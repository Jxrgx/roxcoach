-- CreateTable
CREATE TABLE "assignment_overrides" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "block_index" INTEGER NOT NULL,
    "exercise_index" INTEGER NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "override_sets" INTEGER,
    "override_reps" INTEGER,
    "override_distance_meters" INTEGER,
    "override_duration_seconds" INTEGER,
    "override_load_kg" DOUBLE PRECISION,
    "remove_load" BOOLEAN NOT NULL DEFAULT false,
    "override_rest_seconds" INTEGER,
    "note" TEXT,
    "replacement_exercise_id" UUID,
    "replacement_name" TEXT,
    "replacement_category" "exercise_category",
    "replacement_equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_overrides_replacement_exercise_id_idx" ON "assignment_overrides"("replacement_exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_overrides_assignment_id_block_index_exercise_ind_key" ON "assignment_overrides"("assignment_id", "block_index", "exercise_index");

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_replacement_exercise_id_fkey" FOREIGN KEY ("replacement_exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "coach_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "coach_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Reglas en la base de datos (SQL manual)
-- ============================================================================

-- Rangos (los mismos que block_exercises) y combinaciones válidas.
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_ranges_check" CHECK (
  "block_index" >= 0 AND "exercise_index" >= 0 AND
  ("override_sets" IS NULL OR "override_sets" BETWEEN 1 AND 50) AND
  ("override_reps" IS NULL OR "override_reps" BETWEEN 1 AND 1000) AND
  ("override_distance_meters" IS NULL OR "override_distance_meters" BETWEEN 1 AND 100000) AND
  ("override_duration_seconds" IS NULL OR "override_duration_seconds" BETWEEN 1 AND 36000) AND
  ("override_load_kg" IS NULL OR ("override_load_kg" > 0 AND "override_load_kg" <= 500)) AND
  ("override_rest_seconds" IS NULL OR "override_rest_seconds" BETWEEN 0 AND 3600) AND
  ("note" IS NULL OR char_length("note") <= 140) AND
  ("replacement_name" IS NULL OR char_length("replacement_name") BETWEEN 1 AND 80)
);
-- Como máximo un objetivo (el del mismo tipo que el plan original; lo revisa el trigger).
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_target_check"
  CHECK (num_nonnulls("override_reps", "override_distance_meters", "override_duration_seconds") <= 1);
-- "Sin carga" y una carga nueva son excluyentes.
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_load_check"
  CHECK (NOT ("remove_load" AND "override_load_kg" IS NOT NULL));
-- Sustitución completa: nombre y categoría congelados juntos; un id siempre trae su copia.
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_replacement_check" CHECK (
  ("replacement_name" IS NULL) = ("replacement_category" IS NULL) AND
  ("replacement_exercise_id" IS NULL OR "replacement_name" IS NOT NULL)
);
-- Nunca una fila vacía (restaurar = borrar la fila).
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_not_empty_check" CHECK (
  "skipped" OR "remove_load" OR "replacement_name" IS NOT NULL OR "note" IS NOT NULL OR
  num_nonnulls("override_sets", "override_reps", "override_distance_meters", "override_duration_seconds", "override_load_kg", "override_rest_seconds") > 0
);

-- Integridad: solo se personaliza una asignación vigente de una sesión
-- programada que el atleta AÚN NO comenzó; la posición existe en el snapshot;
-- el objetivo es del mismo tipo que el plan original; el reemplazo es del
-- sistema o del mismo coach y no está archivado.
CREATE OR REPLACE FUNCTION public.check_assignment_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_row public.assignment_overrides;
  a_status public.assignment_status;
  s_status public.scheduled_session_status;
  s_coach uuid;
  snap jsonb;
  item jsonb;
  started boolean;
  repl_coach uuid;
  repl_archived timestamptz;
BEGIN
  -- Las acciones referenciales (SET NULL de un ejercicio o coach borrado) solo
  -- limpian referencias: se permiten siempre para no bloquear borrados de cuentas.
  IF tg_op = 'UPDATE' AND
     (to_jsonb(new) - ARRAY['replacement_exercise_id', 'created_by', 'updated_by', 'updated_at']) =
     (to_jsonb(old) - ARRAY['replacement_exercise_id', 'created_by', 'updated_by', 'updated_at']) THEN
    RETURN new;
  END IF;

  IF tg_op = 'DELETE' THEN
    target_row := old;
  ELSE
    target_row := new;
  END IF;

  SELECT a.status, s.status, s.coach_id, s.snapshot, EXISTS (SELECT 1 FROM public.session_logs l WHERE l.assignment_id = a.id)
    INTO a_status, s_status, s_coach, snap, started
  FROM public.assignments a
  JOIN public.scheduled_sessions s ON s.id = a.session_id
  WHERE a.id = target_row.assignment_id;

  IF NOT FOUND THEN
    -- Borrado en cascada (la asignación o la sesión ya no existen): se permite.
    IF tg_op = 'DELETE' THEN
      RETURN old;
    END IF;
    RAISE EXCEPTION 'La asignación no existe' USING ERRCODE = '23503';
  END IF;

  IF a_status <> 'asignada' OR s_status <> 'programada' THEN
    RAISE EXCEPTION 'Solo se personalizan asignaciones vigentes de sesiones programadas' USING ERRCODE = '23514';
  END IF;
  IF started THEN
    RAISE EXCEPTION 'El atleta ya comenzó la sesión: la personalización está bloqueada' USING ERRCODE = '23514';
  END IF;
  IF tg_op = 'DELETE' THEN
    RETURN old;
  END IF;

  item := snap -> 'blocks' -> new.block_index -> 'exercises' -> new.exercise_index;
  IF item IS NULL OR jsonb_typeof(item) <> 'object' THEN
    RAISE EXCEPTION 'El ejercicio no existe en la sesión programada' USING ERRCODE = '23514';
  END IF;
  IF (new.override_reps IS NOT NULL AND item ->> 'targetType' <> 'reps') OR
     (new.override_distance_meters IS NOT NULL AND item ->> 'targetType' <> 'distance') OR
     (new.override_duration_seconds IS NOT NULL AND item ->> 'targetType' <> 'time') THEN
    RAISE EXCEPTION 'El objetivo debe ser del mismo tipo que el plan original' USING ERRCODE = '23514';
  END IF;

  IF new.replacement_exercise_id IS NOT NULL AND
     (tg_op = 'INSERT' OR new.replacement_exercise_id IS DISTINCT FROM old.replacement_exercise_id) THEN
    SELECT e.coach_id, e.archived_at INTO repl_coach, repl_archived FROM public.exercises e WHERE e.id = new.replacement_exercise_id;
    IF NOT FOUND OR (repl_coach IS NOT NULL AND repl_coach <> s_coach) OR repl_archived IS NOT NULL THEN
      RAISE EXCEPTION 'El ejercicio de reemplazo no está disponible para este coach' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER assignment_overrides_check
  BEFORE INSERT OR UPDATE OR DELETE ON "assignment_overrides"
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_override();

-- Ejecución: las series se validan contra el plan PERSONALIZADO de la
-- asignación (series ajustadas; un ejercicio omitido no acepta series).
-- Reemplaza la función de la fase 7 sin editar su migración.
CREATE OR REPLACE FUNCTION public.check_set_log_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  log_status public.session_log_status;
  snap jsonb;
  a_id uuid;
  planned_sets int;
  o_skipped boolean;
  o_sets int;
BEGIN
  SELECT l.status, s.snapshot, a.id INTO log_status, snap, a_id
  FROM public.session_logs l
  JOIN public.assignments a ON a.id = l.assignment_id
  JOIN public.scheduled_sessions s ON s.id = a.session_id
  WHERE l.id = new.session_log_id;

  IF log_status IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'Las series solo se registran mientras la sesión está en curso'
      USING ERRCODE = '23514';
  END IF;

  planned_sets := (snap -> 'blocks' -> new.block_index -> 'exercises' -> new.exercise_index ->> 'sets')::int;
  SELECT o.skipped, o.override_sets INTO o_skipped, o_sets
  FROM public.assignment_overrides o
  WHERE o.assignment_id = a_id AND o.block_index = new.block_index AND o.exercise_index = new.exercise_index;

  IF o_skipped THEN
    RAISE EXCEPTION 'El ejercicio fue omitido para este atleta' USING ERRCODE = '23514';
  END IF;
  planned_sets := COALESCE(o_sets, planned_sets);
  IF planned_sets IS NULL OR new.set_number > planned_sets THEN
    RAISE EXCEPTION 'La serie no existe en la sesión programada'
      USING ERRCODE = '23514';
  END IF;
  RETURN new;
END;
$$;

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "assignment_overrides" ENABLE ROW LEVEL SECURITY;
