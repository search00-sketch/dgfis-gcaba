# Carga masiva de WhatsApp: campos por fila y eliminar fila — Design Spec

## Contexto

`relevamientos_operativos.html` ya tiene una sub-vista "Importar desde WhatsApp"
dentro de la pestaña Carga (ver
`docs/superpowers/specs/2026-08-26-import-whatsapp-relevamientos-design.md` y
`docs/superpowers/plans/2026-08-26-import-whatsapp-relevamientos.md` para el
diseño e implementación original). Hoy la tabla de revisión permite editar
`fecha` y `direccion` por fila, pero Zona y Temática se eligen una sola vez
para toda la tanda (selectores `rcw-zona`/`rcw-tematica`), y Foodtruck,
Conexión eléctrica, Patente y Estado quedan fijos en `"No"`/`"No"`/`"No"`/
`"Pendiente"` para todas las filas, sin poder editarlos. Tampoco hay forma de
sacar una fila de la tabla por completo antes de guardar — sólo destildarla
(sigue ocupando lugar en pantalla y en la lógica de resumen).

En uso real esto resultó insuficiente: no todas las fotos de una tanda son de
la misma Zona/Temática, y a veces conviene marcar Foodtruck/Conexión/Patente/
Estado desde la revisión en vez de editar cada relevamiento después de
guardado. También apareció la necesidad de descartar una fila candidata que
no corresponde (ej. una foto que no es de un relevamiento) sin dejarla
destildada en la tabla.

## Alcance

1. **Eliminar fila**: un botón 🗑 por fila en la tabla de revisión que la saca
   por completo de la lista de candidatos, antes de guardar. No toca
   Firestore, no pide confirmación (acción local, reversible re-analizando el
   mismo .zip).
2. **Campos por fila**: Zona, Temática, Foodtruck, Conexión eléctrica,
   Patente y Estado pasan a ser editables por fila, con un valor default para
   toda la tanda que se copia a cada fila al analizar el chat.

Fuera de alcance: parsear estos valores desde el texto del chat (se
consideró y se descartó — la leyenda de WhatsApp no tiene esa información de
forma reconocible; ver decisión tomada durante el brainstorming). Fuera de
alcance también: eliminar un relevamiento ya guardado desde una pantalla de
edición individual — eso ya existe (`eliminarRelevamiento()` desde el
Dashboard) y no es parte de este cambio.

## Datos y estado

`_wImportFilasRel` (array de filas candidatas, definido en Task 3 de la
implementación original) gana 6 campos nuevos por fila:

```js
{
  // ...campos existentes (archivo, fecha, direccion, zipEntry, sinBinario,
  // yaImportada, incluir, estadoGuardado)...
  zona: string,               // default: valor de #rcw-zona al analizar
  tematica: string,           // default: valor de #rcw-tematica al analizar
  foodTruck: "No"|"Si",       // default: valor de #rcw-foodtruck al analizar
  conexionElectrica: "No"|"Si"|"Precaria", // default: #rcw-conexion
  patente: "No"|"Si",         // default: #rcw-patente
  estado: "Pendiente"|"Realizado"|"Intimado", // default: #rcw-estado
}
```

`analizarChatWhatsappRel()` lee los 6 selectores de tanda una sola vez al
construir `_wImportFilasRel` (mismo momento en que hoy ya lee `zona`/
`tematica` para el chequeo previo) y los copia a cada fila nueva. Filas ya
existentes (de un análisis previo) no se tocan por cambiar los selectores de
tanda después — el default sólo aplica al momento de analizar.

## UI

Cuatro `<select>` nuevos junto a los que ya existen (`rcw-zona`,
`rcw-tematica`) en el panel de import, mismas opciones fijas que el
formulario individual (`rc-foodtruck`, `rc-conexion`, `rc-patente`,
`rc-estado`): `rcw-foodtruck`, `rcw-conexion`, `rcw-patente`, `rcw-estado`.

Cada fila de la tabla (`.rcw-row`) pasa de una línea a dos:

- **Línea 1** (igual que hoy + botón nuevo): checkbox, miniatura, fecha,
  dirección, info de origen/ya-importada, y un botón 🗑 al final que llama a
  `_wImportEliminarFilaRel(idx)`.
- **Línea 2** (nueva): tira compacta de 6 `<select>` chicos — Zona y
  Temática con las opciones dinámicas de `window.relZonas`/
  `window.relTematicas` (mismo patrón que `poblarSelectsRel()`), Foodtruck/
  Conexión/Patente/Estado con las opciones fijas del formulario individual.
  Cada uno con `onchange="_wImportSetCampoRel(idx,'zona',this.value)"` (ya
  existe ese helper genérico, se reusa tal cual para los 6 campos nuevos).

`_wImportEliminarFilaRel(idx)` hace `_wImportFilasRel.splice(idx,1)` y llama
a `renderTablaImportWhatsappRel()` + `actualizarResumenImportRel()` — se
re-renderiza toda la tabla porque los índices de las filas siguientes
cambian al eliminar una del medio (mismo motivo por el que ya se
re-renderiza entera en cada análisis nuevo).

## Guardado

Hoy `guardarImportWhatsappRel()` lee `zona`/`tematica` una sola vez de los
selectores de tanda antes del loop, valida que no estén vacíos, y usa
`"No"/"No"/"No"/"Pendiente"` fijos para el resto de los campos en el objeto
`rel` que arma cada fila.

Pasa a:

- Ya no lee ni valida `zona`/`tematica` de los selectores de tanda antes del
  loop (ese chequeo se mantiene sólo como gate de `analizarChatWhatsappRel`,
  para que ninguna fila arranque con default vacío).
- Dentro del loop, por cada fila: si `f.zona` o `f.tematica` están vacíos
  (el usuario los borró a mano eligiendo la opción en blanco del `<select>`
  de esa fila), se marca esa fila como error (`estadoGuardado="error"`,
  mismo mecanismo que ya usan los errores de geocodificación/foto) con un
  mensaje claro ("Falta zona o temática en esta fila.") y se sigue con la
  siguiente fila — no se frena la tanda completa por una fila mal cargada.
- El objeto `rel` arma `zona`, `tematica`, `foodTruck`, `conexionElectrica`,
  `patente`, `estado` desde los campos de la fila (`f.zona`, etc.) en vez de
  la variable de tanda / los valores fijos.

Foodtruck/Conexión/Patente/Estado nunca necesitan esta validación porque sus
`<select>` no tienen opción en blanco (igual que en el formulario
individual) — siempre traen un valor válido.

Esto no modifica el candado anti-duplicados (`_wImportGuardandoRel`,
agregado en el commit `16366db`) — son cambios independientes en la misma
función, sin superposición.

## Testing

Sin suite automatizada en este repo (igual que el resto del módulo).
Verificación manual: analizar un .zip de prueba, confirmar que cada fila
arranca con los 6 valores default de la tanda, editar algunos por fila,
eliminar una fila con 🗑 y confirmar que desaparece y el resumen/índices se
actualizan bien, vaciar Zona en una fila y guardar para confirmar que esa
fila sola queda en ❌ sin frenar las demás, y guardar el resto para
confirmar que cada relevamiento queda en Firestore con los valores por fila
correctos (no los defaults de tanda si se editaron).
