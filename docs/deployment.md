# Despliegue (Vercel + Supabase)

Guía para el despliegue piloto en **Vercel** con **Supabase** (fase 15). No contiene valores reales: los secretos viven en el dashboard de Vercel, en el de Supabase y en `.env.local` (nunca en el repositorio).

> **Estado:** la app está **preparada**, pero todavía **no se ha desplegado**. Faltan las acciones manuales del §12: crear `roxcoach-prod`, crear el proyecto en Vercel y cargar sus variables. **El piloto no usa dominio propio**: la URL de producción es la gratuita de Vercel, `https://roxcoach.vercel.app`. El SMTP propio es **opcional** para el piloto (§6).

> **Demo actual (temporal):** el proyecto de Vercel publicado en `https://roxcoach-orpin.vercel.app` usa **`roxcoach-dev`** como base, con el dataset de demostración del coach existente (`docs/development-workflow.md` → Dataset de demostración). No es producción.
>
> - Al desplegar el código de la fase 15, su ambiente Production debe tener `APP_URL=https://roxcoach-orpin.vercel.app`, que es la URL de producción del proyecto (§11.1), y **ninguna** variable de pruebas (`SUPABASE_SECRET_KEY`, `E2E_*`, `TEST_*`, `DEMO_*`). Si no, el build se detiene.
> - `roxcoach-dev` debe tener `https://roxcoach-orpin.vercel.app/auth/confirm**` en sus Redirect URLs.
> - Cuando exista `roxcoach-prod`, el dataset demo **no** se ejecuta contra ella.

## 1. Arquitectura de despliegue

```text
Vercel (proyecto roxcoach, región de funciones pdx1 · vercel.json)
  ├── Development → roxcoach-dev   (local: npm run dev + .env.local)
  ├── Preview     → roxcoach-dev   (ramas y PR; datos de prueba; NUNCA prod)
  └── Production  → roxcoach-prod (rama main; https://roxcoach.vercel.app)

Supabase (un proyecto por ambiente de datos, región us-west-2)
  ├── Auth        (correo y contraseña, confirmación obligatoria)
  ├── PostgreSQL  (Prisma 7: pooler 6543 en runtime, sesión 5432 para migraciones)
  ├── RLS         (todas las tablas; sin privilegios para la API pública)
  └── Correo de Auth (piloto: SMTP integrado de Supabase, limitado; luego SMTP externo)
```

| Ambiente | Dónde corre | Supabase | Variables | Datos |
| --- | --- | --- | --- | --- |
| **Development** | Tu máquina (`npm run dev`, e2e en :3100) | `roxcoach-dev` | `.env.local` (ignorado por Git) | Usuarios y datos de prueba |
| **Preview** | Vercel, cada rama o PR | `roxcoach-dev` | Variables *Preview* de Vercel | Los mismos de dev (de prueba) |
| **Production** | Vercel, rama `main` | `roxcoach-prod` | Variables *Production* de Vercel | Solo usuarios reales |

**Reglas:**

- **Nunca se mezclan** usuarios, sesiones, datos ni claves entre `roxcoach-dev` y `roxcoach-prod`.
  - La validación compara el proyecto de `NEXT_PUBLIC_SUPABASE_URL` con el de `DATABASE_URL` y `DIRECT_URL`, y falla si no coinciden.
  - Además, en Vercel rechaza las variables de pruebas en cualquier ambiente.
- **Preview nunca recibe valores de Production:** en el dashboard, cada variable se marca por ambiente (§3).
- **Producción sin datos de prueba:**
  - Las e2e solo corren contra `roxcoach-dev`.
  - Production no tiene `SUPABASE_SECRET_KEY` ni `E2E_*`.
  - Nunca se ejecutan el setup de pruebas ni seeds de prueba contra `roxcoach-prod`.

## 2. Requisitos

