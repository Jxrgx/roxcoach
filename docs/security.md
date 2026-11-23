# Seguridad

Controles vigentes, decisiones y pendientes. Despliegue y operación: [deployment.md](deployment.md).

## Modelo

- **Roles:** coach y atleta. El rol vive en `app_metadata.role` y solo lo escriben los triggers de registro (`set_role_claim` y `handle_new_user`, ambos `SECURITY DEFINER` con `search_path` vacío). `user_metadata` no altera el rol.
- **Acceso a datos:**
  - La app lee y escribe con Prisma desde el servidor (rol propietario). Toda consulta filtra por el coach o el atleta de la sesión (`requireCoach` / `requireAthlete` + DAL en `lib/db`).
  - La API pública de Supabase (publishable key) no tiene acceso a las tablas: RLS está activo en todas las tablas, solo hay 3 políticas de lectura propia en los perfiles, y los roles `anon`/`authenticated` no tienen privilegios de tabla.
- **Separación de dominio:** lo planeado nunca se sobrescribe con lo real (snapshot congelado, registros aparte, ajustes por atleta en otra tabla). Los triggers lo refuerzan en la base de datos.

## Controles

### Autenticación y redirecciones

- **Sesión y rol:** la sesión vive en cookies `@supabase/ssr`. `proxy.ts` refresca la sesión y redirige por rol. La verificación definitiva ocurre en el servidor contra `profiles`.
- **Confirmación de correo obligatoria** (configuración de Supabase). El enlace usa `token_hash` + `type=email` (ver deployment.md §4.3).
- **Destinos de retorno** (`lib/permissions`):
  - `isSafeInternalPath` solo acepta rutas internas y rechaza:
    - `//host`;
    - `\`;
    - URLs absolutas;
    - **caracteres de control y espacios**. El parser de URL elimina tabuladores y saltos de línea, así que `/\t/evil.example` se convertiría en `//evil.example`. Se corrigió en la fase 13.
  - `safeNextPath` normaliza `..` y valida el área del rol.
  - `confirmNextPath` reduce el `next` del correo a una ruta interna y descarta otros orígenes.
- **Enlaces absolutos sin inyección de Host:**
  - `publicOrigin()` (`lib/http/origin.ts`) usa `APP_URL`, que es obligatoria en producción.
  - Sin `APP_URL` en desarrollo, solo acepta orígenes locales o los de `ALLOWED_ORIGINS`.
  - Next además rechaza Server Actions cuyo `Origin` no coincide con el host (CSRF).
- **Recursos ajenos:** en carga directa, el proxy responde **404 real** si el detalle no existe o es de otro usuario (`lib/db/visibility.ts`, con las mismas reglas que las páginas en `lib/db/access-rules.ts`). El mensaje es el mismo para inexistente y ajeno, y no revela si existe. La página sigue verificando.
- **Cerrar sesión** usa `scope: "local"` y borra los datos privados del atleta en el dispositivo (IndexedDB). Antes avisa si hay registros sin enviar.

### Base de datos

- **RLS** activo en las 19 tablas de `public`.
- **Mínimo privilegio** (migración `20261129100000_harden_privileges`):
  - `anon`/`authenticated` sin `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `MAINTAIN`. `TRUNCATE` ignora RLS.
  - Los privilegios por defecto ya no los otorgan a tablas nuevas.
  - Las funciones de `public` no son ejecutables por `PUBLIC`/`anon`/`authenticated`. Son funciones de trigger: un trigger no necesita `EXECUTE` del rol que dispara la escritura.
  - **Al crear una función nueva** en una migración, agrega `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated;` en esa misma migración. `db:audit` lo detecta si falta.
- **Cascadas revisadas:**
  - Borrar un coach o un atleta elimina en cascada sus datos.
  - Avisos y ajustes usan `SET NULL` donde deben conservar historial.
  - Los triggers permiten las actualizaciones referenciales y los borrados en cascada.
- **`npm run db:audit`:** verifica todo lo anterior y las migraciones (pendientes, fallidas o alteradas). Es de solo lectura.

### Cabeceras HTTP (`lib/security/headers.ts`, aplicadas en `next.config.ts`)

| Cabecera | Valor | Nota |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https:`; `connect-src 'self'` + Supabase (https/wss); `worker-src`/`manifest-src 'self'`; `frame-src`/`frame-ancestors`/`object-src 'none'`; `base-uri`/`form-action 'self'`; `upgrade-insecure-requests` con https | Aplicada (no Report-Only). En `next dev` se agrega `'unsafe-eval'`. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Solo si `APP_URL` es https y en producción. Sin `preload`. |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Las imágenes externas de ejercicios además usan `no-referrer`. |
| `X-Frame-Options` | `DENY` | Respaldo de `frame-ancestors`. |
| `Cross-Origin-Opener-Policy` | `same-origin` | |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | La app no usa esas APIs. |

**Por qué la CSP no usa nonce:**

