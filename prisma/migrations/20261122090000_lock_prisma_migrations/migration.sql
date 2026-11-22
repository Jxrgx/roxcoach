-- Defensa en profundidad: `_prisma_migrations` vive en `public`, esquema que
-- Supabase expone por su API. Hoy anon/authenticated no tienen SELECT sobre ella,
-- pero sin RLS el asesor de seguridad de Supabase la marca como error y
-- cualquier GRANT futuro la expondría. Sin políticas = sin acceso por la API.
-- Prisma no se ve afectado: se conecta como propietario de la tabla.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
