# Confirmación al guardar novedad + edición de licencias con estado

**Fecha:** 2026-07-14
**Página afectada:** `novedades_personal.html` (con soporte de `personal-dominio.js` para badges/constantes)

## Contexto

Hoy, en el módulo "Novedades de Personal", el modal "Cargar novedad" persiste
apenas se hace clic en "Guardar novedad", sin paso de revisión. Además, una
vez cargada una novedad sólo se puede borrar (✕) — no hay forma de editarla.
Esto es un problema puntual para las Licencias, donde con el tiempo hace
falta poder marcar si fueron aprobadas o si están a la espera de más
información (no hay ningún concepto de "estado de la licencia" en el modelo
de datos actual).

## Objetivo

1. Agregar un paso de confirmación (resumen + Validar/Volver) antes de
   persistir cualquier novedad cargada o editada.
2. Permitir editar novedades ya cargadas (cualquier tipo), y agregar un
   campo de estado específico para Licencias: Pendiente / Aprobada / A la
   espera de más información / Rechazada.

## Alcance

- Sólo `novedades_personal.html` (modal de novedad, listas donde se
  muestran/editan novedades) y las funciones de dominio compartidas en
  `personal-dominio.js` (nueva constante de badges de estado de licencia).
- No cambia la capa de persistencia (`personal-datos.js`): el guardado por
  `id` ya hace upsert in-place en el chunk de Firestore, así que editar
  reutiliza `window._guardarNovedad` tal cual.
- No se toca `gestion_personal.html` ni `asignacion_zonas.html`.

## Diseño

### 1. Paso de confirmación al guardar

- El modal "Cargar novedad" separa visualmente dos vistas dentro del mismo
  modal: la vista de **formulario** (persona, tipo, fechas, estado si es
  licencia, detalle) y una vista de **revisión** (resumen de sólo lectura).
- Flujo:
  1. Usuario completa el formulario y hace clic en "Guardar novedad".
  2. Se valida igual que hoy (persona, tipo, fechas de licencia si aplica).
  3. Si valida, se arma el objeto novedad en memoria (sin persistir) y se
     muestra el resumen: Persona, Tipo (badge), Fecha (o rango si es
     licencia), Estado (badge, sólo si es licencia), Detalle.
  4. El usuario puede hacer clic en **"✅ Validar y guardar"** (recién ahí
     se persiste vía `window._guardarNovedad`) o en **"← Volver"** (oculta
     el resumen, vuelve al formulario con los datos intactos, sin guardar
     nada).
- Aplica a todos los tipos de novedad, no sólo Licencia.
- Aplica igual en modo edición (ver más abajo): el resumen muestra los
  datos actualizados antes de confirmarlos.

### 2. Edición de novedades + estado de licencia

- **Nuevo campo de datos:** `estadoLic` en el objeto novedad, sólo presente
  quando el tipo es "Licencia" (u otro tipo cuyo nombre incluya
  "licencia", igual que el resto del código ya hace con
  `tipo.toLowerCase().includes('licencia')`). Valores posibles: `"Pendiente"`
  (default al crear), `"Aprobada"`, `"A la espera de más información"`,
  `"Rechazada"`.
- **Modal:** cuando el tipo seleccionado es Licencia, además del rango de
  fechas ya existente, se muestra un selector "Estado de la licencia" con
  esas 4 opciones (default Pendiente al crear una nueva).
- **Botón editar (✏️):** se agrega junto al botón de borrar (✕) en:
  - Panel "Novedades del día" → lista de novedades activas.
  - Panel "Historial" → tabla de historial.
  - Abre el mismo modal, con el título "Editar novedad", precargado con los
    datos existentes. La persona queda fija (no editable, igual que cuando
    se abre el modal desde el botón "+ nov" de una fila de Nómina). El resto
    de los campos (tipo, fecha/rango, estado si es licencia, detalle) son
    editables y pasan por el mismo paso de confirmación antes de guardar.
  - Al confirmar, se actualiza el registro existente (mismo `id`/`_chunk`)
    en vez de crear uno nuevo — no se duplica.
- **Visibilidad del estado (badges de color, reutilizando el sistema de
  clases `.badge`/`.bdg-*` ya existente):**
  - *Novedades activas del día:* badge de estado junto al badge de tipo.
  - *Historial:* badge de estado junto al tipo/detalle, más un filtro por
    estado en la barra de herramientas del historial (select con Todos /
    Pendiente / Aprobada / A la espera de más información / Rechazada).
  - *Ficha "Ver persona":* el listado de "Novedades recientes" también
    muestra el badge de estado junto a cada licencia.
- Las licencias ya cargadas antes de este cambio no tienen `estadoLic`; se
  tratan como `"Pendiente"` por defecto en la visualización (sin necesidad
  de migrar datos existentes).

## Fuera de alcance

- No se agrega un historial de cambios de estado (quién lo cambió y
  cuándo) — sólo el estado actual.
- No se notifica a nadie cuando cambia el estado (sin emails/alertas).
- No se restringe qué roles pueden cambiar el estado más allá del control
  de edición ya existente (`puedeEditar()`).
