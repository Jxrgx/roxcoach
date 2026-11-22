# Flujo de desarrollo

## Antes de implementar

Sigue el flujo obligatorio de [CLAUDE.md](../CLAUDE.md):

1. Inspecciona la estructura y la documentación.
2. Identifica el módulo, los roles, las pantallas, las acciones, los estados y las reglas de negocio.
3. Define los criterios de aceptación y los archivos afectados.
4. Si el cambio afecta arquitectura, datos, navegación o alcance, **espera confirmación**.

## Convenciones de nombres

| Elemento | Convención | Ejemplo |
| --- | --- | --- |
| Rutas (URL) | Español, minúsculas | `/coach/entrenamientos`, `/atleta/agenda` |
| Archivos de componentes | `kebab-case.tsx` | `workout-card.tsx` |
| Componentes | `PascalCase` | `WorkoutCard` |
| Funciones y hooks | `camelCase`; los hooks con prefijo `use` | `formatDuration`, `useToday` |
| Tipos | `PascalCase` | `ScheduledSession` |
| Código (identificadores) | Inglés | `athleteIds`, `dayOffset` |
| Textos de interfaz | Español mexicano, claro y directo | "Comenzar entrenamiento" |

## Dónde va cada cosa

- **¿Es genérico y sin dominio?** Va en `components/ui/`. Revisa antes si ya existe.
- **¿Es de entrenamiento (sesiones, ejercicios, estados)?** Va en `components/workouts/`.
- **¿Es exclusivo del coach o del atleta?** Va en `components/coach/` o `components/athlete/`.
- **¿Es una regla o un cálculo?** Va como función pura en `lib/utils/` o `lib/validations/`, con prueba.
- **¿Son datos?** Hoy van en `lib/mock/` y, en el futuro, en `lib/db/`. Nunca dentro de un componente visual.

No dupliques estilos con variaciones pequeñas: agrega una variante al componente existente y documenta la razón.

## Validación técnica

```bash
npm run lint         # ESLint
npm run typecheck    # tipos de rutas + tsc
npm test             # Vitest
npm run build        # build de producción
npm run test:e2e     # Playwright: rutas × 5 anchos, estados y diálogos
```

O todo lo anterior, menos e2e: `npm run validate`.

`npm run test:e2e` compila con `ROXCOACH_CATALOG=1` y levanta `next start` en el puerto 3100. Por cada ruta y ancho (320, 360, 390, 768 y 1280 px) verifica:

- que no haya scroll horizontal;
- que no haya errores de consola;
- que haya un `h1` visible;
- que las etiquetas de navegación no se corten;
- que las áreas táctiles midan al menos 44 px.

Además prueba los cinco estados de vista previa en cada pantalla con datos, y los diálogos en mobile. Las capturas se guardan en `test-results/screens/<ancho>/`.

> **Windows.** `npm test` usa `scripts/run-vitest.mjs`, que normaliza la letra de unidad (`c:` → `C:`). Sin esto, Vitest carga dos instancias de su runner cuando la terminal abre el proyecto en minúscula y falla con "failed to find the current suite".

## Validación visual

Después de cada pantalla, revísala en 360, 390, tablet y desktop. Confirma que la acción principal sea evidente, que los textos no se corten, que los modales y bottom sheets se puedan usar, y que los estados de carga, vacío y error existan. **No declares terminada una pantalla solo porque compila.**

## Catálogo del sistema visual

`/componentes` muestra todos los componentes base con sus variantes, incluidos Timer y SetLogger, y enlaces a cada estado de cada pantalla. Está disponible en `npm run dev`; en producción devuelve 404, salvo que se defina `ROXCOACH_CATALOG=1`.

## Base de datos y autenticación

- **Variables:** viven en `.env.local` (plantilla en `.env.example`). Nunca versiones secretos.
- **Cambio de esquema:**
  1. Edita `prisma/schema.prisma`.
  2. Crea la carpeta de migración y genera su SQL comparando con el esquema del último commit. Este método no necesita base sombra:
     `git show HEAD:prisma/schema.prisma > /tmp/schema.before.prisma`, luego
     `npx prisma migrate diff --from-schema /tmp/schema.before.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/<fecha>_<nombre>/migration.sql`.
  3. Agrega el SQL manual que necesites (RLS, triggers).
  4. Aplica con `npm run db:migrate` y regenera el cliente con `npm run db:generate`.
  5. **Nunca edites una migración ya aplicada.** Corrige con una migración nueva (ejemplo: `fix_invitation_accepted_check`).
- **No uses `prisma migrate dev`:** las migraciones usan el esquema `auth` de Supabase, que su base sombra no tiene.
- **Datos en páginas:** se obtienen en el servidor mediante `lib/auth/session.ts` (`requireCoach` / `requireAthlete`) y `lib/db/*`. Nunca importes `lib/db` en componentes cliente, salvo para tipos.
- **Server Actions:** toda Server Action que escriba datos debe llamar primero a `requireCoach()` o `requireAthlete()` y repetir la validación de `lib/validations`.

## Pruebas E2E con autenticación

- **Proyecto:** las e2e usan el proyecto de Supabase **de desarrollo**.
- **Setup** (`tests/e2e/auth.setup.ts`):
  - Crea o actualiza `E2E_COACH_EMAIL` y `E2E_ATHLETE_EMAIL` con `SUPABASE_SECRET_KEY`, con el correo ya confirmado. Las contraseñas son `E2E_COACH_PASSWORD` y `E2E_ATHLETE_PASSWORD` (o `E2E_PASSWORD` compartida).
  - Inicia sesión por la interfaz y guarda las cookies en `tests/e2e/.auth/` (ignorado por Git).
- **Registro y confirmación** (`security.spec.ts`): usan `admin.generateLink`, que crea el usuario sin confirmar y devuelve el token **sin enviar correo**. Prueban trigger, rol, enlace válido, enlace ya usado y enlace inválido, y borran el usuario al terminar.
- **Por qué no se envía el formulario de registro en las e2e:**
  - El SMTP integrado de Supabase permite muy pocos correos por hora y solo a miembros de la organización.
  - Supabase rechaza dominios como `example.com` (`email_address_invalid`).
  - El envío real se verifica a mano.
- **Seguridad** (`security.spec.ts`): redirecciones abiertas en el login, y RLS por la API pública (sin lectura de perfiles ni escalada de rol).
- **Cerrar sesión:** usa `scope: "local"` para no invalidar las sesiones compartidas por otras pruebas.
- **Datos de prueba de la fase 3:**
  - El setup vincula al coach y al atleta compartidos (relación activa, idempotente) y guarda sus ids en `tests/e2e/.auth/ids.json`. Así la ruta dinámica `/coach/atletas/[id]` entra en la revisión responsive.
  - `athletes.spec.ts` crea sus propios atletas, un segundo coach e invitaciones con correos únicos, y los borra o cancela al terminar.
  - `deleteUser` falla si no puede borrar, para detectar restricciones que bloqueen eliminar cuentas.
- **Windows / Git Bash:** al filtrar pruebas por ruta (`-g "/coach/atletas"`), usa `MSYS_NO_PATHCONV=1`. Si no, Git Bash convierte la ruta en una ruta de Windows.
