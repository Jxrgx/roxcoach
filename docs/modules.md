# Módulos

## Estado actual (fase 14)

| Módulo | Estado | Notas |
| --- | --- | --- |
| Sistema visual y componentes base | ✅ | 17 componentes de UI + 6 de dominio, catálogo en `/componentes` |
| Navegación coach / atleta | ✅ | Responsive; "Nueva sesión" como CTA global secundario en todo el panel del coach (lleva a `/coach/sesiones/nueva`) |
| Páginas placeholder del coach | ✅ | Inicio, Calendario, Atletas, Biblioteca, Entrenamientos, Progreso, Mensajes, Configuración |
| Páginas placeholder del atleta | ✅ | Inicio, Agenda, Entrenamiento (sesión), Progreso, Perfil |
| Estados de pantalla | ✅ | Cargando, vacío, error, sin conexión, sin permisos, guardando y guardado |
| Autenticación | ✅ Validada con Supabase (falta probar el envío real de correo) | Supabase Auth (correo y contraseña), sesión en cookies, confirmación de correo obligatoria, cerrar sesión |
| Roles y rutas protegidas | ✅ Validado con Supabase | Coach / atleta; `proxy.ts` + verificación en servidor contra `profiles` |
| Perfiles | ✅ Validado con Supabase | Configuración del coach y Perfil del atleta leen y guardan datos reales; saludos con el nombre real |
| Gestión de atletas e invitaciones | ✅ Validada con Supabase | Lista real con buscador y filtros, invitación por enlace ligada a un correo (copiar, regenerar, cancelar, vence en 7 días), aceptación con registro o login, detalle del atleta, pausar y reactivar, edición deportiva por el coach. Un coach activo por atleta |
| Biblioteca de ejercicios | ✅ Validada con Supabase | 14 ejercicios de RoxCoach (migración) + personalizados del coach. Buscar, filtrar (categoría, dificultad, origen), detalle, crear, editar, duplicar como propio, archivar y restaurar. Instrucciones, indicación clave, equipo, dificultad, medio por URL (https; los videos se abren como enlace externo) y hasta 5 sustituciones ordenadas. Detalle de solo lectura para el atleta (`/atleta/ejercicios/[id]`) |
| Constructor de plantillas | ✅ Validado con Supabase | Plantillas del coach por bloques con ejercicios de la biblioteca: series, objetivo (repeticiones, distancia en m o tiempo), carga en la unidad del coach, descanso y nota. Reordenar con botones, vista previa, borrador/publicada (publicar exige duración y ejercicios en cada bloque), duplicar, archivar y restaurar |
| Programación y asignación | ✅ Validada con Supabase | Programar una plantilla **publicada** en una fecha (hoy a un año) con hora opcional, título y notas, para 1–50 atletas **activos**. La sesión guarda un **snapshot** congelado de la plantilla: editarla después no cambia lo programado. El coach ve la semana en el Calendario (`?semana=`, filtro por estado) y el detalle de la sesión; puede editar fecha, hora, título y notas, cancelar (con confirmación, se conserva el historial), agregar y quitar atletas. El atleta ve sus sesiones en Inicio, Agenda semanal, Entrenamiento y el detalle (bloques en acordeón, enlace a cada ejercicio, equipo necesario). Las canceladas se muestran como tales |
| Ejecución del entrenamiento | ✅ Validada con Supabase | El atleta comienza una sesión asignada de hoy o de días anteriores (no futuras ni canceladas). Ve bloque, ejercicio y "Serie N de M" con lo planeado (solo lectura) y registra lo realizado (reps, distancia o tiempo según el plan, carga en su unidad y RPE opcional). Descanso planeado en cuenta regresiva, pausa y reanudación guardadas en el servidor (recargar continúa donde se quedó), volver a una serie para corregirla, finalizar con confirmación (las faltantes quedan como no realizadas) y resumen con planeado vs. realizado, RPE general y comentario (lo único editable al terminar). Reporte de molestia por zona, intensidad y nota. El coach ve en la sesión quién no la ha iniciado, la tiene en curso o la completó, alertas de molestia y los resultados de cada atleta |
| Progreso y métricas | ✅ Validado con Supabase | Solo datos reales; excluye sesiones canceladas y asignaciones retiradas. **Atleta** (`/atleta/progreso`): adherencia del periodo (7/30/90 días o todo) con desglose (asignadas, iniciadas, completadas, no realizadas, abandonadas, en curso o pendientes), completadas en 7/30/90 días, tiempo entrenado, RPE promedio, marcas personales y evolución por ejercicio (mismo ejercicio y objetivo; estaciones HYROX por id) y molestias. **Coach** (`/coach/progreso`): adherencia del grupo, atletas que requieren atención (baja adherencia < 70 % con ≥ 3 sesiones, molestias), lista por atleta y filtros por periodo, atleta y estado (panel inferior en mobile); detalle por atleta (`/coach/progreso/[id]`) con planeado vs. realizado. Cada métrica indica periodo, sesiones usadas y si los datos son insuficientes |
| Avisos operativos | ✅ Validado con Supabase | Bandeja `/coach/avisos` con avisos de atletas activos del coach, solo de datos reales de los últimos 30 días: molestia (prioritaria, con aviso de que no es un diagnóstico médico), sesión finalizada incompleta, RPE alto (≥ 9), sesión en curso más de 5 h, sesión no iniciada y nuevo atleta. Orden por prioridad y fecha; filtros por estado (sin leer, leídos, todos) y tipo en panel inferior (mobile); marcar uno o todos como leídos con historial. Los avisos de sesión no iniciada se resuelven solos cuando el atleta la comienza, se cancela o se le retira (quedan en el historial). Resumen de los 3 más importantes en Inicio y contador en la navegación (campana en mobile, "Avisos" en la barra lateral). Sin correo, push ni tiempo real |
| Personalización por atleta | ✅ Validada con Supabase | Desde el detalle de la sesión, "Personalizar" abre `/coach/sesiones/[id]/atletas/[athleteId]/personalizar`: por ejercicio (acordeones) se ajustan series, objetivo (mismo tipo que el original), carga en la unidad del coach o "sin carga", descanso y nota; se sustituye por un ejercicio del sistema o propio no archivado (cualquier categoría, primero las sugeridas) o se omite. Resumen de cambios, vista previa de la versión del atleta, "Restaurar original" por ejercicio y "Restaurar todo". Solo antes de que el atleta comience, con relación activa, asignación vigente y sesión programada. El atleta ve y ejecuta su versión ("Adaptado para ti", "Ejercicio omitido"); resultados, progreso y avisos usan el plan personalizado y distinguen omitida de no realizada. La plantilla y el snapshot nunca cambian |
| Ejecución sin conexión | ✅ Validada con Supabase | La ejecución sigue funcionando si se corta la red: cada serie, pausa, reanudación y finalización se guarda primero en el dispositivo (IndexedDB), se ve de inmediato y se envía en orden al volver la conexión (o con "Reintentar"). Estado breve siempre visible: En línea · Sin conexión · Guardado localmente (N pendientes) · Sincronizando · Guardado. Reenviar nunca duplica (operaciones idempotentes). Conflictos (p. ej. la sesión ya había finalizado) y rechazos se explican en un panel y el dato se conserva hasta que el atleta lo descarta. Finalizar sin conexión queda en cola. Descanso y tiempo activo se recalculan desde timestamps tras suspender o recargar. Sin service worker: recargar sin red muestra la página del navegador, pero los datos no se pierden |
| PWA y recarga offline | ✅ Validada | Instalable: manifest completo (standalone, vertical, colores) e iconos PNG 192/512, maskable y apple-touch-icon. Service worker mínimo propio: navegaciones a la red y, solo si fallan, redirección a una página offline estática (el shell de la ejecución con `?sesion=` o `/sin-conexion?desde=`); estáticos con hash, iconos y manifest desde caché. Nunca cachea HTML de `/atleta` o `/coach`, respuestas privadas, Supabase, RSC ni Server Actions. Al recargar una ejecución sin red se restaura desde IndexedDB ("Restaurado desde el dispositivo") con pendientes y conflictos, se puede seguir y finalizar; al volver la red carga la ruta real y sincroniza. Cerrar sesión borra los datos privados del atleta en el dispositivo (avisa si hay registros sin enviar). RPE, molestias y comentario siguen requiriendo conexión y lo indican |
| Preparación para producción | ✅ Validada (falta configurar staging/producción y SMTP real) | Configuración por ambiente validada al arrancar (`APP_URL` obligatoria en producción), enlaces de correo e invitación siempre desde `APP_URL`, confirmación con `token_hash` + `type=email` y retorno seguro, cabeceras de seguridad con CSP aplicada (sin nonce) y HSTS con https, registro seguro sin datos sensibles, health check `/api/health`, privilegios mínimos en la base de datos y auditoría `npm run db:audit`. Guías en `docs/deployment.md` y `docs/security.md`. Sin recuperación de contraseña ni servicio de observabilidad externo |
| Rendimiento y navegación | ✅ Validado | 404 real en cargas directas de detalles inexistentes o ajenos (proxy) y 307 para sesión o rol incorrecto. Navegación instantánea: cada página muestra su estructura (título y acciones) al instante y sus datos llegan por streaming detrás de Suspense, sin errores de Next en desarrollo (`npm run check:instant`). Sesión en una lectura, relaciones de Prisma con JOIN (`relationJoins`), conexiones reutilizadas, sin waterfalls en Inicio, Avisos y Entrenamiento. Ningún dato privado se cachea. Medición reproducible con `npm run measure:nav` |
| Base de datos | 🟡 En crecimiento | Prisma 7 + PostgreSQL: identidad, perfiles, atletas e invitaciones, ejercicios, plantillas, sesiones programadas, asignaciones y registros realizados (sesión, series y molestias). Pendiente (mensajes) en `docs/data-model-draft.prisma` |

