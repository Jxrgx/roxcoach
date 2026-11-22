# RoxCoach — Guía de desarrollo, diseño y UX

## Propósito del archivo

Este archivo contiene las reglas permanentes para desarrollar RoxCoach. Debe leerse antes de modificar o crear cualquier funcionalidad relacionada con la interfaz, la experiencia de usuario o la lógica del producto.

RoxCoach es una plataforma web/PWA en español para coaches y atletas de HYROX. Su objetivo es sustituir pizarrones, documentos de Word y mensajes dispersos por una experiencia clara para planificar, asignar, ejecutar y medir entrenamientos.

El producto tiene dos experiencias principales:

- Panel del coach, utilizado principalmente en desktop y tablet.
- Aplicación del atleta, utilizada principalmente en mobile.

---

## Regla principal

No comenzar a desarrollar una funcionalidad únicamente con base en una interpretación personal.

Antes de modificar archivos:

1. Inspeccionar la estructura existente.
2. Leer la documentación relacionada.
3. Identificar el módulo afectado.
4. Explicar el flujo de usuario que se implementará.
5. Presentar un plan breve de archivos y cambios.
6. Esperar confirmación si el cambio afecta arquitectura, datos, navegación o alcance.

Si el cambio es pequeño y está claramente definido, se puede continuar sin esperar confirmación, pero siempre se debe informar el plan antes de editar.

No inventar módulos, reglas de negocio, pantallas ni campos que no estén definidos en la documentación o en la solicitud actual.

---

## Principios de producto

1. Mobile-first.
2. UX clara antes que cantidad de funcionalidades.
3. Una acción principal por pantalla.
4. El atleta debe poder utilizar la aplicación durante el esfuerzo físico.
5. El coach debe poder programar rápidamente y reutilizar su trabajo.
6. Toda información debe tener una jerarquía visual clara.
7. Mostrar solo la información necesaria para la tarea actual.
8. La información avanzada debe aparecer bajo demanda.
9. Mantener separación entre datos planeados y resultados reales.
10. Preservar el historial y evitar modificaciones destructivas.
11. Preferir componentes reutilizables sobre interfaces aisladas.
12. No añadir complejidad visual o técnica sin una razón de producto.

---

## Mobile-first obligatorio

Toda pantalla nueva debe diseñarse primero para un viewport móvil aproximado de 360–430 px de ancho.

Después debe adaptarse progresivamente a:

- Mobile pequeño: 320–359 px.
- Mobile estándar: 360–430 px.
- Tablet: 768–1023 px.
- Desktop: 1024 px o más.

Reglas mobile-first:

- No utilizar tablas anchas como experiencia principal en mobile.
- Convertir tablas en tarjetas, listas o bloques apilados.
- Mantener botones principales visibles y fáciles de tocar.
- Utilizar áreas táctiles mínimas de 44 × 44 px.
- Evitar acciones críticas escondidas únicamente en iconos.
- Evitar scroll horizontal salvo que sea absolutamente necesario.
- No colocar más de una acción primaria dominante en la misma pantalla.
- El contenido esencial debe aparecer antes de cualquier detalle secundario.
- Los formularios deben dividirse en secciones cortas.
- Los temporizadores y controles de entrenamiento deben poder utilizarse con una mano.

En la experiencia del atleta, priorizar en este orden:

1. Qué entrenamiento toca hoy.
2. Iniciar entrenamiento.
3. Qué ejercicio o serie está activa.
4. Registrar el resultado.
5. Continuar o finalizar.

---

## Dirección visual de RoxCoach

La interfaz debe sentirse:

- Oscura.
- Atlética.
- Moderna.
- Premium.
- Tecnológica.
- Inspirada en rendimiento y moda urbana.
- Intensa, pero no agresiva.
- Profesional para coaches y accesible para atletas.

No crear una interfaz genérica de gimnasio, médica, infantil o excesivamente decorativa.

### Paleta base

- Fondo principal: `#0B0D0F`.
- Superficie: `#15191D`.
- Superficie elevada: `#20262B`.
- Borde sutil: `#2C3338`.
- Texto principal: `#F5F5F0`.
- Texto secundario: `#9BA3A8`.
- Amarillo ácido principal: `#D7F500`.
- Azul secundario: `#4D8DFF`.
- Verde positivo: `#A8E063`.
- Ámbar de advertencia: `#F2B84B`.
- Rojo de error: `#FF6B6B`.

### Uso del color

