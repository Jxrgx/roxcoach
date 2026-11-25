# RoxCoach

Plataforma web/PWA en español para coaches y atletas de **HYROX**. Reemplaza pizarrones, documentos de Word y mensajes dispersos por un sistema centralizado para **crear, asignar, ejecutar y medir** entrenamientos.

- **Panel del coach** (`/coach/*`): pensado para desktop y tablet.
- **App del atleta** (`/atleta/*`): pensada para mobile y uso con una mano.

> **Estado actual: fase 12.**
> - **Ya funciona:** autenticación real (Supabase), roles coach/atleta, rutas protegidas, perfiles en PostgreSQL (Prisma), **gestión de atletas con invitaciones** (relación coach–atleta), **biblioteca de ejercicios**, **constructor de plantillas**, **programación y asignación de sesiones**, **ejecución del entrenamiento**, **progreso con datos reales**, **avisos operativos para el coach**, **personalización de sesiones por atleta**, **ejecución resistente a cortes de conexión** y **PWA instalable con recarga offline de la ejecución**.
> - **Datos reales:** PWA instalable (manifest e iconos) y recarga sin red de la ejecución abierta (service worker mínimo + copia local en IndexedDB; página offline; limpieza de datos privados al cerrar sesión), Ejecución sin conexión (cada serie, pausa, reanudación y finalización se guarda primero en el dispositivo y se envía en orden e idempotente al volver la red; estado de conexión visible, reintento manual, conflictos explicados y sin duplicados), Personalización por atleta (ajustar carga, series, objetivo, descanso y nota, sustituir u omitir ejercicios antes de que el atleta comience, con vista previa y restauración; el atleta ve y ejecuta su versión y el coach compara original, ajuste y realizado), Avisos del coach (molestias, sesiones incompletas, RPE alto, sesiones en curso demasiado tiempo, no iniciadas y nuevos atletas; bandeja con filtros, marcar leído, historial, resumen en Inicio y contador en la navegación), Progreso del atleta y del coach (adherencia, completadas en 7/30/90 días, tiempo entrenado, RPE promedio, marcas personales, evolución por ejercicio y molestias; filtros por periodo, atleta y estado; detalle por atleta), Ejecución (comenzar, serie activa con lo planeado separado de lo realizado, descanso, pausa y reanudación guardadas en el servidor, corregir series, finalizar con confirmación, resumen con RPE general, comentario y molestias; el coach ve estado y resultados por atleta), Programación (programar una plantilla publicada para varios atletas activos con snapshot congelado; editar detalles, cancelar, agregar y quitar atletas), Calendario semanal del coach, sesiones de hoy en Inicio, Agenda, Inicio, Entrenamiento y detalle de sesión del atleta, Entrenamientos (plantillas por bloques con ejercicios de la biblioteca: crear, editar, reordenar, vista previa, borrador/publicar, duplicar, archivar y restaurar), Biblioteca (ejercicios de RoxCoach y personalizados: buscar, filtrar, crear, editar, duplicar, archivar y restaurar, con medios por URL y sustituciones), detalle de ejercicio para el atleta, Atletas (lista, detalle, invitaciones, pausar y reactivar), invitación pública `/invitacion/[token]`, Configuración del coach, Perfil del atleta (con su coach) y los saludos.
> - **Todavía con datos ficticios:** mensajes.

Las reglas permanentes de desarrollo, diseño y UX están en [CLAUDE.md](CLAUDE.md).

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Turbopack, `proxy.ts`) |
| Lenguaje | TypeScript estricto (`strict`, `noUncheckedIndexedAccess`) |
| Estilos | Tailwind CSS 4 con tokens en `app/globals.css` |
| Autenticación | Supabase Auth con sesión en cookies (`@supabase/ssr`) |
| Base de datos | PostgreSQL (Supabase) + Prisma 7 (`@prisma/adapter-pg`) |
| Iconos | lucide-react |
| Pruebas | Vitest + Testing Library (unitarias), Playwright (e2e y responsive) |

## Configuración (primera vez)

Requisitos: Node.js 24.x (la versión fijada en `engines` y la que usa Vercel) y un proyecto de Supabase **de desarrollo**.

1. **Instala dependencias.** Al terminar, genera el cliente de Prisma automáticamente.
   ```bash
   npm install
   ```
2. **Crea las variables de entorno.** Copia `.env.example` a `.env.local` y complétalo con los datos de tu proyecto de Supabase (Project Settings → API / API Keys / Connect). `.env.local` nunca se versiona.
3. **Aplica las migraciones.** Crean las tablas de perfiles, los triggers de registro y RLS.
   ```bash
   npm run db:migrate
   ```
4. **Configura Auth en el dashboard de Supabase** (Authentication → URL Configuration):
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/confirm**`. El comodín permite el parámetro `?next=`, con el que el registro desde una invitación regresa a ella.
   - "Confirm email" activado (Authentication → Providers → Email).
   - Recomendado: plantilla "Confirm signup" con `token_hash` (funciona aunque el enlace se abra en otro dispositivo). Ver [docs/deployment.md §4.3](docs/deployment.md#43-plantilla-confirm-signup-authentication--emails--templates).
5. **Arranca la app.**
   ```bash
   npm run dev          # http://localhost:3000
   ```

Sin `.env.local`, el servidor responde con un error que indica qué variable falta.

Para probar el build de producción en local (`npm run build && npm start`) agrega `APP_URL=http://localhost:3000` a `.env.local`: en producción es obligatoria y el servidor no arranca sin ella.

