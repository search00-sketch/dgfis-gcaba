# Mobile: lista compacta para Nómina, Distribución y Novedades/Historial

**Fecha:** 2026-09-01
**Páginas afectadas:** `gestion_personal.html`, `novedades_personal.html`
**Depende de:** `docs/superpowers/specs/2026-09-01-mobile-base-compartida-design.md` (ya implementado — clases `.mob-list-item`/`.mob-avatar`/`.mob-main`/`.mob-nombre`/`.mob-sub` en `estilo-comun.css`)

## Contexto

Segundo sub-proyecto de la adaptación a mobile del portal (el primero fue la
base compartida: header, menú ☰, y las clases CSS de la lista compacta —
ver spec/plan referenciados arriba). Este sub-proyecto es el primero en
usar esas clases sobre tablas reales.

Un relevamiento de las tablas de `gestion_personal.html` y
`novedades_personal.html` encontró que no todas son iguales: algunas son de
solo lectura con una única acción ("Ver"), otras tienen fila editable con
un `<select>` (Asignación de Zonas, Carga diaria de Novedades), y una es
una matriz de comparación con columnas dinámicas (Ranking). Este spec cubre
únicamente las de solo lectura / una acción principal — las otras dos
categorías quedan para sub-proyectos futuros con su propio diseño.

## Objetivo

Que las tablas de Nómina (ambas páginas), Distribución (gestión) y
Novedades/Historial (ambas páginas) se vean como listas compactas por
debajo de 768px, usando las clases ya definidas en la base compartida, con
sus acciones (Ver / Editar / Exportar / Eliminar / Agregar novedad)
accesibles desde esa lista.

## Alcance

- `gestion_personal.html`: tabla Nómina (`renderNomina()`), tabla
  Distribución del día (`renderDist()`), tabla Novedades/historial
  (`renderNovedades()`).
- `novedades_personal.html`: tabla Nómina (`renderNomina()`), tabla
  Historial (`renderHistorial()`).
- Un nuevo patrón compartido de "menú ⋮" para las acciones secundarias de
  una fila (reutiliza `.overlay`/`.modal`, sin componente nuevo).

## Fuera de alcance

- `asignacion_zonas.html` (tabla de Distribución, con `<select>` de zona
  editable en cada fila) — patrón distinto, sub-proyecto aparte.
- `novedades_personal.html`: panel "Carga diaria" (`<select>`/input de
  estado editable en cada fila) y tabla "Ranking" (columnas dinámicas, una
  por tipo de novedad — no es un listado, es una matriz de comparación;
  probablemente conserve scroll horizontal en vez de lista) — ambos quedan
  para sub-proyectos futuros.
- No se cambia el modal "👁 Ver" en sí (sigue siendo de solo lectura, mismo
  contenido) ni ningún modal de edición existente — sólo cómo se llega a
  ellos desde la lista.
- No se toca el desktop (>768px): las tablas actuales siguen exactamente
  igual arriba de ese ancho.

## Diseño

### Mapeo de columnas a la lista compacta

| Tabla | Avatar/leading | Nombre | Subtítulo | Badge | Tap principal | Menú ⋮ |
|---|---|---|---|---|---|---|
| Nómina (gestión) | Iniciales | Nombre | Rol · Turno | Estado | Ver | Exportar |
| Nómina (novedades) | Iniciales | Nombre | Rol · Turno | Estado | Ver | Editar, Agregar novedad |
| Distribución (gestión) | Iniciales | Nombre | Turno · Zona (o "Sin asignar") | — | Ver | — |
| Novedades/Historial (gestión) | Fecha (día/mes) | Persona | Detalle | Tipo | — (sin modal) | — |
| Historial (novedades) | Fecha (día/mes) | Persona | Detalle / observación | Tipo | — (sin modal) | Editar, Eliminar |

Notas:
- "Iniciales" = primera letra de nombre + primera de apellido, mismo
  criterio en toda la base compartida.
- Las dos filas de Novedades/Historial usan un bloque de fecha compacto
  (día + mes abreviado, ej. "12 AGO") en vez de iniciales — son listas
  cronológicas, la fecha es el dato más útil para ubicarse rápido, más que
  quién es la persona.
- Cuando una tabla no tiene acción principal de tap (Novedades/Historial de
  gestión, que hoy no tiene ninguna acción), la fila no es clickeable —
  sólo muestra información.

### Menú ⋮ (acciones secundarias)

Nuevo patrón compartido, para filas con más de una acción o sin "Ver":

```html
<button class="mob-kebab" onclick="event.stopPropagation(); abrirMenuFila('ID_O_CONTEXTO')">⋮</button>
```

- 44×44px (hereda la regla táctil de la base compartida vía `.abtn`/`.btn`,
  o clase propia con el mismo mínimo).
- `event.stopPropagation()` para que tocar el ⋮ no dispare también el tap
  de la fila (que abre "Ver").
- Abre un panel simple (reutiliza `.overlay`+`.modal`, ya existente) con un
  botón por acción disponible para esa fila — no es un dropdown/context
  menu nativo, es el mismo patrón visual que cualquier otro modal chico del
  sitio.
- Cada página define su propia `abrirMenuFila()` (o nombre equivalente),
  ya que las acciones disponibles difieren por tabla — no hay lógica
  compartida más allá del componente visual del panel.

### Badges

Reutilizan las funciones ya existentes: `badgeEstado()` para Nómina/
Distribución, `badgeNov()` para Novedades/Historial — sin cambios, sólo se
usan también dentro de `.mob-list-item`.

## Testing

No hay suite de tests automatizados en este repo. Verificación manual con
DevTools en modo responsive (~375px):
- Cada tabla en alcance muestra la lista compacta en vez de la tabla de
  escritorio, con los datos correctos por fila.
- Tocar una fila con "Ver" abre el modal correspondiente con los datos de
  esa persona (no de otra — cuidado con acciones que dependan del índice
  de fila en vez del id).
- El ⋮ abre el panel de acciones sin disparar también el tap de la fila, y
  cada acción del panel hace lo mismo que su botón equivalente en
  escritorio.
- Por encima de 768px, cero cambios visuales respecto a hoy.
