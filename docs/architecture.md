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

- **Esquema activo** (`prisma/schema.prisma`): `profiles`, `coach_profiles` y `athlete_profiles`. `profiles.id` es el mismo id de `auth.users` (FK con cascada).
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
