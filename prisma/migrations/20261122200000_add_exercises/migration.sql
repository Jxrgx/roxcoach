-- CreateEnum
CREATE TYPE "exercise_category" AS ENUM ('carrera', 'estaciones', 'fuerza', 'movilidad');

-- CreateEnum
CREATE TYPE "exercise_difficulty" AS ENUM ('principiante', 'intermedio', 'avanzado');

-- CreateEnum
CREATE TYPE "exercise_media_type" AS ENUM ('video', 'imagen');

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "coach_id" UUID,
    "source_id" UUID,
    "name" TEXT NOT NULL,
    "category" "exercise_category" NOT NULL,
    "difficulty" "exercise_difficulty" NOT NULL,
    "instructions" TEXT NOT NULL,
    "cue" TEXT,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_type" "exercise_media_type",
    "media_url" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_substitutions" (
    "exercise_id" UUID NOT NULL,
    "substitute_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exercise_substitutions_pkey" PRIMARY KEY ("exercise_id","substitute_id")
);

-- CreateIndex
CREATE INDEX "exercises_coach_id_archived_at_idx" ON "exercises"("coach_id", "archived_at");

-- CreateIndex
CREATE INDEX "exercises_category_idx" ON "exercises"("category");

-- CreateIndex
CREATE INDEX "exercise_substitutions_substitute_id_idx" ON "exercise_substitutions"("substitute_id");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("profile_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_substitutions" ADD CONSTRAINT "exercise_substitutions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_substitutions" ADD CONSTRAINT "exercise_substitutions_substitute_id_fkey" FOREIGN KEY ("substitute_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas que Prisma no expresa (SQL manual)
-- ============================================================================

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 2 AND 80);
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_instructions_length_check"
  CHECK (char_length(btrim("instructions")) BETWEEN 10 AND 2000);
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_cue_length_check"
  CHECK ("cue" IS NULL OR char_length("cue") <= 140);
-- El medio visual va completo (tipo + URL) o no va; solo https.
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_media_check" CHECK (
  ("media_type" IS NULL AND "media_url" IS NULL) OR
  ("media_type" IS NOT NULL AND "media_url" ~ '^https://[^[:space:]]+$' AND char_length("media_url") <= 500)
);
-- Un ejercicio no se sustituye por sí mismo.
ALTER TABLE "exercise_substitutions" ADD CONSTRAINT "exercise_substitutions_not_self_check"
  CHECK ("exercise_id" <> "substitute_id");

-- Integridad de propiedad: una sustitución solo apunta a ejercicios del sistema
-- o del MISMO coach; los ejercicios del sistema solo se sustituyen entre sí.
-- Defensa en profundidad: aunque la app fallara, no se mezclan bibliotecas.
CREATE OR REPLACE FUNCTION public.check_exercise_substitution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  owner_coach uuid;
  substitute_coach uuid;
BEGIN
  SELECT coach_id INTO owner_coach FROM public.exercises WHERE id = new.exercise_id;
  SELECT coach_id INTO substitute_coach FROM public.exercises WHERE id = new.substitute_id;
  IF substitute_coach IS NOT NULL AND substitute_coach IS DISTINCT FROM owner_coach THEN
    RAISE EXCEPTION 'La sustitución debe ser un ejercicio del sistema o del mismo coach' USING errcode = '23514';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER exercise_substitutions_ownership
  BEFORE INSERT OR UPDATE ON "exercise_substitutions"
  FOR EACH ROW EXECUTE FUNCTION public.check_exercise_substitution();

-- RLS sin políticas: solo el servidor (Prisma, rol propietario) accede.
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercise_substitutions" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Ejercicios del sistema (coach_id NULL). Ids fijos para que sean iguales en
-- todos los entornos. Equipo según el catálogo EQUIPMENT_OPTIONS de la app.
-- ============================================================================

INSERT INTO "exercises" ("id", "coach_id", "name", "category", "difficulty", "instructions", "cue", "equipment") VALUES
('00000000-0000-4000-8000-000000000001', NULL, 'Carrera 1 km', 'carrera', 'principiante',
 'Corre 1 km a ritmo constante. Mantén el torso erguido, la zancada corta y una cadencia alta. Respira de forma rítmica y controla el ritmo desde el primer metro para no pagar al final.',
 'Ritmo constante, zancada corta.', ARRAY['Pista']),
('00000000-0000-4000-8000-000000000002', NULL, 'Intervalos 400 m', 'carrera', 'intermedio',
 'Corre 400 m a ritmo rápido y recupera trotando 200 m. Repite según la prescripción. Busca que todas las repeticiones salgan al mismo ritmo.',
 'Recupera trotando 200 m.', ARRAY['Pista']),
