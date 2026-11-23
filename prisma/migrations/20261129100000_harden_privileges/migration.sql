-- Fase 13: endurecimiento de privilegios (mínimo privilegio). No borra datos,
-- no cambia tablas, columnas ni RLS. La app accede con el rol propietario vía
-- Prisma, así que no depende de ninguno de estos privilegios.
--
-- 1. anon y authenticated (roles de la API pública de Supabase) tenían
--    TRUNCATE, REFERENCES y TRIGGER en todas las tablas de `public` por los
--    privilegios por defecto. TRUNCATE ignora RLS: se revoca todo eso.
-- 2. Los privilegios por defecto dejaban de nuevo esos permisos en tablas futuras.
-- 3. Las funciones de `public` (todas son funciones de trigger) tenían EXECUTE
--    para PUBLIC/anon/authenticated. Un trigger no necesita EXECUTE del rol que
--    dispara la escritura, así que revocarlo no cambia su funcionamiento.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- MAINTAIN existe desde PostgreSQL 17.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
