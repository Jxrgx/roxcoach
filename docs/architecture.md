# Arquitectura

## Principios

1. **Separación de capas.** Cada capa vive en su propia carpeta:
   - Lo visual: `components/ui`.
   - El dominio: `components/workouts`, `components/coach`, `components/athlete`.
   - La lógica pura: `lib/utils`, `lib/validations`.
   - Los permisos: `lib/permissions`.
   - La sesión: `lib/auth`.
   - El acceso a datos: `lib/db` (Prisma) y `lib/mock` (módulos aún no implementados).
2. **Ningún componente visual consulta datos.** Las páginas (`app/**/page.tsx`) obtienen los datos de `lib/auth` / `lib/db` (o de `lib/mock`) y los pasan por props como objetos planos (DTO). Los componentes cliente solo importan *tipos* de `lib/db`; `server-only` impide importar código de servidor en el navegador.
3. **Lo planeado nunca se sobrescribe con lo realizado.**

```text
Ejercicio → Plantilla → Sesión programada → Asignación al atleta → Registro realizado
Exercise    WorkoutTemplate  ScheduledSession   Assignment            SessionLog / SetLog
```

En los tipos (`lib/types/domain.ts`), `PlannedSet` contiene los objetivos y `SetLog` los resultados reales (`actual*`). El `SetLogger` muestra lo planeado en solo lectura y captura lo realizado por separado.

## Renderizado

- **Next.js 16 con `cacheComponents` y `partialPrefetching`.**
  - Las rutas públicas se prerenderizan como estáticas.
  - `/coach/*` y `/atleta/*` son **prerender parcial**: la navegación es el shell estático, y lo que depende de la sesión (perfil y contenido) llega por streaming detrás de `<Suspense>`.
- **Rutas visitadas conservadas.** Las rutas visitadas se mantienen montadas dentro de `<Activity>`. Por eso los diálogos se cierran en el cleanup de su efecto (`components/ui/dialog-base.tsx`).
- **Fechas del dispositivo.** "Hoy" depende del dispositivo, así que se resuelve en el cliente con `useToday()` (`useSyncExternalStore`, `null` en servidor). Los datos ficticios usan `dayOffset` (días desde hoy) para verse siempre actuales.
- **Estado de conexión.** `useOnline()` alimenta el `OfflineBanner`.

## Autenticación y roles

Supabase Auth con correo y contraseña. La sesión vive en **cookies**, nunca en localStorage, y la administra `@supabase/ssr`.

| Pieza | Responsabilidad |
| --- | --- |
| `proxy.ts` → `lib/supabase/update-session.ts` | En cada petición: valida y refresca el JWT (`getClaims`) y aplica `resolveRouteAccess` (redirección rápida por rol) |
| `lib/permissions` | Funciones puras: `resolveRouteAccess`, `safeNextPath` (evita redirecciones abiertas), `ROLE_HOME` |
| `lib/auth/session.ts` (DAL) | Verificación **definitiva** en servidor: `requireCoach()` / `requireAthlete()` leen el rol de `profiles` |
| `components/shared/area-gate.tsx` | Los layouts de cada área ejecutan el DAL antes de mostrar contenido |
| `lib/auth/actions.ts` | Server Actions `signIn`, `signUp` y `signOut` (cierre local), con validación de servidor |
| `app/auth/confirm` | Confirma el correo (`?code=` PKCE o `?token_hash=`). El enlace PKCE de la plantilla por defecto solo inicia sesión en el navegador donde se hizo el registro; en otro, la cuenta queda confirmada y el usuario entra desde /login. Para que funcione entre dispositivos, cambia la plantilla "Confirm signup" a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| `app/auth/salir` | Cierra sesiones inválidas, por ejemplo sin perfil, y evita bucles de redirección |

**Origen del rol.** El usuario elige *coach* o *atleta* al registrarse (`user_metadata.role`). Dos triggers en `auth.users` (migración `init_profiles`) se encargan del resto:

1. **`set_role_claim`** (antes de insertar): copia el rol a `app_metadata.role`. Solo el servidor puede escribir ahí; si falta el rol asigna `athlete` y rechaza valores inválidos.
2. **`handle_new_user`** (después de insertar): crea `profiles` y `coach_profiles` o `athlete_profiles`.

El proxy usa `app_metadata.role` del JWT para redirigir sin consultar la BD. La autorización final siempre la decide el DAL contra `profiles`.

**Errores de autenticación.**
- Los mensajes están en español (`lib/auth/errors.ts`) y nunca revelan si un correo ya tiene cuenta.
- El registro con confirmación obligatoria muestra "Revisa tu correo".

## Datos