- Un nonce obliga a renderizar cada página por petición. Eso rompe:
  - las páginas offline estáticas que precachea el service worker;
  - el prerender parcial de Cache Components.
- Por eso `script-src` incluye `'unsafe-inline'`, que Next necesita para sus scripts en línea.

**Qué mitiga entonces la CSP:**

- La carga de scripts de otros orígenes.
- El embebido en iframes (clickjacking).
- `object`/`embed`.
- El cambio de `base`.
- El envío de formularios a otros sitios.
- La conexión a orígenes que no sean la app o Supabase.

La defensa principal contra XSS sigue siendo React (escapa todo el texto) y que no se use `dangerouslySetInnerHTML`.

`/sw.js` y `/sw-rules.js` se sirven con `Cache-Control: no-cache` para que una versión nueva llegue pronto.

### XSS y URLs de terceros

- No hay `dangerouslySetInnerHTML` ni HTML generado por usuarios.
- Las URLs de medios de ejercicios se validan como `https` (`lib/exercises/rules`):
  - las imágenes se muestran sin optimizador y con `referrerPolicy="no-referrer"`;
  - los videos nunca se incrustan: se abren en otra pestaña con `rel="noopener noreferrer"`.

### Errores y registro (`lib/log.ts`)

- **Al usuario:** mensajes genéricos en español, sin stack, SQL, rutas ni identificadores internos. Las páginas de error (`RouteError`) no muestran el error. Las e2e lo verifican (`security.spec.ts`).
- **Niveles:** `logError` (la operación falló), `logWarn` (algo se degradó, p. ej. el indicador de avisos) y `logInfo` (eventos operativos, nunca datos de usuario).
- **En producción**, una línea JSON por evento: `{level, ctx, name, code, digest, msg}`.
  - **Prisma:** solo nombre y código, porque su mensaje incluye los valores de la consulta (notas, molestias, resultados).
  - **Otros errores:** solo la primera línea, recortada a 160 caracteres y saneada. `redact` elimina:
    - correos;
    - JWT;
    - llaves `sb_*`;
    - cadenas de conexión con credenciales;
    - tokens largos.
  - Nunca se registran los argumentos de las acciones ni el stack.
- **En desarrollo** se muestra el error completo.
- **Next.js** registra por su cuenta los errores no controlados en el servidor (con `digest`). Esos logs no llegan al navegador. Trátalos como datos sensibles en el proveedor: acceso restringido y retención limitada.

### Secretos

- `.env*` (salvo `.env.example`), llaves, credenciales, sesiones de prueba, reportes, logs, volcados y respaldos están en `.gitignore`.
- Clasificación en `lib/config/env-rules.ts`. Pruebas:
  - ningún componente de cliente lee variables de servidor;
  - `.env.example` documenta exactamente el catálogo y solo contiene marcadores;
  - las e2e comparan el HTML, los chunks de JS y el service worker con los valores reales de los secretos de prueba **sin imprimirlos**.
- `SUPABASE_SECRET_KEY` solo la usan las e2e. Nunca la configures en staging o producción.

### PWA y datos en el dispositivo

- El service worker **nunca** cachea:
  - HTML con sesión;
  - respuestas con `Set-Cookie` o `private`/`no-store`;
  - Server Actions;
  - RSC;
  - otros orígenes.
- Las páginas offline son estáticas y no llevan datos.
- IndexedDB guarda la cola de la ejecución y una copia de la sesión abierta. Pertenece al **último usuario** del dispositivo: cambiar de usuario borra las copias del anterior, y cerrar sesión lo borra todo. **Riesgo aceptado:** si la sesión caduca sin cerrarla, los datos se conservan en ese dispositivo para no perder registros.

## Observabilidad (recomendación, no implementada)

No se integró ningún servicio externo: requiere tu autorización, porque enviaría datos fuera de la app. Opciones cuando se decida:

- Los logs del proveedor de hosting, que ya reciben el JSON de `lib/log.ts`.
- Un servicio de errores (Sentry, Better Stack u otro) conectado en `lib/log.ts` (`write`) y en `RouteError`. En ese caso:
  - configura el *scrubbing* de datos personales;
  - desactiva *session replay*;
  - no envíes cuerpos de petición.
- Alertas sobre `/api/health` desde un monitor de disponibilidad externo.

## Pendientes conocidos

- **Recuperación de contraseña:** fuera de alcance de la fase 13. Hoy un usuario que la olvida depende del soporte (reset desde el dashboard de Supabase). Requiere su propia plantilla y su propia ruta.
- **Rate limiting de Server Actions:** Supabase limita el login y el registro. Las acciones de escritura no tienen límite propio. Si hace falta, se puede aplicar en el proveedor (WAF) o con un almacén compartido.
- **MFA para coaches:** recomendable cuando haya coaches con muchos atletas.
- **CSP con nonce:** solo si se abandona el prerender de las páginas offline.
- **`npm audit`:** revísalo antes de cada despliegue. La actualización de dependencias es manual.