- **Node.js 24.x** (`engines.node` en `package.json`; Vercel lo respeta). Todas las pruebas locales corren con Node 24.
- **npm**, con `package-lock.json`. Vercel instala con `npm install`, que respeta el lockfile, y `postinstall` genera el cliente de Prisma.
- **Región:** `vercel.json` fija las funciones en **`pdx1`** (Portland, us-west-2), junto a Supabase us-west-2.
  - Cada página hace algunas consultas en secuencia y el proxy consulta la base en cargas directas de detalles.
  - Con la región por defecto de Vercel (`iad1`, us-east-1), cada viaje sumaría ~60–70 ms.
  - **Si `roxcoach-prod` se crea en otra región, cambia `regions` antes del primer deploy.** Tabla de equivalencias: `iad1` ↔ us-east-1, `pdx1` ↔ us-west-2, `cle1` ↔ us-east-2.
- **HTTPS:** Vercel lo da automáticamente para `*.vercel.app` (incluida `roxcoach.vercel.app`). Sin dominio propio, no hay DNS que configurar.

## 3. Variables por ambiente (Vercel → Project Settings → Environment Variables)

El catálogo está en `lib/config/env-rules.ts` (`ENV_VARS`), y la plantilla en `.env.example`.

| Variable | Tipo | Development (`.env.local`) | Preview (Vercel) | Production (Vercel) |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública (se incrusta en el JS y en la CSP) | dev | dev | **prod** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública, protegida por RLS | dev | dev | **prod** |
| `DATABASE_URL` | Secreto de servidor (pooler 6543) | dev | dev | **prod** · *Sensitive* |
| `APP_URL` | Servidor; también en el build (HSTS/CSP) | `http://localhost:3000` (opcional) | **No la definas**: se usa la URL de la rama (`VERCEL_BRANCH_URL`) | **Obligatoria**: `https://roxcoach.vercel.app`, exactamente la URL de producción del proyecto. La validación la compara con `VERCEL_PROJECT_PRODUCTION_URL` y rechaza la URL de un deployment o de Preview |
| `ALLOWED_ORIGINS` | Servidor (opcional) | Túneles, si los usas | Vacía | Vacía (sin dominio propio no hay orígenes alternos) |
| `ROXCOACH_CATALOG` | Herramienta de desarrollo | `1` si quieres `/componentes` | **No** | **No** (la validación la rechaza) |
| `ROXCOACH_DB_TRACE` | Medición | Solo al medir | **No** | **No** (rechazada) |
| `DIRECT_URL` | Secreto de migraciones (5432) | dev | **No** | **No** (rechazada: las migraciones se ejecutan fuera de Vercel) |
| `SUPABASE_SECRET_KEY`, `E2E_*` | Secretos de pruebas | Sí (e2e) | **No** (rechazadas) | **No** (rechazadas) |
| `TEST_COACH_PASSWORD`, `TEST_ATHLETE_PASSWORD` | **Obsoletas**: ningún archivo las usa | Retíralas de `.env.local` | **No** (rechazadas) | **No** (rechazadas) |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Del sistema de Vercel | — | Automáticas | Automáticas |

**Notas:**

- **Validación en el build** (`scripts/check-build-env.mjs` → `buildTimeProblems`, se ejecuta dentro de `npm run build` antes de `next build`, solo cuando `VERCEL=1` y no es Development). El build de Preview o Production **falla** si:
  - falta una variable obligatoria;
  - hay variables de pruebas;
  - los proyectos están mezclados;
  - en Production hay `APP_URL` vacía, `DIRECT_URL` u orígenes http.

  El mensaje solo nombra variables, nunca valores.
- **Validación al arrancar:** `instrumentation.ts` repite la validación en el runtime.
- **Alcance de las variables:** solo las `NEXT_PUBLIC_*` llegan al navegador. Una prueba unitaria comprueba que ningún archivo `"use client"` lea variables de servidor.
- **En el dashboard:**
  - marca `DATABASE_URL` como **Sensitive**: no se podrá volver a leer;
  - asigna cada variable **solo** a su ambiente;
  - no uses "All Environments" para valores de prod.
- **Cambiar una variable en Vercel no afecta a los despliegues existentes.** Hace falta un **nuevo deployment**: *Redeploy* del último, o un push.

## 4. Proyecto de Vercel (configuración manual)