- **Esquema activo** (`prisma/schema.prisma`): perfiles (`profiles`, `coach_profiles`, `athlete_profiles`), relación coach–atleta e invitaciones, ejercicios, plantillas `scheduled_sessions` y `assignments` (fase 6) y los registros realizados `session_logs`, `set_logs` y `discomfort_reports` (fase 7). `profiles.id` es el mismo id de `auth.users` (FK con cascada).
- **Modelo completo previsto:** está en `docs/data-model-draft.prisma` y se incorporará módulo por módulo.
- **Conexiones:** Prisma 7 usa el driver adapter `@prisma/adapter-pg`. La app se conecta por el pooler (`DATABASE_URL`) y las migraciones por la conexión directa (`DIRECT_URL`, en `prisma.config.ts`).
- **Migraciones:**
  - Incluyen SQL del esquema `auth` de Supabase, así que se aplican con `prisma migrate deploy`. `migrate dev` no sirve: su base sombra no tiene `auth`.
  - Para crear una nueva, genera el DDL con `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` y agrega el SQL manual que haga falta.
- **RLS:** activado en las tres tablas de perfiles y en `_prisma_migrations` (migración `lock_prisma_migrations`).
  - En `roxcoach-dev`, los roles `anon` y `authenticated` **no tienen** SELECT, INSERT, UPDATE ni DELETE sobre `public` (configuración por defecto actual de Supabase). Hoy nada es accesible por la API pública; verificado en `tests/e2e/security.spec.ts`.
  - Las políticas de "leer lo propio" ya existen. Si un módulo futuro necesita leer desde el navegador, bastará con conceder `SELECT` a `authenticated` en una migración; no hay políticas de escritura, así nadie puede cambiar su rol.
  - La app escribe desde el servidor con Prisma, como rol propietario, siempre a través del DAL con el id del usuario autenticado.
- **Acceso a perfiles:** `lib/db/profiles.ts` devuelve DTO. Las Server Actions `app/coach/configuracion/actions.ts` y `app/atleta/perfil/actions.ts` validan otra vez en servidor antes de guardar.

## Atletas e invitaciones (fase 3)

**Modelo:**
- **`coach_athletes`** (`CoachAthlete`): relación coach–atleta con estado `active`, `paused` o `removed`, y fechas `joined_at`, `paused_at` y `removed_at`.
  - Sus FK apuntan a `coach_profiles` y `athlete_profiles`, así la base de datos garantiza los roles.
  - **Regla "un coach a la vez":** un índice único parcial impide más de una relación activa o en pausa por atleta.
- **`invitations`** (`Invitation`): ligadas a un correo en minúsculas.
  - Estado `pending`, `accepted` o `cancelled`. "Expirada" se calcula con `expires_at` (7 días), sin tareas programadas.
  - Una sola invitación pendiente por coach y correo (índice único parcial).
  - Si el atleta elimina su cuenta, la invitación aceptada conserva su historial con `accepted_by_id = NULL`.
- **RLS:** activo y sin políticas en ambas tablas; solo el servidor accede.

**Token del enlace:**
- 32 bytes aleatorios en base64url. En la base de datos solo se guarda su **SHA-256**.
- El enlace se muestra una sola vez. "Regenerar" emite uno nuevo e invalida el anterior.
- La página `/invitacion/[token]` usa `noindex` y `referrer: no-referrer`.

**Reglas** (`lib/invitations/rules.ts`, funciones puras con pruebas): `decideAcceptance` determina qué ve quien abre el enlace:

| Situación | Resultado |
| --- | --- |
| Sin sesión | Crear cuenta de atleta / Ya tengo cuenta (con `next` de vuelta a la invitación) |
| Atleta del correo invitado | Botón "Unirme al equipo" → `/atleta/perfil?bienvenida=1` para completar su información |
| Otro correo, cuenta de coach o atleta con otro coach | Bloqueado, con mensaje y salida clara |
| Vencida, cancelada o ya usada | Bloqueado; si quien la aceptó la reabre, ve "Ya formas parte del equipo" |

**Aceptación:** ocurre en una transacción que vuelve a evaluar las reglas con datos frescos. La invitación se marca como aceptada solo si sigue pendiente, y el índice parcial resuelve las condiciones de carrera.

**Aislamiento:**
- Todas las funciones de `lib/db/athletes.ts` y `lib/db/invitations.ts` reciben el `coachId` de la sesión y filtran por él.
- Un atleta ajeno o un id inválido en `/coach/atletas/[id]` muestra el mismo "no está en tu equipo" que uno inexistente.

**Quién edita la información deportiva:**
- El atleta, desde su perfil.
- Su coach, desde el detalle del atleta, solo con la relación **activa**. En pausa, el detalle es de solo lectura.
- Ambos usan `validateSportsInfo` y el componente `SportsInfoFields`.

**Navegación con rutas dinámicas:** `usePathname` suspende en rutas con parámetros desconocidos (Cache Components). Por eso la navegación del coach que resalta la sección activa va detrás de `<Suspense>`, con un fallback idéntico sin resaltar.

