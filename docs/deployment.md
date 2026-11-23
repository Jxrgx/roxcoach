# Despliegue

Guía independiente del proveedor (cualquier plataforma que ejecute Node.js: un PaaS, un contenedor o un servidor propio). No contiene valores reales: los secretos se configuran en el proveedor y en el dashboard de Supabase, nunca en el repositorio.

## 1. Ambientes

| Ambiente | Para qué | Supabase | Dominio (ejemplo) |
| --- | --- | --- | --- |
| Desarrollo | `npm run dev`, pruebas unitarias y e2e | Proyecto **de desarrollo** (el actual) | `http://localhost:3000` |
| Staging | Ensayo de cada despliegue con datos de prueba | Proyecto **propio** de staging | `https://staging.tu-dominio.com` |
| Producción | Coaches y atletas reales | Proyecto **propio** de producción | `https://app.tu-dominio.com` |

Reglas:

- Cada ambiente tiene su propio proyecto de Supabase, base de datos y llaves. Nunca compartas `DATABASE_URL`, llaves ni usuarios entre ambientes.
- Las pruebas e2e (crean y borran usuarios) solo corren contra **desarrollo**. Nunca configures `SUPABASE_SECRET_KEY` ni `E2E_*` en staging o producción.
- Toda migración pasa primero por staging.

## 2. Requisitos

- Node.js **22 LTS** recomendado (mínimo 20.9, el `engines` de `package.json`; desarrollo probado con Node 24).
- npm (el repositorio usa `package-lock.json`).
- HTTPS en staging y producción (lo da el proveedor o un proxy inverso).

## 3. Variables por ambiente

El catálogo vive en `lib/config/env-rules.ts` (`ENV_VARS`) y la plantilla en `.env.example`. En producción, `instrumentation.ts` valida la configuración al arrancar: si falta algo, el servidor responde 500 en todas las rutas, incluido el health check, y el log indica **qué variable** falta (nunca su valor).

| Variable | Tipo | Desarrollo | Staging / Producción | ¿Al compilar? |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Proyecto dev | Proyecto del ambiente | **Sí** (se incrusta en el JS y en la CSP) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública (RLS) | Proyecto dev | Proyecto del ambiente | **Sí** |
| `DATABASE_URL` | Secreto de servidor | Pooler 6543 | Pooler 6543 del ambiente | No |
| `APP_URL` | Servidor | `http://localhost:3000` (opcional) | **Obligatoria**, `https://…`, sin ruta | **Sí** (HSTS y CSP) y en runtime |
| `ALLOWED_ORIGINS` | Servidor | Opcional (túneles) | Opcional (dominio alterno) | No |
| `ROXCOACH_CATALOG` | Servidor | `1` si quieres `/componentes` | **Vacía** (la validación la rechaza) | No |
| `DIRECT_URL` | Secreto de migraciones | Sesión 5432 | Solo donde corras `db:migrate`/`db:audit` | No |
| `SUPABASE_SECRET_KEY`, `E2E_*` | Secretos de pruebas | Sí | **Nunca** | No |

Notas:

- Solo las variables `NEXT_PUBLIC_*` llegan al navegador. La validación rechaza nombres que parecen secretos con ese prefijo, y `tests/unit/security.test.ts` comprueba que ningún componente de cliente lee variables de servidor.
- `APP_URL` es la única fuente de los enlaces absolutos (correo de confirmación e invitaciones): las cabeceras `Host`/`Origin` de la petición nunca deciden a dónde apunta un enlace.
- `DIRECT_URL` no la necesita el runtime: dala solo al paso de migraciones.
- El SMTP **no** es una variable de la app (ver §5).

## 4. Supabase (por cada proyecto de staging y producción)

Hazlo en el dashboard del proyecto de **ese** ambiente.

### 4.1 URL Configuration (Authentication → URL Configuration)

- **Site URL:** el valor de `APP_URL` (p. ej. `https://app.tu-dominio.com`).
- **Redirect URLs:** `https://app.tu-dominio.com/auth/confirm**`. El comodín permite el `?next=` con el que un registro desde una invitación vuelve a ella. No agregues dominios ajenos ni `**` sueltos.
- En desarrollo: `http://localhost:3000` y `http://localhost:3000/auth/confirm**`.

### 4.2 Proveedor de correo (Authentication → Sign In / Providers → Email)

- **Confirm email: activado.** Sin confirmación, cualquiera podría registrarse con un correo ajeno.
- Contraseña mínima: 8 caracteres (coincide con la validación de la app). Recomendado: activar la protección de contraseñas filtradas si el plan lo permite.

