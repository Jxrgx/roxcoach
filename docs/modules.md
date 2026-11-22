# Módulos

## Estado actual (fase 6)

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
| PWA | 🟡 Preparada | Manifest e icono; sin service worker |
| Base de datos | 🟡 En crecimiento | Prisma 7 + PostgreSQL: identidad, perfiles, atletas e invitaciones, ejercicios, plantillas, sesiones programadas y asignaciones. Pendiente (registro realizado, mensajes) en `docs/data-model-draft.prisma` |

### Acciones todavía en vista previa (datos ficticios)

| Acción | Comportamiento actual |
| --- | --- |
| Mensajes | Agregan el mensaje localmente. No se envía. |
| Eliminar cuenta | Pide confirmación y avisa que aún no está disponible. No elimina nada. |
| Nuevo mensaje, Comenzar (atleta) | Abren un aviso que indica qué hará la acción y en qué módulo llegará. Comenzar llegará con la ejecución del atleta. |
| Progreso, Mensajes e indicadores de Inicio del coach (atletas recientes, comentarios) | Siguen con datos ficticios de `lib/mock`. |

## Módulos planeados para el MVP

Orden sugerido según la prioridad de uso:

1. ~~Autenticación y roles~~: completado en la fase 2.
2. ~~Capa inicial de datos y perfiles~~: completado en la fase 2.
2b. ~~Gestión de atletas e invitaciones~~: completado en la fase 3. Queda para después: desvincular (`removed`), envío de la invitación por correo desde la app e historial de invitaciones.
3. ~~Biblioteca de ejercicios~~: completado en la fase 4. Para después: subida de archivos (Storage), categorías propias del coach y enlace del atleta desde sus sesiones.
4. ~~Constructor de entrenamientos~~: completado en la fase 5. Para después: arrastrar y soltar, superseries/rondas por bloque y estimación automática de duración.
5. ~~Programación y asignación~~: completado en la fase 6. Para después: personalizar la sesión de un atleta sin afectar a los demás (overrides por asignación), sesiones repetidas y arrastrar en el calendario.
6. **Ejecución del atleta.** Bloque y serie activa, Timer, SetLogger, pausa y finalización con una mano.
7. **Resultados y progreso.** Registro realizado, adherencia, marcas personales y evolución por estación.
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