## Biblioteca de ejercicios (fase 4)

**Modelo** (migración `add_exercises`):
- **`exercises`:**
  - Datos: nombre, categoría, dificultad, instrucciones, indicación clave, equipo y medio por URL (`media_type` + `media_url`).
  - `archived_at` para archivar sin borrar; `source_id` guarda de qué ejercicio del sistema se duplicó una copia.
  - `coach_id NULL` = ejercicio del sistema; con valor = personalizado de ese coach (FK a `coach_profiles`, en cascada).
- **`exercise_substitutions`:** "A se puede sustituir por B", ordenada por `position`.
- **Restricciones en la BD:**
  - URL solo `https` (≤ 500 caracteres) y medio completo o ninguno.
  - Longitudes de nombre, instrucciones e indicación clave.
  - Nada de auto-sustituciones.
  - El trigger `check_exercise_substitution` exige que una sustitución apunte a un ejercicio del sistema o del **mismo** coach. Los del sistema solo se sustituyen entre sí, así nunca se mezclan bibliotecas.
- **RLS:** activo y sin políticas.
- **Ejercicios del sistema:** 14, con ids fijos, más 4 sustituciones base, cargados en la propia migración. El equipo usa el catálogo `EQUIPMENT_OPTIONS`, el mismo del perfil del atleta.

**Permisos** (`lib/exercises/rules.ts`, aplicados además en cada consulta de `lib/db/exercises.ts`):

| Quién | Ve | Edita, archiva o restaura | Duplica |
| --- | --- | --- | --- |
| Coach | Sistema + los suyos (incluidos sus archivados) | Solo los suyos | Solo los del sistema |
| Atleta | Sistema + los de su coach actual, no archivados (solo lectura) | — | — |

Un ejercicio ajeno, inexistente o un id inválido muestra el mismo "no está en tu biblioteca".

**Reglas:**
- **Archivar** pide confirmación. El ejercicio sale de la lista y de los candidatos a sustitución, pero se conserva y puede restaurarse.
- **Editar** solo aplica a ejercicios propios activos. Al editar, las sustituciones que apuntan a ejercicios archivados se descartan.
- **Duplicar como propio** copia un ejercicio del sistema con sus sustituciones y abre la copia para editarla; el original no cambia.
- **Sustituciones:** máximo 5, únicas, distintas del propio ejercicio y disponibles (`checkSubstitutions`), validadas en la misma transacción que guarda el ejercicio.

**Medios:**
- Las imágenes se muestran con `next/image` en modo `unoptimized` (el dominio es libre) y `referrerPolicy="no-referrer"`.
- Los videos nunca se incrustan: "Ver video" abre en otra pestaña con `rel="noopener noreferrer"`.
- No hay subida de archivos ni Storage.

**Rutas:**
- **Coach:** `/coach/biblioteca` (lista), `/coach/biblioteca/nuevo`, `/coach/biblioteca/[id]` y `/coach/biblioteca/[id]/editar`.
- **Atleta:** `/atleta/ejercicios/[id]`, sin entrada en la navegación. Se enlazará desde las sesiones.
- **Shells:** el del atleta también resalta la sección activa detrás de `<Suspense>`, como el del coach, porque tiene rutas dinámicas.

## Constructor de plantillas (fase 5)

**Modelo** (migraciones `add_workout_templates` y `defer_block_exercise_fk`):
- **`workout_templates`:** nombre, enfoque, intensidad, duración estimada en minutos (la define el coach) y estado (`borrador`, `publicada` o `archivada`). Pertenece a un coach (FK a `coach_profiles`, en cascada).
- **`workout_blocks`:** posición, nombre y notas.
- **`block_exercises`:** la **prescripción planeada**; nunca guarda resultados reales.
  - Datos: ejercicio, posición, series, `target_type` (`reps`, `distance` o `time`) con **exactamente un** objetivo, carga en **kg**, descanso en segundos y nota.
  - FK al ejercicio **`NO ACTION DEFERRABLE INITIALLY DEFERRED`**: un ejercicio usado no puede borrarse, pero borrar la cuenta de un coach (que elimina en cascada sus ejercicios y plantillas) sí funciona, porque la revisión ocurre al confirmar.
- **Restricciones en la BD:**
  - rangos de series, objetivos, carga (> 0 y ≤ 500 kg) y descanso (≤ 1 h);
  - longitudes de texto;
  - una publicada siempre tiene duración.
- **Trigger** `check_block_exercise_owner`: una plantilla solo usa ejercicios del sistema o del **mismo** coach.
- **RLS:** activo y sin políticas en las 3 tablas.

