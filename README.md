# RoxCoach

Plataforma web/PWA en español para coaches y atletas de **HYROX**. Reemplaza pizarrones, documentos de Word y mensajes dispersos por un sistema centralizado para **crear, asignar, ejecutar y medir** entrenamientos.

- **Panel del coach** (`/coach/*`): pensado para desktop y tablet.
- **App del atleta** (`/atleta/*`): pensada para mobile y uso con una mano.

> **Estado actual: fase 7.**
> - **Ya funciona:** autenticación real (Supabase), roles coach/atleta, rutas protegidas, perfiles en PostgreSQL (Prisma), **gestión de atletas con invitaciones** (relación coach–atleta), **biblioteca de ejercicios**, **constructor de plantillas**, **programación y asignación de sesiones** y **ejecución del entrenamiento por el atleta**.
> - **Datos reales:** Ejecución (comenzar, serie activa con lo planeado separado de lo realizado, descanso, pausa y reanudación guardadas en el servidor, corregir series, finalizar con confirmación, resumen con RPE general, comentario y molestias; el coach ve estado y resultados por atleta), Programación (programar una plantilla publicada para varios atletas activos con snapshot congelado; editar detalles, cancelar, agregar y quitar atletas), Calendario semanal del coach, sesiones de hoy en Inicio, Agenda, Inicio, Entrenamiento y detalle de sesión del atleta, Entrenamientos (plantillas por bloques con ejercicios de la biblioteca: crear, editar, reordenar, vista previa, borrador/publicar, duplicar, archivar y restaurar), Biblioteca (ejercicios de RoxCoach y personalizados: buscar, filtrar, crear, editar, duplicar, archivar y restaurar, con medios por URL y sustituciones), detalle de ejercicio para el atleta, Atletas (lista, detalle, invitaciones, pausar y reactivar), invitación pública `/invitacion/[token]`, Configuración del coach, Perfil del atleta (con su coach) y los saludos.
> - **Todavía con datos ficticios:** progreso, mensajes y los indicadores secundarios del Inicio del coach.

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

Requisitos: Node.js 20.9 o superior (probado con Node 24) y un proyecto de Supabase **de desarrollo**.

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
5. **Arranca la app.**
   ```bash
   npm run dev          # http://localhost:3000
   ```

Sin `.env.local`, el servidor responde con un error que indica qué variable falta.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` | ESLint |
| `npm run typecheck` | Tipos de rutas + `tsc --noEmit` |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Setup de usuarios de prueba + rutas en 5 anchos + flujos de autenticación (Playwright) |
| `npm run build` | Build de producción (no requiere secretos) |
| `npm run validate` | Lint + typecheck + pruebas unitarias + build |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:migrate` | Aplica migraciones pendientes (`prisma migrate deploy`) |
| `npm run db:status` | Estado de las migraciones |
| `npm run db:studio` | Explorador de datos de Prisma |

Las e2e requieren `.env.local` completo, incluidos `SUPABASE_SECRET_KEY` y `E2E_*`, y `npx playwright install chromium` la primera vez.

## Estructura

```text
proxy.ts             Refresca la sesión y protege /coach y /atleta por rol
app/
  coach/…            Panel del coach (8 secciones)
  atleta/…           App del atleta (5 secciones)
  login/ registro/   Acceso (Supabase Auth)
  auth/confirm       Confirmación de correo
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
  db/                Prisma: perfiles, atletas, invitaciones, ejercicios, plantillas, sesiones y ejecución
  invitations/       Tokens y reglas de invitación (funciones puras)
  exercises/         Catálogos, permisos, sustituciones y filtros de la biblioteca (funciones puras)
  workouts/          Plantillas: unidades, prescripciones, conversión y reglas de publicación (puras)
  scheduling/        Fechas de calendario en la zona de la app, ?semana= y snapshot de sesiones (puras)
  execution/         Ejecución: series del snapshot, progreso, tiempo activo, resumen y catálogos de molestias (puras)
  athletes/          Filtros puros de la lista de atletas
  permissions/       Roles, acceso por ruta y destinos seguros
  validations/       Validaciones puras (cliente y servidor)
  env.ts             Variables de entorno con errores claros
  mock/              Datos ficticios de los módulos aún no implementados
prisma/              Esquema activo, migraciones y seed
tests/unit, tests/e2e
docs/                Arquitectura, flujo de trabajo, módulos y modelo futuro
```

Más detalle en [docs/architecture.md](docs/architecture.md), [docs/development-workflow.md](docs/development-workflow.md) y [docs/modules.md](docs/modules.md).
