# Búsqueda por nombre: coincidencia de palabras en cualquier orden

**Fecha:** 2026-07-15
**Páginas afectadas:** `novedades_personal.html`, `gestion_personal.html`, `asignacion_zonas.html`, `buscador_permisos.html` (con soporte de `utils.js`, compartido por las 6 páginas del portal)

## Contexto

Hoy, todos los buscadores por nombre del portal usan una comparación de
substring simple (`.includes(query)` / `.indexOf(query)`), que exige que lo
tipeado aparezca tal cual, en el mismo orden, como secuencia contigua dentro
del nombre guardado. Para una persona cargada como "PEREZ JUAN CARLOS",
buscar "PEREZ CARLOS" (salteando el nombre del medio) no encuentra ningún
resultado, porque "perez carlos" no es una substring contigua de
"perez juan carlos".

## Objetivo

Que buscar por nombre encuentre a la persona aunque:
- se salteen palabras del medio (ej: "PEREZ CARLOS" encuentra "PEREZ JUAN CARLOS"), y
- las palabras estén en otro orden (ej: "CARLOS PEREZ" también la encuentra).

Alcanza con que **todas** las palabras tipeadas estén presentes en el nombre,
sin importar el orden ni si hay otras palabras en el medio.

## Alcance

- Los campos de búsqueda por **nombre** en:
  - `novedades_personal.html`: Novedades del día, Carga diaria, Historial,
    Nómina, y el autocompletado de persona del modal "Cargar novedad".
  - `gestion_personal.html`: Distribución/Carga diaria, Novedades, Nómina.
  - `asignacion_zonas.html`: Distribución.
  - `buscador_permisos.html`: el campo "Nombre" del buscador (`qN`).
- **No** cambia la búsqueda por DNI, expediente, locación/barrio ni ningún
  otro campo no-nombre: esos siguen siendo substring exacto, tiene sentido
  para números y códigos donde el orden importa.
- No cambia el criterio de normalización (mayúsculas/acentos) que ya tenía
  cada página — sólo el algoritmo de comparación una vez normalizado el
  texto. `buscador_permisos.html` ya normaliza sacando acentos (su función
  `norm()`); el resto de las páginas sólo pasa a minúsculas, sin tocar eso.

## Diseño

### Función compartida

Se agrega a `utils.js` (ya cargado por las 6 páginas del portal, con
`esc()`/`escJsAttr()`):

```js
// ¿"texto" contiene TODAS las palabras de "query" (separadas por espacios),
// en cualquier orden? Ambos deben venir ya normalizados de la misma forma
// (minúsculas, con o sin acentos según la página) antes de llamarla.
function coincideTexto(texto, query) {
  const q = (query||'').trim();
  if (!q) return true;
  const t = texto||'';
  return q.split(/\s+/).every(tok => t.includes(tok));
}
```

Cada call site sigue normalizando exactamente como ya lo hacía (con
`.toLowerCase()`, o con el `norm()` propio de `buscador_permisos.html` que
además saca acentos) y le pasa el resultado a `coincideTexto()` en lugar de
usar `.includes()`/`.indexOf()` directamente.

### Reemplazos

En cada uno de los ~9 lugares que hoy comparan `nombre.toLowerCase().includes(busq)`
(o el equivalente con `norm()` en `buscador_permisos.html`), se cambia esa
comparación puntual por `coincideTexto(nombreNormalizado, busqNormalizado)`.
Donde la condición combina nombre y DNI con `||` (ej.
`p.nombre.includes(busq)||p.dni.includes(busq)`), sólo se cambia el lado del
nombre; el lado del DNI queda igual.

### Resaltado en Buscador de Permisos

`buscador_permisos.html` resalta (`<mark>`) las coincidencias en la tabla de
resultados con la función `hl(text, qs)`, que ya recibe un array de términos
de búsqueda (uno por campo: nombre, DNI, locación, expediente) y resalta
cada uno por separado con una regex. Como ahora una fila puede aparecer sin
que el nombre completo tipeado sea una substring contigua, se agrega cada
palabra del campo nombre como una entrada más del array `qs` (además del
término completo), para que cada palabra encontrada se resalte
individualmente aunque no sean contiguas.

### Cache-busting

Se sube `utils.js?v=1` → `?v=2` en las 6 páginas que lo cargan
(`index.html`, `novedades_personal.html`, `gestion_personal.html`,
`asignacion_zonas.html`, `buscador_permisos.html`, `estadisticas_actas.html`),
igual que se hizo con `personal-dominio.js` en el trabajo anterior, para que
el cambio se vea sin esperar el `Cache-Control: max-age=3600` configurado en
`firebase.json`.

## Fuera de alcance

- No se toca la búsqueda de `estadisticas_actas.html` (busca por campos de
  actas/precintos, no por nombre de persona).
- No se agrega tolerancia a errores de tipeo (fuzzy matching) — sigue siendo
  substring exacto por palabra, sólo cambia que ya no hace falta que las
  palabras estén contiguas ni en orden.
- No se cambia el criterio de normalización de acentos entre páginas (ver
  "Alcance" arriba).