- Utilizar amarillo ácido para la acción principal, progreso activo y marcas importantes.
- No utilizar amarillo en todos los textos ni en todas las tarjetas.
- Mantener suficiente contraste entre texto y fondo.
- Utilizar color para comunicar estado, no solo para decorar.
- No depender únicamente del color para comunicar errores o estados.

### Tipografía

- Usar una familia sans-serif moderna y legible.
- Utilizar pesos fuertes para títulos, tiempos, cargas y distancias.
- Evitar textos largos en mayúsculas.
- No utilizar tamaños pequeños para información esencial.
- El texto secundario debe seguir siendo legible en pantallas móviles.

### Superficies y componentes

- Usar tarjetas oscuras con bordes sutiles.
- Preferir sombras discretas.
- Usar esquinas redondeadas de forma consistente.
- Evitar exceso de tarjetas anidadas.
- Evitar degradados llamativos salvo que exista una razón visual clara.
- Mantener una escala coherente de espaciado, radios y tamaños.

---

## Jerarquía de información

Cada pantalla debe clasificar el contenido en tres niveles:

### Nivel 1 — Acción o decisión principal

Debe verse inmediatamente.

Ejemplos:

- Comenzar entrenamiento.
- Crear sesión.
- Completar serie.
- Guardar entrenamiento.

### Nivel 2 — Información necesaria

Debe estar visible, pero no competir con la acción principal.

Ejemplos:

- Duración.
- Carga objetivo.
- Distancia.
- Número de series.
- Estado de la sesión.

### Nivel 3 — Información avanzada

Debe ocultarse en acordeones, paneles, modales o pantallas secundarias.

Ejemplos:

- Instrucciones extensas.
- Métricas históricas.
- Sustituciones.
- RPE detallado.
- Comentarios técnicos.

No mostrar todas las métricas disponibles solo porque existen en la base de datos.

---

## Reglas específicas de UX del atleta

El atleta puede estar cansado, sudado, distraído o usando el celular con una sola mano.

Durante una sesión activa:

- Mostrar el bloque actual.
- Mostrar la serie actual.
- Mostrar el temporizador si corresponde.
- Mostrar carga, distancia o repeticiones esenciales.
- Mostrar una sola acción primaria.
- Mantener accesibles pausa y finalización.
- Ocultar métricas avanzadas durante el esfuerzo.

No mostrar permanentemente durante la ejecución:

- Gráficas.
- Rankings.
- Muchas estadísticas.
- Historial completo.
- Explicaciones largas.
- Todos los bloques futuros con mucho detalle.

Las opciones secundarias deben estar disponibles mediante menú o panel inferior:

- Ver video.
- Ver instrucciones.
- Sustituir ejercicio.
- Reportar molestia.
- Agregar comentario.

Después de completar una serie, solicitar solo los datos necesarios para continuar:

- Carga real.
- Repeticiones o distancia real.
- Tiempo, si corresponde.
- RPE opcional.

---

## Reglas específicas de UX del coach

El coach debe poder:

- Ver qué sesiones tiene hoy.
- Crear una rutina sin demasiados pasos.
- Reutilizar plantillas.
- Asignar a varios atletas.
- Personalizar a un atleta sin afectar a los demás.
- Identificar rápidamente quién completó o no completó una sesión.

El panel del coach puede contener más información que el del atleta, pero debe mantener una jerarquía clara.

No convertir cada pantalla del coach en un dashboard lleno de gráficas.

---

## Componentes reutilizables obligatorios

Antes de crear un componente visual nuevo, verificar si ya existe uno reutilizable.

Crear y reutilizar componentes para:

- Button.
- IconButton.
- Input.
- Select.
- Textarea.
- Modal.
- Drawer o BottomSheet.
- Card.
- Badge.
- Tabs.
- ProgressBar.
- EmptyState.
- LoadingState.
- ErrorState.
- Toast.
- ConfirmDialog.
- WorkoutCard.
- AthleteCard.
- ExerciseCard.
- SessionStatus.
- Timer.
- SetLogger.

No duplicar estilos con pequeñas variaciones sin documentar la razón.

---

## Estados obligatorios de las pantallas

Toda pantalla que consuma datos debe considerar:

- Cargando.
- Vacía.
- Con datos.
- Error.
- Sin conexión.
- Sin permisos.
- Guardando.
- Guardado exitosamente.

No dejar pantallas en blanco sin explicación.

Ejemplos de estados vacíos:

- “Todavía no tienes atletas registrados.”
- “No hay sesiones programadas para este día.”
- “Aún no tienes ejercicios personalizados.”

---

## Accesibilidad

Aplicar como mínimo:

- Contraste suficiente.
- Navegación por teclado en desktop.
- Estados de foco visibles.
- Labels asociados a inputs.
- Texto alternativo en imágenes.
- Botones con nombres accesibles.
- No depender únicamente de iconos.
- No depender únicamente del color.
- Mensajes de error claros.
- Confirmaciones para acciones destructivas.
- Soporte razonable para lectores de pantalla.

---

## Formularios y validación

- Validar en cliente para dar feedback rápido.
- Validar nuevamente en servidor.
- Mostrar errores junto al campo correspondiente.
- No borrar los datos ingresados cuando exista un error.
- Deshabilitar el botón mientras se guarda.
- Evitar formularios largos en una sola pantalla.
- Usar valores y unidades coherentes con la configuración del coach.

---

## Arquitectura y mantenimiento

- Mantener separación entre UI, lógica de negocio y acceso a datos.
- Utilizar TypeScript estricto.
- Evitar `any` salvo que exista una justificación documentada.
- No colocar consultas de base de datos directamente dentro de componentes visuales.
- Centralizar validaciones y permisos.
- Centralizar tokens visuales.
- Mantener componentes pequeños y enfocados.
- Preferir funciones puras y fáciles de probar.
- No duplicar reglas de negocio entre coach y atleta.

La separación conceptual del dominio es obligatoria:

```text
Ejercicio
  → Plantilla
  → Sesión programada
  → Asignación al atleta
  → Registro realizado
```

Nunca sobrescribir datos planeados con datos reales.

---

## Flujo obligatorio antes de implementar un módulo

Antes de editar código para un módulo:

1. Identificar objetivo del módulo.
2. Identificar rol o roles involucrados.
3. Enumerar pantallas afectadas.
4. Enumerar acciones del usuario.
5. Definir estados de la interfaz.
6. Definir reglas de negocio.
7. Revisar dependencias con otros módulos.
8. Definir criterios de aceptación.
9. Proponer archivos a crear o modificar.
10. Implementar.
11. Ejecutar validaciones.
12. Revisar el resultado en mobile y desktop.

Si una decisión afecta el alcance, la arquitectura, la base de datos o el sistema visual, detenerse y solicitar confirmación antes de continuar.

---

## Validación visual obligatoria

Después de implementar una pantalla:

1. Revisarla en mobile de 360 px.
2. Revisarla en mobile de 390 px.
3. Revisarla en tablet.
4. Revisarla en desktop.
5. Confirmar que no exista scroll horizontal accidental.
6. Confirmar que la acción principal sea evidente.
7. Confirmar que los textos no se corten.
8. Confirmar que los modales y bottom sheets sean utilizables.
9. Confirmar que los estados de carga, vacío y error existan.
10. Confirmar que los botones sean táctiles y accesibles.

No declarar terminada una pantalla solo porque compila.

---

## Validaciones técnicas obligatorias

Al finalizar cada tarea:

1. Ejecutar lint.
2. Ejecutar typecheck.
3. Ejecutar pruebas disponibles.
4. Ejecutar build de producción cuando corresponda.
5. Revisar errores de consola.
6. Revisar cambios de archivos.
7. Verificar que no se hayan roto rutas existentes.
8. Informar cualquier pendiente o decisión no resuelta.

No ocultar errores modificando configuraciones para que las pruebas pasen.

---

## Restricciones del MVP

No implementar sin solicitud explícita:

- Pagos.
- Nutrición.
- IA generadora de rutinas.
- Wearables.
- Ranking público.
- Marketplace.
- Multi-gimnasio.
- App nativa.
- Integración con resultados oficiales.

---

## Formato obligatorio del reporte de Claude

Al terminar una tarea, responder con:

1. Resumen de lo implementado.
2. Módulo afectado.
3. Archivos creados.
4. Archivos modificados.
5. Decisiones de UX tomadas.
6. Decisiones técnicas tomadas.
7. Validaciones ejecutadas.
8. Resultado de lint.
9. Resultado de typecheck.
10. Resultado de pruebas.
11. Resultado de build.
12. Revisión responsive realizada.
13. Problemas encontrados.
14. Pendientes.
15. Próximo paso sugerido.

No indicar que una tarea está terminada si no se ejecutaron las validaciones correspondientes.

