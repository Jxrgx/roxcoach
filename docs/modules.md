# Módulos

## Estado actual (fase 2)

| Módulo | Estado | Notas |
| --- | --- | --- |
| Sistema visual y componentes base | ✅ | 17 componentes de UI + 6 de dominio, catálogo en `/componentes` |
| Navegación coach / atleta | ✅ | Responsive; "Nueva sesión" como CTA global secundario en todo el panel del coach |
| Páginas placeholder del coach | ✅ | Inicio, Calendario, Atletas, Biblioteca, Entrenamientos, Progreso, Mensajes, Configuración |
| Páginas placeholder del atleta | ✅ | Inicio, Agenda, Entrenamiento (sesión), Progreso, Perfil |
| Estados de pantalla | ✅ | Cargando, vacío, error, sin conexión, sin permisos, guardando y guardado |
| Autenticación | ✅ Validada con Supabase (falta probar el envío real de correo) | Supabase Auth (correo y contraseña), sesión en cookies, confirmación de correo obligatoria, cerrar sesión |
| Roles y rutas protegidas | ✅ Validado con Supabase | Coach / atleta; `proxy.ts` + verificación en servidor contra `profiles` |
| Perfiles | ✅ Validado con Supabase | Configuración del coach y Perfil del atleta leen y guardan datos reales; saludos con el nombre real |
| PWA | 🟡 Preparada | Manifest e icono; sin service worker |
| Base de datos | 🟡 Inicial | Prisma 7 + PostgreSQL: solo identidad y perfiles. Resto del modelo en `docs/data-model-draft.prisma` |

### Acciones todavía en vista previa (datos ficticios)

| Acción | Comportamiento actual |
| --- | --- |
| Nueva sesión | Formulario corto con validación; simula el guardado y muestra un toast. No persiste. |
| Mensajes | Agregan el mensaje localmente. No se envía. |
| Eliminar cuenta | Pide confirmación y avisa que aún no está disponible. No elimina nada. |
| Agregar atleta, Nuevo ejercicio, Crear entrenamiento, Nuevo mensaje, Comenzar (atleta) | Abren un aviso que indica qué hará la acción y en qué módulo llegará. |

## Módulos planeados para el MVP

Orden sugerido según la prioridad de uso:

1. ~~Autenticación y roles~~: completado en la fase 2.
2. ~~Capa inicial de datos y perfiles~~: completado en la fase 2.
2b. **Gestión de atletas e invitaciones.** Vincular atletas a su coach (hoy no existe la relación).
3. **Biblioteca de ejercicios.** Alta y edición de ejercicios con video.
4. **Constructor de entrenamientos.** Plantillas por bloques.
5. **Programación y asignación.** Calendario, asignar a varios atletas y personalizar a uno sin afectar a los demás.
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