('00000000-0000-4000-8000-000000000003', NULL, 'SkiErg', 'estaciones', 'principiante',
 'De pie frente al SkiErg, toma las manijas por encima de la cabeza. Lleva la cadera atrás y jala con todo el torso y los brazos hasta los muslos. Regresa extendiendo el cuerpo de forma controlada.',
 'Cadera atrás, jala con todo el torso.', ARRAY['SkiErg']),
('00000000-0000-4000-8000-000000000004', NULL, 'Sled Push', 'estaciones', 'intermedio',
 'Toma los postes del trineo con los brazos extendidos y el cuerpo inclinado hacia adelante. Empuja con pasos cortos y rápidos, manteniendo la espalda neutra y la mirada al frente.',
 'Brazos extendidos, pasos cortos y rápidos.', ARRAY['Trineo']),
('00000000-0000-4000-8000-000000000005', NULL, 'Sled Pull', 'estaciones', 'intermedio',
 'Desde detrás de la línea, jala la cuerda mano sobre mano hasta acercar el trineo. Mantén las piernas firmes y la espalda neutra; acomoda la cuerda para no tropezar.',
 'Mano sobre mano, piernas firmes.', ARRAY['Trineo']),
('00000000-0000-4000-8000-000000000006', NULL, 'Burpee Broad Jump', 'estaciones', 'intermedio',
 'Haz un burpee con el pecho al suelo y, al levantarte, salta hacia adelante con ambos pies. Aterriza suave, con las rodillas flexionadas, y encadena la siguiente repetición.',
 'Aterriza suave y encadena.', ARRAY[]::text[]),
('00000000-0000-4000-8000-000000000007', NULL, 'Remo', 'estaciones', 'principiante',
 'Sentado en el remo, empuja primero con las piernas, después abre la cadera y al final jala con los brazos. Regresa en orden inverso: brazos, cadera, piernas.',
 'Piernas, cadera, brazos.', ARRAY['Remo']),
('00000000-0000-4000-8000-000000000008', NULL, 'Farmers Carry', 'estaciones', 'principiante',
 'Toma una kettlebell en cada mano y camina con pasos cortos. Mantén los hombros abajo, el abdomen activo y el torso erguido sin balancear las cargas.',
 'Hombros abajo, abdomen activo.', ARRAY['Kettlebells']),
('00000000-0000-4000-8000-000000000009', NULL, 'Sandbag Lunges', 'estaciones', 'intermedio',
 'Coloca el sandbag sobre los hombros y da zancadas alternas. La rodilla trasera toca suave el suelo y el torso se mantiene erguido en cada paso.',
 'Rodilla trasera toca suave.', ARRAY['Sandbag']),
('00000000-0000-4000-8000-000000000010', NULL, 'Wall Balls', 'estaciones', 'intermedio',
 'Con el balón al pecho, baja a sentadilla completa y, al subir, lanza el balón a la diana usando el impulso de la cadera. Recíbelo y encadena con la siguiente sentadilla.',
 'Sentadilla completa, lanza con cadera.', ARRAY['Balón medicinal']),
('00000000-0000-4000-8000-000000000011', NULL, 'Peso muerto rumano', 'fuerza', 'intermedio',
 'De pie con la barra frente a los muslos, lleva la cadera atrás manteniendo la espalda neutra y las rodillas ligeramente flexionadas. Baja hasta sentir tensión en isquiotibiales y regresa apretando glúteos.',
 'Espalda neutra, bisagra de cadera.', ARRAY['Barra y discos']),
('00000000-0000-4000-8000-000000000012', NULL, 'Sentadilla búlgara', 'fuerza', 'intermedio',
 'Con el pie trasero apoyado en una superficie elevada y una carga en cada mano, baja hasta que la rodilla trasera casi toque el suelo. Sube empujando con el pie delantero, con el torso alto.',
 'Torso alto, rodilla estable.', ARRAY['Kettlebells']),
('00000000-0000-4000-8000-000000000013', NULL, 'Movilidad de cadera 90/90', 'movilidad', 'principiante',
 'Siéntate con ambas piernas flexionadas a 90°, una al frente y otra al lado. Gira el torso hacia la pierna delantera y mantén la posición respirando profundo. Cambia de lado.',
 'Respira profundo en cada lado.', ARRAY[]::text[]),
('00000000-0000-4000-8000-000000000014', NULL, 'Rotación torácica', 'movilidad', 'principiante',
 'En cuadrupedia, coloca una mano detrás de la cabeza y gira el torso abriendo el codo hacia el techo. Regresa de forma controlada y repite del otro lado.',
 'Sigue la mano con la mirada.', ARRAY[]::text[]);

-- Sustituciones base del sistema (alternativas habituales cuando falta equipo).
INSERT INTO "exercise_substitutions" ("exercise_id", "substitute_id", "position") VALUES
('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000007', 0), -- SkiErg → Remo
('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000003', 0), -- Remo → SkiErg
('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000012', 0), -- Sandbag Lunges → Sentadilla búlgara
('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 0); -- Carrera 1 km → Intervalos 400 m