**Reglas** (`lib/workouts/rules.ts`, `lib/workouts/convert.ts` y `validateTemplate`):
- **Borrador:** solo exige un nombre válido; lo que sí se capturó debe ser correcto.
- **Publicar:** exige duración, al menos un bloque y ejercicios en todos los bloques (`publishProblems`). Una plantilla publicada debe seguir completa al guardarse.
- **Transiciones:** borrador ↔ publicada y cualquiera → archivada. Restaurar devuelve a borrador. Las archivadas no se editan.
- **Unidades:**
  - La carga se captura y muestra en la unidad del coach (kg o lb) y se guarda en kg (`loadToKg` y `loadForDisplay`, sin deriva visible).
  - La distancia, siempre en metros.
  - El tiempo y el descanso aceptan segundos o `mm:ss`.
- **Guardar:** reemplaza la plantilla completa (bloques y ejercicios) en una transacción.
  - Ejercicios permitidos: del sistema o del coach, no archivados.
  - Uno archivado se conserva solo si la plantilla ya lo usaba; el detalle y el constructor muestran un aviso.
- **Duplicar:** crea un borrador "(copia)" y la original no cambia.

**Interfaz:**
- **Constructor** (`/coach/entrenamientos/nueva` y `[id]/editar`):
  - Datos de la plantilla, después los bloques y dentro de cada bloque sus ejercicios.
  - Selector de ejercicios en panel inferior; reordenar con botones subir y bajar (accesibles, sin arrastrar).
  - Errores por ruta de campo, aviso al salir con cambios sin guardar, y vista previa en un modal antes de guardar.
- **Detalle** (`[id]`): la vista previa como la verá el atleta (`TemplatePreview`) y acciones según el estado, con una sola principal.
- **Lista:** buscador y filtro por estado.

## Programación y asignación (fase 6)

Sigue la cadena del dominio: **plantilla → sesión programada → asignación al atleta** (el registro realizado se describe en la fase 7).

**Modelo** (migraciones `add_scheduled_sessions` y `fix_snapshot_check`):
- **`scheduled_sessions`:** coach (cascada), plantilla de origen (opcional, `SET NULL` si se borra), título, notas, `scheduled_date` (`DATE`), `start_time` opcional (`"HH:MM"`), estado (`programada` o `cancelada`, con `cancelled_at`) y `snapshot` (JSON).
- **`assignments`:** sesión (cascada) y atleta (cascada), estado `asignada` o `retirada`, única por `(session_id, athlete_id)`. Quitar a un atleta lo marca `retirada` (no se borra); volver a agregarlo lo reactiva.
- **Restricciones en la BD:** título 2–80, notas ≤ 500, formato de hora, `cancelada` ⇔ `cancelled_at` no nulo, y el snapshot debe ser un objeto con `version` numérica y `blocks` arreglo (`coalesce` para que una clave ausente no pase el CHECK).
- **Trigger** `check_assignment_relation`: una asignación `asignada` exige una relación **activa** coach–atleta (los atletas en pausa no se asignan).
- **RLS:** activo y sin políticas en ambas tablas.

**Snapshot** (`lib/scheduling/snapshot.ts`):
- Al programar se copia la plantilla publicada (nombre, enfoque, intensidad, duración, bloques y ejercicios con nombre, categoría, equipo y prescripción) con `version: 1`.
- Editar, archivar o borrar la plantilla después **no** cambia la sesión. Editar la sesión solo cambia fecha, hora, título y notas.
- Lo que viene de la BD se valida en tiempo de ejecución (`parseSnapshot`); si no es válido se muestra vacío en vez de romper la página.

**Fechas** (`lib/scheduling/dates.ts`): las fechas viajan como claves `YYYY-MM-DD` y "hoy" se calcula en `APP_TIME_ZONE` (`America/Mexico_City`), así una sesión no cambia de día por la zona del servidor. Se programa de hoy a un año. El calendario y la agenda reciben `?semana=` y lo ajustan al lunes (`resolveWeekParam`).

**Permisos y reglas** (`lib/db/sessions.ts`, `app/coach/sesiones/actions.ts`, `validateSchedule` y `validateSessionDetails`):
- El coach solo programa sus plantillas publicadas para sus atletas activos (1–50, sin repetidos); se revisa en la transacción y en el trigger.
- Solo una sesión `programada` se edita, se cancela o cambia de atletas. Cancelar pide confirmación y conserva la sesión y sus asignaciones.
- El atleta solo ve sesiones con una asignación `asignada` para él; las canceladas aparecen en su agenda marcadas como tales, no en "próximas". Una sesión ajena responde 404.

**Interfaz:**
- **Coach:** `/coach/sesiones/nueva` (plantilla, fecha y hora, título y notas, atletas; acción fija "Programar sesión"), `/coach/sesiones/[id]` (vista previa del snapshot, Editar detalles, Cancelar, atletas asignados), Calendario semanal y sesiones de hoy en Inicio. "Programar" es la acción principal del detalle de una plantilla publicada.
- **Atleta:** sesión de hoy y próximas en Inicio, Agenda semanal (tira de 7 días + lista; una semana vacía muestra un solo estado vacío), Entrenamiento (la de hoy o la siguiente) y `/atleta/sesiones/[id]` con bloques en acordeón (nivel 3) y "Comenzar" como acción principal (ver fase 7).

