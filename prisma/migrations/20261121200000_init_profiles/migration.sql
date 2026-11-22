-- CreateEnum
CREATE TYPE "role" AS ENUM ('coach', 'athlete');

-- CreateEnum
CREATE TYPE "weight_unit" AS ENUM ('kg', 'lb');

-- CreateEnum
CREATE TYPE "distance_unit" AS ENUM ('km', 'mi');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "profile_id" UUID NOT NULL,
    "gym_name" TEXT,
    "weight_unit" "weight_unit" NOT NULL DEFAULT 'kg',
    "distance_unit" "distance_unit" NOT NULL DEFAULT 'km',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "athlete_profiles" (
    "profile_id" UUID NOT NULL,
    "division" TEXT,
    "race_date" DATE,
    "available_days" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weight_unit" "weight_unit" NOT NULL DEFAULT 'kg',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Supabase Auth: integración con perfiles (SQL manual; Prisma no lo expresa).
-- Esta migración usa el esquema `auth` de Supabase: aplícala con
-- `prisma migrate deploy` (no con `migrate dev`, cuyo shadow DB no tiene `auth`).
-- ============================================================================

-- profiles.id es el mismo id del usuario de Supabase Auth.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;

-- 1) Antes de crear el usuario: fija el rol en app_metadata.
--    app_metadata solo lo escribe el servidor; el usuario no puede cambiarlo.
--    Sin rol en el registro → "athlete" (mínimo privilegio). Rol inválido → error.
CREATE OR REPLACE FUNCTION public.set_role_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested text := coalesce(new.raw_user_meta_data ->> 'role', 'athlete');
BEGIN
  IF requested NOT IN ('coach', 'athlete') THEN
    RAISE EXCEPTION 'Rol inválido: %', requested USING errcode = '22023';
  END IF;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', requested);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_set_role
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.set_role_claim();

-- 2) Después de crear el usuario: crea su perfil y el perfil de su rol.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role public.role := (new.raw_app_meta_data ->> 'role')::public.role;
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    user_role
  );

  IF user_role = 'coach' THEN
    INSERT INTO public.coach_profiles (profile_id) VALUES (new.id);
  ELSE
    INSERT INTO public.athlete_profiles (profile_id) VALUES (new.id);
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Row Level Security.
--    La app escribe y lee desde el servidor con Prisma (rol propietario).
--    Por la API pública (publishable key) cada usuario solo puede LEER lo suyo;
--    no hay políticas de escritura, así nadie puede cambiar su rol vía API.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "athlete_profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leer perfil propio" ON "profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);

CREATE POLICY "Leer perfil de coach propio" ON "coach_profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);

CREATE POLICY "Leer perfil de atleta propio" ON "athlete_profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);
