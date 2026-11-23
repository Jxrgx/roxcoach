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
- **Datos de prueba de la fase 4:** `exercises.spec.ts` crea ejercicios con nombres que empiezan con `E2E ` y los borra al terminar. La app nunca borra ejercicios (solo archiva); las pruebas sí, para no dejar residuos. Los 14 ejercicios del sistema tienen ids fijos (`00000000-0000-4000-8000-0000000000NN`).
- **Pantalla anterior oculta (Cache Components):** al navegar con un enlace, Next mantiene la pantalla anterior oculta dentro de `<Activity>`, y sus elementos siguen en el DOM.
  - `getByLabel` y `getByText` también los encuentran. Usa `getByRole`, que ignora lo oculto, o `.filter({ visible: true })`.
  - Ver `field()` en `exercises.spec.ts`.
- **Datos de prueba de la fase 5:** `templates.spec.ts` crea plantillas `E2E …` (por UI o insertadas en la BD) y las borra al terminar. La prueba de permisos crea un segundo coach, cambia su unidad a lb, verifica el trigger de propiedad y borra la cuenta, como regresión de la FK diferida.
- **Copia oculta de `ScreenStates`:** su `<Suspense>` usa el contenido como fallback, y puede quedar una copia oculta en el DOM.
  - En pruebas, usa `getByRole`.
  - En componentes con estado local dentro de `ScreenStates`, no dependas de ese estado para mostrar resultados importantes: usa el toast global o datos del servidor (ver `TemplateActions`).
- **Datos de prueba de la fase 6** (`scheduling.spec.ts`):
  - Inserta plantillas publicadas `E2E …` en la BD, programa por la interfaz y registra lo creado con `track()` y `createUser()`.
  - La limpieza va en `test.afterEach`, que también corre si la prueba agota el tiempo; un `finally` no corre en ese caso y deja residuos. Borra sesiones y plantillas por su prefijo único y los usuarios creados por id.
  - `actionTimeout` de 15 s y `expect` configurado a 15 s: con workers en paralelo el servidor tarda más en responder.
- **`browser.newContext()` hereda el `storageState` del `test.use()`:** para iniciar sesión con otro usuario dentro de un describe con sesión, pasa `storageState: { cookies: [], origins: [] }`. Si no, `/login` redirige al área del usuario heredado.
- **Hidratación y formularios:** escribir en un campo controlado antes de que React hidrate se pierde, y el estado inicial (por ejemplo, fecha = hoy) lo reemplaza. Entra a los formularios con `waitUntil: "networkidle"` y confirma los valores con `toHaveValue` antes de enviar. Por la misma razón, los `<details>` se abren con reintento (ver `openBlock`).
- **Datos de prueba de la fase 7** (`execution.spec.ts`):
  - Cada prueba crea su **propio atleta** vinculado al coach compartido. Así no deja sesiones "en curso" en el atleta compartido, cuyo Inicio y Agenda revisan otras pruebas en paralelo (Inicio prioriza una sesión en curso).
  - Las sesiones se insertan en la BD con un snapshot fijo; borrar la sesión en `afterEach` elimina en cascada asignaciones, registros, series y molestias, y después se borra el usuario.
  - Además de la UI, prueban los triggers directamente con SQL (comenzar una cancelada, serie fuera del snapshot, serie tras finalizar, retirar a quien comenzó).
- **Datos de prueba de la fase 8** (`progress.spec.ts`):
  - Cada prueba crea sus propios atletas y les inserta historial real: sesiones, `session_logs` (se insertan en curso, se agregan series y molestias y después se completan, porque los triggers solo aceptan series mientras está en curso) y una sesión completada que luego se cancela para comprobar que no cuenta.
  - Las aserciones del coach se acotan con `?atleta=<id>`: otras pruebas en paralelo agregan atletas al coach compartido.
  - `<table className="sr-only">` no respeta el ancho de 1 px: envuelve la tabla en un bloque `sr-only` para evitar scroll horizontal.
- **Datos de prueba de la fase 9** (`alerts.spec.ts`):
  - Cada prueba crea su **propio coach** y atletas, así el número de avisos es exacto. Borrar al coach elimina en cascada sesiones, registros y avisos.
  - Las specs que usan el coach compartido (`scheduling`, `execution`, `progress` y `athletes`, este último solo borra los avisos del atleta para no alterar su prueba de borrado de cuentas) limpian sus avisos: primero borran la relación del atleta de prueba (deja de ser activo y la sincronización ya no genera avisos), luego `coach_alerts` por atleta y por sesión, y al final el usuario. Si no, quedarían avisos huérfanos (con `SET NULL`) como historial.
- **Relaciones que llegan como null:** Prisma resuelve `include` con consultas separadas; con pruebas en paralelo que borran usuarios, una relación "obligatoria" puede llegar como null. Los mapeos del DAL descartan esas filas en lugar de romper la página (`lib/db/athletes.ts`, `sessions.ts`, `progress.ts`, `alerts.ts`).
- **Datos de prueba de la fase 10** (`overrides.spec.ts`):
  - Cada prueba crea su **propio coach** y dos atletas activos; la sesión se inserta con un snapshot fijo. Borrar al coach elimina en cascada sesiones, asignaciones, ajustes y registros (el trigger de ajustes permite los borrados en cascada).
  - En el editor, cada acordeón se ubica por su `summary` (el contenido incluye los nombres de otros ejercicios en el selector de reemplazo) y su título cambia al sustituir el ejercicio.
  - Además de la UI, prueban los triggers con SQL: ajustes bloqueados tras comenzar o en sesión cancelada y series rechazadas en un ejercicio omitido.
- **Datos de prueba de la fase 11** (`offline.spec.ts`):
  - Cada prueba crea su **propio coach** y atleta; sin red con `context.setOffline(true)`. Para simular un servidor caído con el navegador "en línea", se abortan solo los POST (Server Actions) de esa sesión con `context.route` y una bandera.
  - El estado de envío se localiza dentro de `main` (el shell tiene su propio aviso "Sin conexión") y "Guardado" se compara exacto (también existe "Guardado localmente").
  - El temporizador tras suspender se prueba con `page.clock.install()` + `clock.fastForward()` (pasa el tiempo sin ticks).
  - Para revisar la cola local en una prueba: `indexedDB.open("roxcoach-ejecucion")`, almacén `ops`.
