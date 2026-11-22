# Módulos

## Estado actual (fase 8)

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
| PWA | 🟡 Preparada | Manifest e icono; sin service worker |
| Base de datos | 🟡 En crecimiento | Prisma 7 + PostgreSQL: identidad, perfiles, atletas e invitaciones, ejercicios, plantillas, sesiones programadas, asignaciones y registros realizados (sesión, series y molestias). Pendiente (mensajes) en `docs/data-model-draft.prisma` |

### Acciones todavía en vista previa (datos ficticios)

| Acción | Comportamiento actual |
| --- | --- |
| Mensajes | Agregan el mensaje localmente. No se envía. |
| Eliminar cuenta | Pide confirmación y avisa que aún no está disponible. No elimina nada. |
| Nuevo mensaje | Abre un aviso que indica qué hará la acción y en qué módulo llegará. |
| Mensajes e indicadores de Inicio del coach (atletas recientes, comentarios, adherencia) | Siguen con datos ficticios de `lib/mock`. |

## Módulos planeados para el MVP

Orden sugerido según la prioridad de uso:

1. ~~Autenticación y roles~~: completado en la fase 2.
2. ~~Capa inicial de datos y perfiles~~: completado en la fase 2.
2b. ~~Gestión de atletas e invitaciones~~: completado en la fase 3. Queda para después: desvincular (`removed`), envío de la invitación por correo desde la app e historial de invitaciones.
3. ~~Biblioteca de ejercicios~~: completado en la fase 4. Para después: subida de archivos (Storage), categorías propias del coach y enlace del atleta desde sus sesiones.
4. ~~Constructor de entrenamientos~~: completado en la fase 5. Para después: arrastrar y soltar, superseries/rondas por bloque y estimación automática de duración.
5. ~~Programación y asignación~~: completado en la fase 6. Para después: personalizar la sesión de un atleta sin afectar a los demás (overrides por asignación), sesiones repetidas y arrastrar en el calendario.
6. ~~Ejecución del atleta~~: completado en la fase 7. Para después: modo sin conexión con cola de envío, avisos al coach, sustituir ejercicio durante la sesión y video dentro de la ejecución.
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