## Ejecución del entrenamiento (fase 7)

Completa la cadena del dominio: **asignación → registro realizado**. Lo planeado (snapshot) y lo realizado viven en tablas distintas; la ejecución **nunca escribe** en `scheduled_sessions`.

**Modelo** (migración `add_session_execution`):
- **`session_logs`:** uno por asignación (`assignment_id` único). Estado `en_curso` o `completada`, `started_at`, `finished_at`, pausa (`paused_at` de la pausa abierta y `paused_seconds` de las cerradas), RPE general (1–10) y comentario (≤ 1000). Sin registro = "sin iniciar".
- **`set_logs`:** resultado real de una serie, ubicado por su posición en el snapshot (`block_index`, `exercise_index`, `set_number`; único por registro). Reps, distancia (m), tiempo (s), carga (kg) y RPE opcional; al menos un valor.
- **`discomfort_reports`:** zona (enum de 11), intensidad (`leve`, `moderada`, `fuerte`), nota (≤ 500) y, si se reportó durante un ejercicio, su posición.
- **Restricciones:** `completada` ⇔ `finished_at`; una completada no queda en pausa; rangos de valores reales.
- **Triggers:**
  - `check_session_log_start`: solo se comienza con una asignación `asignada` de una sesión `programada`.
  - `check_set_log_position`: las series solo se registran mientras la ejecución está `en_curso` y en una posición que exista en el snapshot.
  - `check_assignment_withdrawal`: no se retira de la sesión a un atleta que ya la comenzó (se conserva el historial).
- **Cascadas:** borrar la sesión o la cuenta elimina asignaciones y registros. Cancelar una sesión no borra nada; quien ya la había comenzado puede terminarla.
- **RLS:** activo y sin políticas en las 3 tablas.

**Reglas** (`lib/execution/progress.ts`, `lib/db/execution.ts`, `app/atleta/sesiones/actions.ts`, `validateSetLog`, `validateSessionFeedback` y `validateDiscomfort`):
- **Comenzar:** sesiones de hoy o de días anteriores (en `APP_TIME_ZONE`); no futuras ni canceladas. Es idempotente.
- **Registrar:** el objetivo planeado se lee del snapshot en el servidor (no del cliente); el resultado mide lo mismo que el plan (reps, distancia o tiempo), la carga es obligatoria si el plan la tiene y se captura en la unidad del atleta (se guarda en kg). Volver a registrar una serie la corrige (upsert). En pausa no se registra.
- **Pausa:** se guarda en el servidor; el tiempo activo = (fin, inicio de la pausa abierta o ahora) − inicio − pausas cerradas (`activeSeconds`).
- **Finalizar:** permitido con series pendientes (confirmación), que quedan como "No realizada". Cierra la pausa abierta.
- **Después de finalizar:** las series quedan de solo lectura (trigger); solo se editan RPE general y comentario. Las molestias se pueden reportar durante la sesión o desde el resumen.

**Interfaz:**
- **Atleta:**
  - Detalle: "Comenzar" (o "Continuar entrenamiento" / "Ver resumen"); una futura muestra cuándo podrá comenzarla.
  - `/atleta/sesiones/[id]/ejecutar`: nivel 1 cambia según el momento (registrar la serie con "Completar serie" fijo sobre la navegación, descanso con "Siguiente serie", pausa con "Reanudar sesión" o "Finalizar entrenamiento" al terminar). Nivel 2: bloque, progreso, tiempo activo, Pausar y Finalizar. Nivel 3 (panel inferior): ver ejercicio, indicaciones del bloque y reportar molestia. Las series del ejercicio actual permiten volver a una y corregirla.
  - `/atleta/sesiones/[id]/resumen`: tiempo activo, series, RPE general y comentario, molestias y planeado vs. realizado.
  - Inicio, Entrenamiento y Agenda muestran el estado (en curso o completada) y priorizan una sesión que quedó en curso.
- **Coach:**
  - `/coach/sesiones/[id]`: estado por atleta, "N de M completaron", alerta de molestias y "Resultados" (quien ya comenzó no se puede quitar).
  - `/coach/sesiones/[id]/atletas/[athleteId]`: tiempo activo, series, RPE, molestias primero, comentario y planeado vs. realizado (solo lectura, en la unidad del coach).
- **Componentes:** `SetLogger` (objetivo por tipo, unidad del atleta, corrección y botón fijo), `Timer` (`autoStart`, `showControls`, `onComplete`), `RpePicker`, `DiscomfortDialog`, `ExecutionStatusBadge` y `ExecutionResults`.

## Progreso y métricas (fase 8)