| Ajuste | Valor |
| --- | --- |
| Proyecto | `roxcoach`, importado desde el repositorio de GitHub |
| Framework Preset | Next.js (también fijado en `vercel.json`) |
| Root Directory | `./` |
| Install Command | Por defecto (`npm install`; ejecuta `postinstall` → `prisma generate`) |
| Build Command | Por defecto (`npm run build` → `next build`). **Nunca** agregues migraciones al build |
| Output | Por defecto (`.next`) |
| Node.js Version | 24.x (lo fija `engines`) |
| Production Branch | `main` |
| Función: región | `pdx1` (`vercel.json`; verifícalo en Settings → Functions) |
| Deployment Protection | Activada para Preview (Vercel Authentication). Para smoke tests automáticos usa un *Protection Bypass for Automation*, sin guardarlo en el repositorio |
| Logs | Runtime Logs del proyecto (JSON de una línea por evento, `lib/log.ts`) |

**Qué hace Vercel con la app:**

- `proxy.ts` se ejecuta como middleware de Node.js en la región de las funciones. Consulta la base solo en cargas directas de rutas de detalle.
- Los shells estáticos y prerenderizados (`/login`, `/registro`, páginas offline, 404) se sirven desde el CDN con `s-maxage`. No contienen datos de usuarios.
- Las rutas con sesión responden `Cache-Control: private, no-store`, así que el CDN nunca las guarda. Las e2e lo verifican.
- `/sw.js` y `/sw-rules.js` llevan `Cache-Control: no-cache` (`next.config.ts`).

## 5. Supabase de producción (`roxcoach-prod`, configuración manual)

1. **Crear el proyecto:**
   - organización correcta;
   - región **us-west-2**, igual que dev (§2);
   - contraseña de base de datos fuerte, guardada en un gestor de contraseñas.
2. **API** (Project Settings → API / API Keys):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL` (Production);
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production);
   - la **Secret key no se configura en Vercel**: la app no la usa.
3. **Conexiones** (Connect):
   - **Transaction pooler** (6543) → `DATABASE_URL` (Production).
   - **Session pooler** (5432, IPv4) → `DIRECT_URL`, **solo** en la máquina o CI desde donde migras. La conexión directa `db.<ref>.supabase.co` es solo IPv6, salvo con el add-on IPv4.
4. **Migraciones:** §7, antes del primer deploy.
5. **Auth** (Authentication → URL Configuration):
   - **Site URL:** `https://roxcoach.vercel.app`.
   - **Redirect URLs:** solo `https://roxcoach.vercel.app/auth/confirm**`, la ruta a la que vuelven los enlaces de confirmación, con su `?next=`.
   - **Nunca** agregues `https://*.vercel.app/**` ni patrones de Preview en prod. `vercel.app` es un dominio **compartido**: cualquier persona puede publicar ahí, así que un comodín amplio permitiría devolver sesiones a sitios ajenos. Tampoco agregues `localhost`.
   - Las URLs de Preview nunca son la Site URL de prod. La app tampoco las usa en Production: allí `APP_URL` debe ser exactamente la URL de producción.
6. **Auth → Sign In / Providers → Email:**
   - **Confirm email: activado**;
   - contraseña mínima de 8 caracteres;
   - protección de contraseñas filtradas si el plan lo permite.
7. **Plantilla "Confirm signup":** §6.2.
8. **Correo:** §6. SMTP propio **opcional** en el piloto, con las limitaciones del SMTP integrado.
9. **RLS, roles y privilegios:** los crean las migraciones:
   - RLS en las 19 tablas;
   - políticas de lectura propia en los perfiles;
   - `anon`/`authenticated` sin privilegios peligrosos;
   - triggers de rol en `auth.users`.

   Verifícalo con `npm run db:audit` apuntando a prod (§7).
10. **Backups** (Database → Backups):
    - confirma los respaldos diarios del plan;
    - activa PITR si la operación lo requiere;
    - ver §8.
11. **Advisors** (Security y Performance): revísalos después de migrar.

**Desarrollo y Preview (`roxcoach-dev`, ya existe):**