### Acciones todavía en vista previa (datos ficticios)

| Acción | Comportamiento actual |
| --- | --- |
| Mensajes | Agregan el mensaje localmente. No se envía. |
| Eliminar cuenta | Pide confirmación y avisa que aún no está disponible. No elimina nada. |
| Nuevo mensaje | Abre un aviso que indica qué hará la acción y en qué módulo llegará. |
| Mensajes | Siguen con datos ficticios de `lib/mock`. El Inicio del coach ya usa solo datos reales (sesiones de hoy, avisos, atletas con sesiones vencidas sin completar y adherencia del equipo de los últimos 30 días). |

## Módulos planeados para el MVP

Orden sugerido según la prioridad de uso:

1. ~~Autenticación y roles~~: completado en la fase 2.
2. ~~Capa inicial de datos y perfiles~~: completado en la fase 2.
2b. ~~Gestión de atletas e invitaciones~~: completado en la fase 3. Queda para después: desvincular (`removed`), envío de la invitación por correo desde la app e historial de invitaciones.
3. ~~Biblioteca de ejercicios~~: completado en la fase 4. Para después: subida de archivos (Storage), categorías propias del coach y enlace del atleta desde sus sesiones.
4. ~~Constructor de entrenamientos~~: completado en la fase 5. Para después: arrastrar y soltar, superseries/rondas por bloque y estimación automática de duración.
5. ~~Programación y asignación~~: completado en la fase 6; la personalización por atleta se completó en la fase 10. Para después: sesiones repetidas y arrastrar en el calendario.
6. ~~Ejecución del atleta~~: completado en la fase 7; resistencia a cortes de conexión en la fase 11. Recargar la ejecución sin red llegó en la fase 12. Para después: sincronización entre varios dispositivos, sustituir ejercicio durante la sesión y video dentro de la ejecución.
7. ~~Resultados y progreso~~: completado en la fase 8. Para después: tiempo y ritmo en series de distancia (requiere capturar el tiempo), conectar el Inicio del coach con datos reales y comparativas por bloque de entrenamiento.
8. **Mensajes.** Conversaciones y comentarios por sesión.

## Excluido del MVP

No se implementa sin solicitud explícita:

- Pagos.
- Nutrición.
- IA generadora de rutinas.
- Wearables.
- Ranking público.
- Marketplace.
- Multi-gimnasio.
- App nativa.
- Integración con resultados oficiales.