### 4.3 Plantilla "Confirm signup" (Authentication → Emails → Templates)

La plantilla por defecto (`{{ .ConfirmationURL }}`) usa el flujo PKCE, que **solo funciona si el enlace se abre en el mismo navegador** donde se hizo el registro. Con `token_hash` funciona en cualquier dispositivo (por ejemplo, registrarse en la computadora y confirmar desde el celular). Cambia el enlace del cuerpo por:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
```

Ejemplo de cuerpo (HTML):

```html
<h2>Confirma tu correo</h2>
<p>Hola, gracias por registrarte en RoxCoach.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirmar mi correo</a></p>
<p>Si no creaste esta cuenta, ignora este mensaje.</p>
```

Asunto sugerido: `Confirma tu correo en RoxCoach`.

Cómo se procesa el retorno (`app/auth/confirm/route.ts`):

- `{{ .RedirectTo }}` es la URL que la app pasó como `emailRedirectTo` (`<APP_URL>/auth/confirm?next=<ruta>`). La ruta la reduce a una **ruta interna** (`confirmNextPath`): acepta una ruta o una URL de un origen permitido (`APP_URL`, `ALLOWED_ORIGINS` o el propio), desenvuelve el `/auth/confirm?next=` anidado y descarta cualquier otro origen.
- Después `safeNextPath` valida que el rol pueda ver esa ruta. Si no, lleva al inicio del rol.
- Solo se aceptan `type=email` y `type=signup`. Cualquier otro tipo o un token inválido o usado lleva a `/login?error=confirmacion`.
- El flujo PKCE (`?code=`) sigue funcionando, para que los correos enviados antes del cambio de plantilla no se rompan.

**Prueba manual** (con un correo tuyo real, después de configurar el SMTP): regístrate en staging, abre el enlace en **otro** dispositivo y confirma que entras al inicio de tu rol. Repite desde un enlace de invitación y confirma que vuelves a la invitación.

### 4.4 Otros ajustes

- **Rate limits** (Authentication → Rate Limits): revisa el límite de correos por hora. Con SMTP propio lo puedes subir según tu proveedor.
- **Security Advisor / Performance Advisor** del dashboard: revísalos tras cada migración.
- **Backups:** ver §8.

## 5. SMTP (correo transaccional)

Supabase Auth envía el correo de confirmación. Su SMTP integrado es solo para pruebas: unos pocos correos por hora y solo a miembros de la organización. Producción **requiere SMTP propio**.

### 5.1 Datos que necesitas del proveedor

Cualquier proveedor transaccional sirve (Amazon SES, Postmark, Resend, SendGrid, Mailgun u otro).

| Dato | Ejemplo (no real) | Dónde va |
| --- | --- | --- |
| Host | `smtp.proveedor.com` | Supabase → Authentication → Emails → SMTP Settings |
| Puerto | `587` (STARTTLS) o `465` (TLS) | Ídem |
| Usuario | El que indique el proveedor (a veces `apikey`) | Ídem |
| Contraseña / API key | La crea el proveedor | **Solo** en el dashboard de Supabase |
| Remitente | `no-reply@tu-dominio.com` | Ídem ("Sender email") |
| Nombre del remitente | `RoxCoach` | Ídem ("Sender name") |
| Intervalo mínimo entre correos al mismo usuario | `60` s (por defecto) | Ídem |

La contraseña SMTP nunca va en `.env`, en el repositorio ni en el código: la app no envía correos.

### 5.2 Dominio y DNS

Usa un subdominio de envío si el proveedor lo permite (p. ej. `mail.tu-dominio.com`), para aislar la reputación del dominio principal.

| Registro | Tipo | Valor típico | Para qué |
| --- | --- | --- | --- |
| SPF | TXT en el dominio de envío | `v=spf1 include:<dominio-del-proveedor> ~all` | Autoriza al proveedor a enviar por ti. **Un solo** registro SPF por dominio: si ya existe, agrega el `include:` al existente. |
| DKIM | CNAME o TXT (`<selector>._domainkey`) | El que entregue el proveedor | Firma criptográfica de cada correo |
| DMARC | TXT en `_dmarc.tu-dominio.com` | Empieza con `v=DMARC1; p=none; rua=mailto:dmarc@tu-dominio.com` | Política ante correos que fallan SPF/DKIM y reportes |
| Return-Path / MAIL FROM | CNAME o MX | El que indique el proveedor | Alinea SPF con el dominio |

Pasos:

1. Agrega el dominio en el proveedor y crea los registros que te indique.
2. Espera la verificación (minutos a horas, según la propagación DNS).
3. Configura el SMTP en Supabase (staging primero).
4. Envía un registro de prueba a un buzón tuyo. Revisa que llegue a la bandeja de entrada (no a spam) y que las cabeceras muestren `spf=pass`, `dkim=pass` y `dmarc=pass`.
5. Tras 2–4 semanas sin problemas en los reportes DMARC, endurece a `p=quarantine` y después a `p=reject`.

### 5.3 Límites

- **Proveedor:** su cuota diaria o mensual y su ritmo de envío. Pide un aumento antes de abrir el registro a muchos usuarios.
- **Supabase:** el rate limit de correos por hora (§4.4) y el intervalo mínimo por usuario.
- **Rebotes y quejas:** revisa el panel del proveedor. Muchos rebotes dañan la reputación del dominio.

## 6. Migraciones

Herramientas:

- `npm run db:status`: estado de las migraciones (`prisma migrate status`).
- `npm run db:migrate`: aplica las pendientes (`prisma migrate deploy`).
- `npm run db:audit`: auditoría de **solo lectura**. Revisa:
  - RLS en todas las tablas;
  - privilegios de `anon`/`authenticated`;
  - funciones expuestas;
  - `search_path` de las funciones `SECURITY DEFINER`;
  - triggers de `auth.users`;
  - migraciones pendientes, fallidas o alteradas.

  Sale con código 1 si encuentra un problema y no imprime cadenas de conexión ni datos.

Las tres usan `DIRECT_URL` (conexión de sesión, puerto 5432).

Reglas:

- **Solo `prisma migrate deploy`.** Nunca uses `prisma migrate dev`, `prisma migrate reset` ni `prisma db push` en staging o producción: `reset` **borra la base de datos**, y `migrate dev` necesita una base sombra que no tiene el esquema `auth` de Supabase.
- **Nunca edites una migración ya aplicada** (`db:audit` detecta cambios por checksum). Corrige con una migración nueva.
- **Migraciones compatibles hacia atrás:** el código anterior debe seguir funcionando con el esquema nuevo mientras se despliega. Para quitar una columna, primero despliega código que ya no la use y después, en otra entrega, la migración que la elimina.
- **Respalda antes de migrar** producción (§8).

Flujo por entrega:

1. **Desarrollo:** crea la migración (ver `docs/development-workflow.md`) y aplícala con `npm run db:migrate`. Después corre `npm run db:audit` y las e2e.
2. **Staging:**
   1. Respalda.
   2. Corre `db:status` y luego `db:migrate`.
   3. Corre `db:audit` (debe salir limpio).
   4. Despliega la app y haz la verificación de §10.
3. **Producción:** los mismos pasos que en staging, en el orden de §9.

Si una migración falla a medias: `db:status` la mostrará como fallida. No la marques como aplicada ni la reviertas a mano sin entender qué quedó aplicado. Revisa el SQL, corrige con una migración nueva y, si hace falta, usa `prisma migrate resolve` siguiendo la documentación de Prisma. Ensáyalo siempre en staging.

## 7. Build, arranque y health check

```bash
npm ci                 # instala exactamente el lockfile; postinstall genera el cliente de Prisma
npm run build          # requiere NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y APP_URL
npm start              # next start; puerto con PORT=3000 o `npm start -- -p 3000`
```

- **Health check:** `GET /api/health` responde `200 {"status":"ok"}` sin caché. No consulta la base de datos, no pasa por el proxy y no revela versión ni configuración. Úsalo como *liveness probe*. Responde 500 si la configuración es inválida (§3).
- **Proxy inverso:** si hay uno delante (Nginx, un balanceador), debe conservar `Host` o enviar `X-Forwarded-Host` y `X-Forwarded-Proto` coherentes con el dominio público. Next rechaza Server Actions cuyo `Origin` no coincida con el host ("Invalid Server Actions request").
- **Un solo proceso o varios:** la app no guarda estado en memoria entre peticiones (sesión en cookies, datos en Postgres), así que escala horizontalmente. El pooler de Supabase (6543) limita las conexiones.
- **Logs:** salida estándar en JSON de una línea por evento (`lib/log.ts`). Ver `docs/security.md` → Registro.

## 8. Respaldo y restauración

**Respaldos gestionados por Supabase** (recomendado para producción):

- Supabase hace respaldos diarios en los planes de pago. La restauración a un punto en el tiempo (PITR) es un complemento.
- Confirma en el dashboard (Database → Backups) que estén activos, cuántos días se conservan y que alguien del equipo sabe restaurarlos.
- Restaurar un respaldo **reemplaza** la base de datos del proyecto. Úsalo solo en un incidente, después de exportar lo que haga falta conservar.

**Exportación manual** (antes de una migración de riesgo, o para guardar una copia propia):

```bash
# Con DIRECT_URL del ambiente cargada en tu terminal (no la escribas en la línea de comandos compartida)
pg_dump "$DIRECT_URL" --schema=public --format=custom --no-owner --file=backups/roxcoach-public-AAAAMMDD.dump
```

- `backups/`, `*.dump` y `*.sql.gz` están en `.gitignore`. Los respaldos contienen **datos personales** (nombres, correos, molestias). Guárdalos cifrados, fuera del repositorio y con acceso restringido, y bórralos cuando ya no sirvan.
- El esquema `auth` (cuentas) lo gestiona Supabase. Para una copia completa del proyecto usa los respaldos gestionados o la CLI de Supabase (`supabase db dump`), no un volcado parcial.

**Restaurar una exportación** (siempre en un proyecto de **staging** o temporal, nunca directo en producción):

```bash
pg_restore --dbname "$DIRECT_URL_STAGING" --schema=public --no-owner --data-only backups/roxcoach-public-AAAAMMDD.dump
```

- Restaura datos sobre un esquema creado con las mismas migraciones (`npm run db:migrate` en el proyecto destino), y después corre `npm run db:audit`.
- Las filas de `public` referencian usuarios de `auth.users`: en un proyecto sin esas cuentas, las FKs fallarán. Para restaurar cuentas usa los respaldos gestionados.
- **Ensaya la restauración** al menos una vez antes de lanzar y después de forma periódica. Un respaldo que nunca se probó no es un respaldo.

## 9. Orden seguro de despliegue

1. `main` en verde localmente: lint, typecheck, `npm test`, `npm run build` y `npm run test:e2e`. Revisa `git status` (sin archivos `.env*` ni respaldos).
2. Variables del ambiente configuradas en el proveedor (§3), con `APP_URL` en https.
3. Supabase del ambiente configurado: URL, confirmación de correo, plantilla y SMTP (§4 y §5).
4. Respaldo de la base del ambiente (§8).
5. `npm run db:status`, después `npm run db:migrate` y después `npm run db:audit` (debe salir limpio).
6. Build y despliegue de la app.
7. `GET /api/health` → 200.
8. Verificación posterior (§10).
9. Si algo falla: vuelve a la versión anterior de la app en el proveedor. Las migraciones son compatibles hacia atrás (§6), así que el código anterior funciona con el esquema nuevo. No reviertas migraciones a mano.

## 10. Verificación posterior al despliegue

- [ ] `/api/health` responde 200.
- [ ] `/login` carga. En las cabeceras de respuesta aparecen `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`.
- [ ] La consola del navegador no muestra violaciones de CSP en login, Inicio del coach e Inicio del atleta.
- [ ] Registro con un correo real tuyo: llega el correo y el enlace funciona desde otro dispositivo.
- [ ] Una invitación nueva muestra un enlace con el dominio de `APP_URL`.
- [ ] Iniciar y cerrar sesión con coach y con atleta. Cada rol solo ve su área.
- [ ] PWA: el manifest carga, la app es instalable y `/sw.js` se registra. Sin red, una ejecución abierta antes se restaura.
- [ ] `npm run db:audit` sale limpio.
- [ ] Los logs del proveedor no muestran errores de arranque ni datos personales.

## 11. Dominio y HTTPS

1. Crea el registro DNS que indique el proveedor de hosting (CNAME o A/AAAA) para `app.tu-dominio.com`.
2. Activa el certificado TLS (normalmente automático) y la redirección de HTTP a HTTPS en el proveedor.
3. `APP_URL=https://app.tu-dominio.com` en el build y en el runtime. Con https, la app envía `Strict-Transport-Security` (2 años, `includeSubDomains`, **sin** `preload`). Antes de activarlo confirma que **todos** los subdominios sirven HTTPS. Agregar `preload` es una decisión prácticamente irreversible y le corresponde al dueño del dominio.
4. Actualiza la Site URL y las Redirect URLs de Supabase (§4.1).
5. Si cambias de dominio después, el service worker del dominio anterior no se transfiere: los atletas deben abrir la app en el dominio nuevo. Los datos sin enviar de su cola local quedan en el dominio anterior, así que avisa antes del cambio para que sincronicen.