- Site URL: `http://localhost:3000`.
- Redirect URLs:
  - `http://localhost:3000/auth/confirm**`;
  - `http://localhost:3100/auth/confirm**`;
  - las URLs de Preview, **acotadas a tu proyecto y equipo**: `https://roxcoach-git-*-<equipo>.vercel.app/auth/confirm**`. Nunca `https://*.vercel.app/**`, porque es un dominio compartido.
- Su SMTP integrado basta para pruebas: solo envía a miembros de la organización.

## 6. SMTP (correo transaccional)

> **Piloto:** el SMTP propio es **opcional** y **no está configurado**. No se simula que lo esté.

Supabase Auth envía el correo de confirmación.

### 6.0 Piloto con el SMTP integrado de Supabase (sin SMTP propio)

- **Solo entrega a direcciones de miembros de la organización de Supabase.** A cualquier otro correo no llega.
- **Límite muy bajo de correos por hora.** Revisa el valor vigente en Authentication → Rate Limits. Es para pruebas, no para usuarios.
- **Consecuencia:** un coach o atleta del piloto que **no** sea miembro de la organización no recibirá el correo de confirmación.
- **Cómo operar el piloto así:**
  - **Mantén "Confirm email" activado.** No lo desactives para "destrabar" registros: cualquiera podría registrarse con un correo ajeno.
  - **Participantes externos:**
    1. Verifica su identidad por otro canal (en persona o por mensaje directo).
    2. Un administrador confirma la cuenta desde el dashboard de `roxcoach-prod` (Authentication → Users), o con la API de administración usando la Secret key, **solo** desde una terminal de confianza y nunca desde la app ni desde Vercel.
    3. Registra quién confirmó y cuándo.
  - **No agregues participantes como miembros de la organización** para que reciban correos: eso les daría acceso al dashboard.
- **Cuándo pasar a SMTP propio:** en cuanto el registro se abra a más personas de las que puedas confirmar a mano, o si los correos tardan o no llegan. Los pasos están abajo.

### 6.1 SMTP propio (opcional en el piloto)

Cualquier proveedor transaccional sirve: Amazon SES, Postmark, Resend, SendGrid, Mailgun u otro. Requiere un dominio propio **para enviar** (el remitente); la app puede seguir en `roxcoach.vercel.app`.

| Dato | Ejemplo (no real) | Dónde va |
| --- | --- | --- |
| Host | `smtp.proveedor.com` | Supabase (`roxcoach-prod`) → Authentication → Emails → SMTP Settings |
| Puerto | `587` (STARTTLS) o `465` (TLS) | Ídem |
| Usuario | El que indique el proveedor (a veces `apikey`) | Ídem |
| Contraseña / API key | La crea el proveedor | **Solo** en el dashboard de Supabase (nunca en Vercel ni en el repositorio) |
| Remitente | `no-reply@<dominio-de-envío>` (el `vercel.app` no sirve como remitente) | Ídem ("Sender email") |
| Nombre del remitente | `RoxCoach` | Ídem |
| Intervalo mínimo por usuario | `60` s | Ídem |

**DNS del dominio de envío** (solo si configuras SMTP propio; usa un subdominio, p. ej. `mail.<dominio-de-envío>`):

| Registro | Tipo | Valor típico | Para qué |
| --- | --- | --- | --- |
| SPF | TXT | `v=spf1 include:<dominio-del-proveedor> ~all` | Autoriza al proveedor. **Un solo** SPF por dominio |
| DKIM | CNAME/TXT `<selector>._domainkey` | El del proveedor | Firma de cada correo |
| DMARC | TXT `_dmarc.<dominio-de-envío>` | `v=DMARC1; p=none; rua=mailto:dmarc@<dominio-de-envío>` | Política y reportes |
| Return-Path | CNAME/MX | El del proveedor | Alinea SPF |

**Pasos:**

