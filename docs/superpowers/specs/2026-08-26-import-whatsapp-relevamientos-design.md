# Carga masiva de relevamientos desde un chat de WhatsApp

**Fecha:** 2026-08-26
**Página afectada:** `relevamientos_operativos.html`

## Contexto

El equipo de campo manda las fotos y direcciones de cada relevamiento por un
grupo de WhatsApp (fotos con una leyenda de dirección debajo, a veces con
pines de ubicación GPS sueltos como referencia del recorrido). Hoy, para que
esos relevamientos queden en el sistema, alguien tiene que abrir cada foto,
copiar la dirección y cargarla a mano una por una en la pestaña "Carga" —con
un chat de ~150 fotos, es un trabajo largo y repetitivo.

La pestaña "Carga" ya resuelve, para el alta individual: geocodificación con
normalización de direcciones (`geocodificarDireccionRel`, USIG con Nominatim
de respaldo, expansión de abreviaturas típicas argentinas), compresión y
subida de fotos a Drive vía Apps Script (`comprimirImagenRel` +
`RELEVAMIENTOS_FOTO_ENDPOINT`), y guardado con auditoría
(`conAuditoriaRel` + `guardarRelevamientoChunked`). Esta funcionalidad nueva
reutiliza ese pipeline tal cual — no reimplementa geocodificación ni subida
de fotos.

## Objetivo