**Sin cambios de base de datos.** Las métricas se calculan al pedir la pantalla a partir de las tablas existentes; no se guardan métricas derivadas.

**Datos** (`lib/db/progress.ts`, solo lectura): una consulta por pantalla trae las asignaciones con su sesión (fecha, estado, snapshot), registro, series y molestias. La BD ya filtra asignaciones `retirada` y sesiones `cancelada`; las funciones puras las vuelven a excluir. Filas cuya sesión se borró a mitad de la consulta se descartan.

**Cálculo** (`lib/progress/metrics.ts`, puras y probadas):
- **Estados:** asignada (vigente y no cancelada) → pendiente (sin comenzar, hoy o futura), en curso (comenzada, hoy o futura), abandonada (comenzada y su día ya pasó), completada, no realizada (sin comenzar y su día ya pasó).
- **Adherencia** = completadas ÷ (completadas + no realizadas + abandonadas). Hoy sin hacer no penaliza. Con menos de 3 sesiones vencidas se marca "datos insuficientes"; baja adherencia = < 70 % con datos suficientes.
- **Periodos:** 7/30/90 días terminan hoy (inclusive) en `America/Mexico_City`. Adherencia, tiempo y RPE usan la fecha programada; "completadas en 7/30/90 días" usa el día real de fin en la zona de la app; las molestias, su día de registro.
- **Tiempo entrenado:** suma del tiempo activo de las completadas; duraciones ≤ 0 o > 5 h se descartan y se informa cuántas.
- **RPE promedio:** completadas con RPE (se indica cuántas).
- **Evolución y marcas:** solo completadas. Se agrupa por `exerciseId` + tipo de objetivo (nunca se mezclan ejercicios ni objetivos). Valor por sesión = mejor serie: carga si alguna serie la registró; si no, reps, distancia o tiempo. Marcas: mayor carga, mayor distancia, más repeticiones y mayor tiempo sostenido (series de tiempo). Una tendencia necesita ≥ 2 sesiones. Estaciones HYROX por los ids fijos de los ejercicios del sistema; los propios del coach, por categoría.
- **No se muestran** ritmo ni mejor tiempo en distancia: las series de distancia guardan metros, no tiempo.
- **Unidades:** se calcula en kg, m y s; se muestra en la unidad del usuario.

**Permisos:**
- Atleta: solo su progreso (id de la sesión del usuario; la ruta no recibe ids).
- Coach: atletas con relación `active` o `paused` y solo sesiones que él programó. El `?atleta=` y el `[athleteId]` se validan contra esa lista (uno ajeno se ignora o responde 404 sin revelar si existe).

**Interfaz:** orden "¿estoy cumpliendo? → ¿cómo evoluciono? → ¿hay algo que atender?". Adherencia en amarillo como métrica principal; azul eléctrico para tendencias y marcas; barras simples con una tabla oculta para lectores de pantalla y un resumen en texto. Periodo con enlaces (`PeriodTabs`); filtros del coach como formulario GET en un `BottomSheet` (mobile) o en línea (desde tablet). Componentes en `components/progress/`.

## Avisos operativos (fase 9)

**Por qué una tabla:** los eventos se detectan con las tablas existentes, pero el estado leído/no leído y el historial necesitan persistirse. `coach_alerts` guarda solo el aviso (título, descripción, prioridad, fecha del evento, `read_at`), no métricas.

**Modelo** (migraciones `add_coach_alerts`, `drop_alert_read_check` y `add_alert_resolved_at`):
- `coach_id` (cascada), `athlete_id` y `session_id` con `SET NULL` + `athlete_name` copiado: si se borra el atleta o la sesión, el aviso queda como historial sin enlace.
- `kind` (enum `alert_kind`), `source_id` (molestia, registro de sesión, asignación o invitación), `priority` 1–4, `event_at`, `read_at`.
- **Idempotencia:** `UNIQUE (coach_id, kind, source_id)` + `createMany({ skipDuplicates })` (ON CONFLICT DO NOTHING). Recalcular nunca duplica ni vuelve a marcar como no leído.
- CHECK de prioridad y longitudes; RLS sin políticas. (Se eliminó un CHECK `read_at >= created_at` porque mezclaba el reloj del servidor de la app con el de la BD.)

**Generación** (`syncCoachAlerts`, una vez por petición con `cache()`): al cargar la bandeja, el Inicio o el contador del layout. Solo atletas con relación `active`, solo sesiones del coach y solo eventos de los últimos 30 días. Las reglas son puras (`lib/alerts/rules.ts`):

| Tipo | Origen | Prioridad |
| --- | --- | --- |
| `molestia` | `discomfort_reports` (también si la sesión se canceló después: es una señal de salud) | 1 Prioritaria |
| `sesion_incompleta` | registro completado con menos series que el snapshot | 2 Revisar |
| `rpe_alto` | registro completado con RPE ≥ 9 | 2 Revisar |
| `en_curso_prolongada` | registro en curso iniciado hace más de 5 h | 2 Revisar |
| `no_iniciada` | asignación vigente de un día ya pasado sin registro | 3 Seguimiento |
| `relacion_aceptada` | invitación aceptada | 4 Información |