1. Verifica el dominio en el proveedor.
2. Configura el SMTP en `roxcoach-prod`.
3. Envía un registro de prueba a **tu** buzón (autorización explícita; nunca a terceros).
4. Revisa que llegue a la bandeja de entrada y que las cabeceras muestren `spf=pass`, `dkim=pass` y `dmarc=pass`.
5. Tras 2–4 semanas sin problemas, endurece DMARC a `quarantine` y luego a `reject`.

**Límites y rebotes:**

- Respeta la cuota del proveedor y el rate limit de correos de Supabase (Authentication → Rate Limits).
- Revisa los rebotes y quejas en el panel del proveedor. Muchos rebotes dañan la reputación del dominio.

### 6.2 Plantilla "Confirm signup" (en `roxcoach-prod`)

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
```

```html
<h2>Confirma tu correo</h2>
<p>Hola, gracias por registrarte en RoxCoach.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirmar mi correo</a></p>
<p>Si no creaste esta cuenta, ignora este mensaje.</p>
```

Asunto sugerido: `Confirma tu correo en RoxCoach`.

**Cómo procesa `app/auth/confirm/route.ts` el enlace:**

- `{{ .SiteURL }}` es `https://roxcoach.vercel.app` (la Site URL de prod).
- Si el proyecto no permite editar la plantilla con el SMTP integrado, la plantilla por defecto (`{{ .ConfirmationURL }}`, flujo PKCE) también funciona con `/auth/confirm`. Su limitación: el enlace debe abrirse en el **mismo navegador** donde se hizo el registro.
- `{{ .RedirectTo }}` es `<APP_URL>/auth/confirm?next=<ruta>`. Se reduce a una **ruta interna** y se valida por rol; nunca redirige a otro origen.
- Solo acepta `type=email` y `type=signup`. Con PKCE (`?code=`) sigue funcionando.

**Prueba manual:** con un correo tuyo (miembro de la organización, si usas el SMTP integrado) y con autorización explícita. Nunca a terceros.

## 7. Migraciones (fuera de Vercel)

**Las migraciones nunca corren en el build de Vercel.** Se aplican desde tu máquina, o desde un CI controlado, con `DIRECT_URL` (*session pooler* 5432) del proyecto destino cargada en esa terminal.

- **Comandos:**
  - `npm run db:status`: estado.
  - `npm run db:migrate`: aplica las pendientes, siempre con `prisma migrate deploy`.
  - `npm run db:audit`: verificación de **solo lectura**: RLS, privilegios, funciones, triggers y migraciones pendientes, fallidas o alteradas. Sale con código 1 si encuentra un problema.
- **Prohibido** en Preview y Production:
  - `prisma migrate reset` (borra la base);
  - `prisma migrate dev` (requiere una base sombra sin el esquema `auth`);
  - `prisma db push`.
- **Nunca edites una migración aplicada**; `db:audit` lo detecta por checksum.
- **Migraciones compatibles hacia atrás:** el deployment anterior debe funcionar con el esquema nuevo, que es lo que permite el rollback instantáneo de Vercel.

**Procedimiento (primera vez en prod y en cada entrega con migraciones):**

1. **Respaldo** de `roxcoach-prod` (§8).
2. En tu terminal, con la `DIRECT_URL` de prod (nunca guardada en el repositorio):
   1. `npm run db:status`;
   2. `npm run db:migrate`;
   3. `npm run db:audit` (debe salir todo ✓).
3. **Verificación:** advisors de Supabase sin alertas nuevas.
4. **Despliegue** de la app (§9).
5. **Si una migración falla a medias:** no la marques como aplicada a mano. Revisa qué quedó aplicado (`db:status`), corrige con una migración **nueva** y, si hace falta, usa `prisma migrate resolve`. Ensaya siempre en dev primero.

## 8. Respaldo y restauración

- **Gestionados por Supabase:** respaldos diarios en los planes de pago y PITR como complemento. Restaurar **reemplaza** la base del proyecto: solo en un incidente.
- **Exportación manual**, antes de una migración de riesgo:

  ```bash
  pg_dump "$DIRECT_URL" --schema=public --format=custom --no-owner --file=backups/roxcoach-public-AAAAMMDD.dump
  ```

  `backups/` y `*.dump` están en `.gitignore`. Los respaldos contienen datos personales: guárdalos cifrados y con acceso restringido.