## Producción

Despliegue piloto en **Vercel** con **Supabase**, preparado pero todavía no publicado:

```text
Vercel
  ├── Development → roxcoach-dev
  ├── Preview     → roxcoach-dev
  └── Production  → roxcoach-prod (https://roxcoach.vercel.app)
```


- [docs/deployment.md](docs/deployment.md): ambientes, variables, Supabase (URLs y plantilla de confirmación), SMTP y DNS, migraciones, respaldo y restauración, health check y orden seguro de despliegue.
- [docs/security.md](docs/security.md): controles de seguridad, cabeceras, registro seguro y pendientes.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` | ESLint |
| `npm run typecheck` | Tipos de rutas + `tsc --noEmit` |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run check:instant` | Recorre las rutas contra tu `next dev` y falla con cualquier error de consola (validación de navegación instantánea de Next) |
| `npm run measure:nav` | Mide la navegación entre módulos contra un servidor en marcha (ver docs/development-workflow.md) |
| `npm run test:e2e` | Setup de usuarios de prueba + rutas en 5 anchos + flujos de autenticación (Playwright) |
| `npm run build` | Build de producción (no requiere secretos) |
| `npm run validate` | Lint + typecheck + pruebas unitarias + build |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:migrate` | Aplica migraciones pendientes (`prisma migrate deploy`) |
| `npm run db:status` | Estado de las migraciones |
| `npm run demo:seed` · `demo:status` · `demo:cleanup` | Dataset de demostración en `roxcoach-dev` para el coach existente (ver docs/development-workflow.md) |
| `npm run db:residue` | Reporte de solo lectura de datos de prueba (conteos, usuarios compartidos, residuos) |
| `npm run db:audit` | Auditoría de solo lectura: RLS, privilegios, funciones y migraciones |
| `npm run db:studio` | Explorador de datos de Prisma |

Las e2e requieren `.env.local` completo, incluidos `SUPABASE_SECRET_KEY` y `E2E_*`, y `npx playwright install chromium` la primera vez.

## Estructura

```text
proxy.ts             Refresca la sesión y protege /coach y /atleta por rol
app/
  coach/…            Panel del coach (8 secciones)
  atleta/…           App del atleta (5 secciones)
  login/ registro/   Acceso (Supabase Auth)
  auth/confirm       Confirmación de correo (token_hash o code)
  api/health         Health check para el despliegue
  auth/salir         Cierre de sesión cuando la sesión es inválida
  invitacion/[token] Invitación pública para unirse al equipo de un coach
  componentes/       Catálogo del sistema visual (desarrollo)
components/
  ui/                Componentes genéricos
  coach/ athlete/    Componentes por experiencia
  workouts/          Componentes del dominio de entrenamiento
  shared/            Shells, estados, formularios de acceso
lib/
  supabase/          Clientes de navegador/servidor y refresco de sesión
  auth/              Sesión (DAL), Server Actions de acceso y mensajes de error
  db/                Prisma: perfiles, atletas, invitaciones, ejercicios, plantillas, sesiones, ejecución, progreso (lectura), avisos, personalización y sincronización de la ejecución
  invitations/       Tokens y reglas de invitación (funciones puras)
  exercises/         Catálogos, permisos, sustituciones y filtros de la biblioteca (funciones puras)
  workouts/          Plantillas: unidades, prescripciones, conversión y reglas de publicación (puras)
  scheduling/        Fechas de calendario en la zona de la app, ?semana= y snapshot de sesiones (puras)
  execution/         Ejecución: series del snapshot, progreso, tiempo activo, resumen y catálogos de molestias (puras)
  progress/          Progreso: estados, adherencia, periodos, tiempo, RPE, marcas y evolución (puras)
  alerts/            Avisos: tipos, prioridades, generación de candidatos, deduplicación y orden (puras)
  overrides/         Personalización por atleta: plan efectivo, cambios, validación y bloqueos (puras)
  offline/           Cola local de la ejecución, copia local para restaurar sin red, reglas del servidor (puras) e IndexedDB
public/sw.js         Service worker mínimo (fase 12); reglas puras en public/sw-rules.js
  athletes/          Filtros puros de la lista de atletas
  permissions/       Roles, acceso por ruta y destinos seguros
  validations/       Validaciones puras (cliente y servidor)
  env.ts             Variables de entorno con errores claros
  config/            Catálogo y validación de variables por ambiente, origen público (puras)
  security/          Cabeceras de seguridad HTTP y CSP (puras)
  http/              Origen público para enlaces absolutos (APP_URL)
  log.ts             Registro seguro (error/warn/info, sin datos sensibles)
components/shared/page-skeletons.tsx  Fallbacks de Suspense por página (fase 14)
  mock/              Datos ficticios de los módulos aún no implementados
prisma/              Esquema activo, migraciones y seed
instrumentation.ts   Valida la configuración al arrancar en producción
vercel.json          Framework y región de funciones (pdx1, junto a Supabase us-west-2)
scripts/db-audit.mjs Auditoría de la base de datos (solo lectura)
scripts/check-instant.mjs, measure-navigation.mjs  Validación de navegación instantánea y medición
tests/unit, tests/e2e
docs/                Arquitectura, flujo de trabajo, módulos, despliegue, seguridad y modelo futuro
```

Más detalle en [docs/architecture.md](docs/architecture.md), [docs/development-workflow.md](docs/development-workflow.md) y [docs/modules.md](docs/modules.md).