Poder subir la exportación de WhatsApp del chat de relevamiento (.zip, "con
medios incluidos") y, en una sola operación asistida, generar un
relevamiento por cada foto con su dirección geocodificada — sin perder la
posibilidad de revisar y corregir antes de guardar, ya que las leyendas del
chat vienen escritas a mano y son irregulares (algunas fotos no tienen
dirección, algunas mezclan la dirección con un comentario).

## Alcance

- Pestaña "Carga" de `relevamientos_operativos.html`: se agrega un selector
  de sub-vista `📝 Individual` / `📦 Importar desde WhatsApp` arriba del
  formulario existente. "Individual" es el formulario actual, sin cambios.
  "Importar desde WhatsApp" es la funcionalidad nueva de este spec.
- Parseo en el navegador (sin backend propio) del `.txt` de chat de
  WhatsApp contenido en el `.zip`, usando JSZip para leer el archivo.
- Pantalla de revisión editable antes de guardar nada en Firestore.
- Guardado en lote reutilizando el pipeline existente de geocodificación,
  subida de fotos y persistencia — fila por fila, en secuencia.
- Deduplicación entre imports: un nuevo campo `origenArchivo` en el
  documento de relevamiento (el nombre del archivo de imagen de WhatsApp)
  permite detectar, en un import posterior, qué fotos ya se cargaron antes.

## Fuera de alcance

- No se separa automáticamente "dirección" de comentarios sueltos en la
  misma leyenda (ej. "Luna 309 xolectivo abandonado" se manda tal cual al
  geocodificador; es editable a mano en la revisión antes de guardar).
- Zona y Temática son un valor único elegido para toda la tanda importada,
  no por fila. Si una tanda mezcla zonas, se corrige después a mano con
  "✏️ Editar" en los relevamientos que correspondan.
- Los mensajes de "ubicación: https://maps.google.com/?q=lat,lng" (pines de
  GPS del chat) no se usan para nada — ni para geocodificar, ni se
  muestran en la revisión.
- Los mensajes de texto sin foto adjunta (comentarios sueltos del chat) no
  generan relevamientos.
- No se modifica el Apps Script externo de subida de fotos (no vive en
  este repo) — se reutiliza el mismo endpoint y contrato que ya usa la
  carga individual.
- No hay procesamiento en paralelo: el guardado en lote es secuencial,
  igual que `regeocodificarPendientesRel()`, para no saturar USIG/Nominatim
  ni el Apps Script.

## Diseño

### Sub-vista dentro de "Carga"

Se agrega un toggle simple (dos botones tipo pestaña) arriba del panel de
carga existente:

```html
<div class="rlv-viewbtn-row">
  <button class="rlv-viewbtn active" id="rc-view-individual" onclick="cambiarVistaCargaRel('individual')">📝 Individual</button>
  <button class="rlv-viewbtn" id="rc-view-whatsapp" onclick="cambiarVistaCargaRel('whatsapp')">📦 Importar desde WhatsApp</button>
</div>
<div id="rc-panel-individual">...formulario actual, sin cambios...</div>
<div id="rc-panel-whatsapp" style="display:none">...nuevo...</div>
```

`cambiarVistaCargaRel(id)` alterna `display` entre los dos paneles y la
clase `active` de los botones — mismo patrón visual que
`cambiarVistaRel('lista'|'mapa')`, que ya existe para el toggle Lista/Mapa
del dashboard.

### Panel "Importar desde WhatsApp"

Controles:
- `#rcw-zona`, `#rcw-tematica`: selects poblados por la misma función que
  ya llena `#rc-zona`/`#rc-tematica` (`poblarSelectsRel()` se extiende para
  llenar también este segundo par, mismas opciones).
- `#rcw-zip` (`<input type="file" accept=".zip">`).
- Botón "🔍 Analizar chat" (`onclick="analizarChatWhatsappRel()"`).
- Después de analizar: resumen de texto + tabla de revisión (`#rcw-tabla`)
  + botón "💾 Guardar seleccionados (N)" (`onclick="guardarImportWhatsappRel()"`),
  deshabilitado hasta que haya al menos una fila tildada.

Se agrega JSZip por CDN junto al resto de librerías del `<head>`:
```html
<script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
```

### Parseo del .zip → mensajes → filas candidatas

`analizarChatWhatsappRel()`:

1. Carga el `.zip` con `JSZip.loadAsync(file)`.
2. Busca el primer archivo `*.txt` dentro del zip (la exportación del chat)
   y lo lee como texto.
3. Parsea el texto en mensajes con una función `parsearChatWhatsapp(texto)`:
   - Header de mensaje: `/^(\d{1,2}\/\d{1,2}\/\d{4}), (\d{1,2}:\d{2}) - (.*)$/`
     por línea. Cada línea que matchea abre un mensaje nuevo
     `{fecha, lineas:[resto]}`; toda línea que no matchea se agrega como
     una línea más del mensaje abierto (continuación — así se captura la
     leyenda debajo de una foto, que puede ocupar más de una línea).
   - `fecha` (`D/M/AAAA`) se normaliza a `AAAA-MM-DD` para usarla como
     `fecha` del relevamiento.
4. Para cada mensaje, se evalúa si su primera línea es un adjunto de
   imagen con `/([\w\-. ]+\.(?:jpg|jpeg|png|webp))\s*\(archivo adjunto\)/i`.
   - Si no matchea (system messages, "ubicación:", texto suelto, líneas
     vacías): se descarta, no genera fila. No hace falta ningún caso
     especial para "ubicación:" ni para mensajes de sistema — ninguno
     tiene foto adjunta, así que caen todos en esta rama por la regla
     general.
   - Si matchea: fila candidata `{archivo: <nombre extraído>, fecha,
     direccion: <resto de líneas del mensaje, unidas y trimmeadas>}`.
5. Para cada fila candidata, se busca el binario en el zip: se recorre
   `Object.keys(zip.files)` buscando un path cuyo `basename` (case
   insensitive) coincida con `archivo`. Si se encuentra, se guarda una
   referencia al `JSZip.file(...)` (la lectura a blob se hace recién al
   guardar, para no cargar todas las imágenes en memoria de una). Si no se
   encuentra, la fila queda marcada `sinBinario:true`.
6. Deduplicación: se compara cada `archivo` contra
   `window.relevamientos.map(r=>r.origenArchivo)`. Si ya existe, la fila
   se marca `yaImportada:<fecha del relevamiento existente>` y arranca
   destildada.

### Tabla de revisión

Una fila por candidata, en el mismo orden en que aparecen en el chat:

| Campo | Control |
|---|---|
| Incluir | checkbox, tildado por defecto salvo `yaImportada` |
| Miniatura | `<img>` generado con `URL.createObjectURL()` sobre el blob leído del zip (lazy: se resuelve al renderizar, no en el paso 5) |
| Fecha | `<input type="date">`, precargada con la fecha del mensaje |
| Dirección | `<input type="text">`, precargada con la leyenda (vacía si no había) |
| Origen | texto gris chico con el nombre de archivo; si `yaImportada`, nota "ya importada el dd/mm/aaaa"; si `sinBinario`, ⚠️ "no se encontró la foto en el .zip" |

Resumen arriba de la tabla: "`{total}` fotos encontradas · `{yaImportadas}`
ya importadas antes · `{paraGuardar}` para guardar".

### Guardado en lote

`guardarImportWhatsappRel()` valida que haya Zona y Temática elegidas (
mismo requisito que el alta individual) y al menos una fila tildada. Recorre
las filas tildadas **en secuencia** (`for...of` con `await`, no
`Promise.all`):

Por cada fila:
1. Si tiene dirección: `geocodificarDireccionRel(direccion)` (mismo
   pipeline que el alta individual — USIG primero, Nominatim de respaldo
   con expansión de abreviaturas). Si no encuentra nada, sigue sin
   lat/lng (mismo comportamiento que hoy).
2. Si tiene binario: lee el blob del zip (`file.async("blob")`),
   `comprimirImagenRel(blob, 1200, 0.8)` y sube por
   `RELEVAMIENTOS_FOTO_ENDPOINT` — mismo contrato que usa
   `guardarRelevamiento()` hoy (`{token, id, base64, mimeType}` →
   `{ok, fileId}`).
3. Arma el registro:
   ```js
   {
     fecha, zona: zonaTanda, tematica: tematicaTanda,
     direccion, lat, lng, fotoFileId,
     foodTruck:"No", conexionElectrica:"No", patente:"No",
     estado:"Pendiente", observaciones:"",
     origenArchivo: archivo,
   }
   ```
   con `id = archivo + "-" + Date.now()` (incluye el nombre de archivo para
   que el `id` sea legible en Firestore, no sólo un timestamp) y
   `conAuditoriaRel(rel)` para `creadoPor`/`creadoEn`.
4. `guardarRelevamientoChunked(rel, window.relevamientos)` y push a
   `window.relevamientos` — mismo mecanismo que el alta individual.
5. Actualiza el ícono de la fila: ✅ guardado, ⚠️ guardado sin
   geocodificar, ❌ error (con el mensaje, sin cortar el lote — sigue con
   la fila siguiente).
6. Actualiza el texto de progreso ("Guardando 42/131…").

Al terminar: toast resumen ("128 guardados, 3 sin geocodificar, 0
errores"), refresco de `aplicarFiltrosRel()` para que el dashboard refleje
los nuevos relevamientos. Las filas con dirección sin geocodificar quedan
igual que cualquier otro relevamiento sin lat/lng: aparecen automáticamente
en "📌 Ubicaciones pendientes" (Administración) la próxima vez que se abra
esa sección — no se necesita ningún cambio ahí, ya filtra por
`!r.lat || !r.lng`.

### Nuevo campo en el modelo de datos

`origenArchivo` (string, opcional): nombre del archivo de imagen de
WhatsApp que originó el relevamiento. Sólo lo pone el importador; los
relevamientos cargados a mano no lo tienen (queda `undefined`, no rompe
nada existente — es un campo más en el objeto, como `fotoFileId`).

### Cache-busting

Se sube `relevamientos_operativos.html` con los cambios; no depende de
otros archivos versionados con `?v=`, así que no hace falta tocar ningún
otro `<script src>`.