- **Restaurar:** siempre primero en un proyecto temporal, nunca directo en prod. Hazlo sobre un esquema creado con las mismas migraciones y después corre `db:audit`. Las cuentas (`auth`) se restauran con los respaldos gestionados.
- **Ensaya la restauración** antes del lanzamiento.

## 9. Health check, logs y monitoreo

- **`GET /api/health`** responde `200 {"status":"ok"}` con `Cache-Control: no-store`.
  - No requiere sesión, no consulta la base, no pasa por el proxy y no revela versión, ambiente ni secretos. Las e2e y las unitarias lo verifican.
  - Responde 500 si la configuración del runtime es inválida (`instrumentation.ts`).
- **Vercel no tiene un health check propio para funciones.** Úsalo así:
  - **Monitor externo de disponibilidad** (Better Stack, UptimeRobot, Checkly u otro): `GET https://roxcoach.vercel.app/api/health` cada 1–5 min. Alerta si no es 200.
  - **Smoke test** tras cada deployment (§10).
- **Logs:**
  - Vercel → Project → Logs (Runtime Logs), una línea JSON por evento, sin datos sensibles (`lib/log.ts`).
  - Next registra por su cuenta los errores no controlados, con `digest`: trátalos como sensibles.

## 10. Checklist de despliegue piloto (no ejecutado todavía)

1. [ ] Crear y confirmar `roxcoach-prod` en us-west-2 (§5).
2. [ ] Configurar Auth: Site URL y Redirect URLs con `https://roxcoach.vercel.app`, Confirm email y la plantilla (§5, §6.2).
3. [ ] Correo: decidir SMTP integrado (piloto limitado, §6.0) o SMTP propio (§6.1). Envío de prueba a tu buzón.
4. [ ] Configurar las variables **Production** en Vercel (§3), solo valores de prod.
5. [ ] Confirmar en Vercel (Settings → Domains) que la URL de producción es `roxcoach.vercel.app`, y definir `APP_URL` con ella (§11).
6. [ ] Confirmar que las Redirect URLs de prod contienen solo `https://roxcoach.vercel.app/auth/confirm**`.
7. [ ] Revisar la CSP: `connect-src` debe incluir el dominio de `roxcoach-prod`. Se calcula en el build con `NEXT_PUBLIC_SUPABASE_URL`.
8. [ ] Respaldo, luego `db:migrate` y luego `db:audit` contra prod (§7).
9. [ ] Desplegar a **Preview**: push a una rama.
10. [ ] Smoke tests en Preview:
    - `/api/health`;
    - login de coach y atleta de prueba;
    - una navegación por módulo;
    - consola sin errores.
11. [ ] Aprobar Production: merge a `main`, o *Promote to Production*.
12. [ ] `/api/health` → 200 en `https://roxcoach.vercel.app`.
13. [ ] Login con una cuenta real tuya.
14. [ ] Registro con un correo tuyo (autorizado; miembro de la organización si usas el SMTP integrado).
15. [ ] Confirmación de correo desde **otro** dispositivo.
16. [ ] Roles: el coach no entra a `/atleta` y viceversa (307), y un detalle ajeno da 404.
17. [ ] Invitaciones: el enlace empieza con `https://roxcoach.vercel.app`.
18. [ ] Programación: crear una plantilla y programar una sesión.
19. [ ] Ejecución: comenzar, registrar una serie, finalizar y ver el resumen.
20. [ ] Offline: cortar la red durante la ejecución, recargar, restaurar y sincronizar.
21. [ ] PWA: el manifest y los iconos cargan, la app es instalable y `/sw.js` se registra.
22. [ ] Cerrar sesión: se borran los datos locales del atleta.
23. [ ] Revisar los Runtime Logs: sin errores ni datos sensibles.
24. [ ] Documentar el deployment aprobado (id y commit) para un posible rollback (§13).

## 11. URL de producción: `https://roxcoach.vercel.app` (sin dominio propio)