Salvo molestias, se excluyen sesiones canceladas y asignaciones retiradas.

**Resolución:** cada sincronización revisa los avisos `no_iniciada` sin resolver: si la asignación ya tiene registro (en curso, abandonada o completada), la sesión se canceló, se retiró al atleta o la asignación ya no existe, recibe `resolved_at` (`UPDATE … WHERE resolved_at IS NULL`, idempotente). **Pendiente = `read_at` y `resolved_at` nulos**: lo usan la bandeja "Sin leer", el contador y el Inicio. Resolver nunca toca `read_at` (un leído sigue leído) y el aviso queda en "Todos" marcado como "Resuelto".

**Visibilidad y permisos:** todo filtra por el `coach_id` de la sesión. Se muestran avisos de atletas que hoy están **activos** con el coach (los de atletas en pausa se ocultan y se conservan) o cuyo atleta ya no existe. Marcar como leído busca el aviso dentro de ese filtro: un id ajeno responde "no existe". Los enlaces llevan a pantallas que ya validan la propiedad.

**Interfaz:** `/coach/avisos` (acción principal "Marcar todos como leídos", filtros GET en `BottomSheet`/en línea, historial en "Leídos"); 3 avisos sin leer en Inicio con "Ver todos"; contador como slot de servidor en `CoachShell` (campana en mobile, enlace "Avisos" en la barra lateral) con nombre accesible "Avisos, N sin leer". Cada prioridad tiene icono, texto, etiqueta accesible y color de apoyo; las molestias muestran "Reporte del atleta; no constituye un diagnóstico médico."

## Personalización por atleta (fase 10)

**Por qué una tabla relacional** (y no un JSON en la asignación): cada ajuste tiene columnas tipadas, rangos con CHECK, una fila única por elemento y un trigger que conoce el estado de la sesión, de la asignación y de la ejecución. Restaurar es borrar filas; la auditoría queda en `created_by`/`updated_by` y `updated_at`.

**Modelo** (migración `add_assignment_overrides`): `assignment_overrides` con `assignment_id` (cascada) y la posición del elemento en el snapshot (`block_index`, `exercise_index`; el snapshot no tiene ids propios y la posición es la misma que usan `set_logs` y las molestias). `UNIQUE (assignment_id, block_index, exercise_index)`.
- Ajustes opcionales: series, **un** objetivo (reps, distancia o tiempo, el del mismo tipo que el original), carga (kg) o `remove_load` ("sin carga"), descanso, nota, `skipped`.
- Sustitución: `replacement_exercise_id` (`SET NULL`) + copia **congelada** de nombre, categoría y equipo: cambios posteriores en la biblioteca no alteran la sesión personalizada.
- CHECK: mismos rangos que `block_exercises`, como máximo un objetivo, carga y "sin carga" excluyentes, sustitución completa y nunca una fila vacía.
- Trigger `check_assignment_override` (insertar, actualizar y borrar): asignación `asignada`, sesión `programada` y **sin registro de ejecución** (al comenzar, todo queda bloqueado aunque el coach tenga permisos); la posición existe; el objetivo es del tipo original; el reemplazo es del sistema o del mismo coach y no está archivado. Las acciones referenciales (`SET NULL` por un ejercicio o coach borrado) y los borrados en cascada se permiten para no bloquear el borrado de cuentas.
- `check_set_log_position` se reemplazó (nueva versión en la misma migración): valida las series contra el plan **personalizado** (series ajustadas) y rechaza series de un ejercicio omitido.
- RLS activo y sin políticas.

**Plan efectivo** (`lib/overrides/apply.ts`): `applyOverrides(snapshot, ajustes)` devuelve una copia con la versión del atleta; cada ejercicio conserva `original`, `adapted`, `replaced`, `skipped` y `athleteNote`. El snapshot y la plantilla nunca se escriben. `setSlots`, `isValidPosition` y `summarize` excluyen los omitidos (ni pendientes ni "no realizadas").

**Dónde se aplica:** el DAL entrega el plan efectivo en el detalle, la ejecución y el resumen del atleta (`lib/db/sessions.ts` y `lib/db/execution.ts`, solo con los ajustes del propio atleta), en los resultados del coach, en el progreso (marcas y evolución usan el ejercicio sustituto) y en los avisos (series planeadas personalizadas). `logSetAction` valida contra el plan efectivo y el trigger lo repite: el cliente solo envía la posición. Como los ajustes se bloquean al comenzar, la pareja original + ajuste es inmutable y sirve de historial sin copiarse a `set_logs`.