- **No se crean tareas de DNS ni de dominio personalizado en esta fase.**
- **Qué URL usar:** Vercel asigna al proyecto `roxcoach` la URL estable `roxcoach.vercel.app`, que siempre apunta al deployment de Production vigente.
  - Las URLs de cada deployment (`roxcoach-<hash>-<equipo>.vercel.app`) y de cada rama (`roxcoach-git-<rama>-<equipo>.vercel.app`) **no** son la URL de producción. No se usan como `APP_URL` de Production ni como Site URL.
- **HTTPS:** Vercel la sirve siempre con HTTPS. La app envía `Strict-Transport-Security`, sin `preload`; `vercel.app` ya está en la lista de precarga HSTS de los navegadores.
- **Cómo se protege:**
  - Production exige `APP_URL` igual a `VERCEL_PROJECT_PRODUCTION_URL`, que Vercel define. Si no coinciden, el build y el arranque fallan.
  - Preview rechaza `APP_URL` igual a la de producción, porque sus correos e invitaciones irían a prod.
  - El retorno de los correos (`next`) siempre se reduce a una ruta interna; nunca se redirige a otro origen, aunque sea de `vercel.app`.

### 11.1 Si Vercel asigna otro nombre al proyecto

Pasa si `roxcoach.vercel.app` ya está tomado o si renombras el proyecto (p. ej. queda `roxcoach-xyz.vercel.app`).

1. Vercel → Project → Settings → Domains: anota la URL `*.vercel.app` asignada. También puedes editar el subdominio `.vercel.app` si está libre.
2. Production → `APP_URL=https://<nueva>.vercel.app` y un **nuevo deployment**. Mientras no lo cambies, el build falla avisando que `APP_URL` no coincide.
3. Supabase `roxcoach-prod`: Site URL y Redirect URLs con la nueva URL. Quita la anterior.
4. **Enlaces viejos:** los correos de confirmación pendientes y las invitaciones con la URL anterior dejan de servir. Regenera las invitaciones (los coaches tienen "Regenerar enlace").
5. **Service worker y datos locales:** son por origen. Antes del cambio, pide a los atletas que sincronicen lo pendiente. Después tendrán que abrir e instalar la PWA desde la nueva URL.
6. Actualiza esta guía, el monitor de `/api/health` y `docs/security.md` si mencionan la URL.

### 11.2 Dominio propio (fuera de esta fase)

Cuando haya un dominio, se agrega en Settings → Domains con su DNS. Después se sigue el mismo procedimiento del §11.1: `APP_URL`, Supabase, invitaciones y service worker.

## 12. Acciones manuales pendientes (fuera del repositorio)

- [ ] Crear `roxcoach-prod` (us-west-2).
- [ ] Decidir el correo del piloto: SMTP integrado con confirmación manual de externos (§6.0) o SMTP propio (§6.1, opcional).
- [ ] Confirmar que la URL de producción asignada es `roxcoach.vercel.app`; si no, seguir el §11.1.
- [ ] Crear el proyecto en Vercel y conectar el repositorio.
- [ ] Cargar las variables de Preview (dev) y Production (prod).
- [ ] Configurar el monitor externo de `/api/health`.
- [ ] Retirar `TEST_COACH_PASSWORD` y `TEST_ATHLETE_PASSWORD` de `.env.local`: no se usan.

## 13. Rollback

- **App:**
  1. Vercel → Deployments → el último deployment sano → **Instant Rollback**, o *Promote to Production*.
  2. Es inmediato y no reconstruye.
  3. Funciona porque las migraciones son compatibles hacia atrás (§7).
- **Variables:** corrige el valor en el dashboard y haz *Redeploy*, porque los deployments existentes conservan las variables con las que se construyeron.
- **Base de datos:** **no** se revierten migraciones a mano. Corrige con una migración nueva; ante pérdida de datos, restaura desde los respaldos gestionados (§8), solo en un incidente.
- **Service worker:** un rollback de la app sirve el `sw.js` anterior. Si cambió `SW_VERSION`, los clientes vuelven a esa versión en la siguiente visita y la limpieza de cachés por versión se encarga del resto.