**Permisos:** solo el coach dueño de la sesión, con relación **activa** con el atleta (`findAssignmentForOverride`, `saveAssignmentOverrides`, `saveOverridesAction`); un registro ajeno responde 404. Los reemplazos se validan contra la biblioteca del coach en el servidor (nombre, categoría y equipo salen de la BD, no del cliente). Guardar reemplaza los ajustes de esa asignación en una transacción y vuelve a revisar los bloqueos.

**Interfaz:** editor por ejercicio (acordeones con "Plan original" y "Ajuste para este atleta"), resumen de cambios antes de guardar, vista previa de la versión del atleta, "Restaurar original" por ejercicio y "Restaurar todo" con confirmación, aviso al descartar cambios. Única acción fija: "Guardar personalización". Bloqueada con mensaje claro si el atleta ya comenzó, la sesión se canceló, el atleta fue retirado o está en pausa.

## Estados de pantalla

Toda pantalla con datos envuelve su contenido en `ScreenStates` (`components/shared/screen-states.tsx`):

| Estado | Cómo se muestra |
| --- | --- |
| Cargando | `loading.tsx` por área + `LoadingState` (esqueletos) |
| Vacío | `EmptyState` con mensaje y acción específicos de la pantalla |
| Con datos | Contenido normal |
| Error | `error.tsx` por área + `ErrorState` con reintento |
| Sin conexión | `OfflineBanner` real + `OfflineState` |
| Sin permisos | `ForbiddenState` |
| Guardando / guardado | `Button loading` + mensaje en línea + `Toast` |

Sin backend, cada estado se previsualiza con `?estado=cargando|vacio|error|sin-conexion|sin-permisos`. Cuando exista la capa de datos, `ScreenStates` recibirá el estado real.

## Sistema visual

- **Tokens.** Viven en `app/globals.css` (`@theme`) y se usan como utilidades (`bg-surface`, `text-muted`, `border-line`, `bg-acid`…). No se escriben colores hexadecimales en los componentes.

| Token | Valor | Uso |
| --- | --- | --- |
| `bg` | `#0B0D0F` | Fondo principal |
| `surface` / `surface-2` | `#15191D` / `#20262B` | Tarjetas / bloque destacado |
| `line` | `#2C3338` | Bordes |
| `ink` / `muted` | `#F5F5F0` / `#9BA3A8` | Texto principal / secundario |
| `acid` | `#D7F500` | **Solo** la acción principal, el progreso activo y las marcas |
| `electric` | `#4D8DFF` | Enlaces, foco, selección |
| `positive` / `warning` / `danger` | `#A8E063` / `#F2B84B` / `#FF6B6B` | Estados |

- **Tipografía.** Inter (`next/font`) con números tabulares (`tabular-nums`) en tiempos, cargas y distancias.
- **Radios.** `rounded-xl` (12 px) para controles y `rounded-2xl` (16 px) para tarjetas.
- **Sombras.** `shadow-card` (discreta) y `shadow-overlay` (diálogos).
- **Foco.** Contorno azul eléctrico visible en todo elemento enfocable.

## Mobile-first y navegación

| Ancho | Coach | Atleta |
| --- | --- | --- |
| < 768 px | Barra superior + barra inferior (Inicio, Calendario, Atletas, Progreso, **Más** → bottom sheet) | Barra inferior de 5 elementos |
| ≥ 768 px | Barra lateral con logo, "Nueva sesión" (CTA global en estilo **secundario**, para no competir con la acción amarilla de la página), secciones y perfil real | Navegación horizontal superior |

- **Áreas táctiles.** Mínimo de 44 × 44 px, verificado automáticamente en las pruebas e2e.
- **Celda central del atleta.** En la barra inferior del atleta, la celda central es más ancha para que "Entrenamiento" no se corte.
- **Grids.** Siempre declaran `grid-cols-1` como base. Sin ella, la columna implícita crece al ancho del contenido y genera scroll horizontal.
- **Formularios largos.** Se dividen en secciones (tarjetas) y su botón de guardar queda fijo sobre la barra inferior (`StickyActions`).

## Accesibilidad

- **Diálogos.** Usan `<dialog>` nativo: bloqueo de foco, Escape y retorno de foco.
- **Pestañas.** Siguen el patrón WAI-ARIA, con flechas, Inicio y Fin.
- **Inputs.** Cada uno tiene su `label` asociado; los errores se enlazan con `aria-describedby` y se anuncian con `role="alert"`.
- **Estados.** Usan icono más texto, nunca solo color.
- **Navegación.** Hay un enlace "Saltar al contenido" y la sección activa se marca con `aria-current`.

## PWA

- `app/manifest.ts` (standalone, tema oscuro, `lang="es-MX"`) e icono SVG.
- `viewport-fit=cover` y espaciados `safe-area` para pantallas con notch.
- Service worker y modo offline: fase posterior.
