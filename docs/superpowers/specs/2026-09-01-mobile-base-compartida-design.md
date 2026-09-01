# Base compartida para adaptar el portal a mobile

**Fecha:** 2026-09-01
**Archivos afectados:** `estilo-comun.css`, `personal-nav.js`, `utils.js` (posible helper nuevo compartido)

## Contexto

El portal (7 páginas) está pensado para escritorio: tablas densas de varias
columnas, headers con varios controles en una sola fila, barras de filtro
con múltiples desplegables en línea. El pedido es adaptarlo a celular. Es un
trabajo grande — potencialmente las 7 páginas por igual — así que se
decompuso en sub-proyectos: primero una base compartida de patrones (este
spec), después cada página (o grupo de páginas parecidas) aplicando esos
patrones a sus tablas y controles específicos, y al final un botón de
"instalar como app" (PWA).

Este spec cubre **sólo la base compartida**: los patrones y el CSS/JS
genérico que después va a heredar cada página. No aplica todavía ningún
patrón a ninguna tabla real.

## Objetivo

Que exista, en `estilo-comun.css` (y los pocos scripts compartidos que ya
cargan las 6 páginas con login), un conjunto de clases y comportamientos
reutilizables para: header compacto, menú de navegación con las acciones de
sesión adentro, panel de filtros colapsable, y el patrón de lista compacta
con tap-to-modal — de forma que aplicar esto a una página concreta (los
sub-proyectos siguientes) sea mayormente "usar estas clases", no diseñar de
cero cada vez.

## Alcance

- Media query en `estilo-comun.css` para `max-width: 768px` con los
  patrones descritos abajo.
- Extender `personal-nav.js` (`renderNavMenu()`) para agregar, sólo en
  mobile y sólo si hay sesión activa, las opciones "🔑 Cambiar contraseña"
  y "Cerrar sesión" al final del menú desplegable — mismo menú que ya
  existe, no uno nuevo.
- Clases CSS reutilizables para: header de 2 filas (título+☰ / controles de
  página), botón "⚙️ Filtros" + panel colapsable (mismo patrón visual que
  los modales existentes: overlay + panel), y el componente de lista
  compacta (avatar/inicial, nombre, subtítulo de 1-2 datos, badge de estado
  a la derecha).
- Tamaño mínimo de 44×44px para botones/íconos clickeables en mobile, y
  `font-size: 16px` mínimo en inputs de texto (evita el zoom automático de
  iOS al enfocar un campo).

## Fuera de alcance

- Aplicar estos patrones a ninguna tabla, filtro o header de una página
  específica — eso es el sub-proyecto siguiente, página por página.
- Mapas (Leaflet) y gráficos (Chart.js / mapa de calor) — se resuelven
  cuando se trabaje la página específica que los usa (Buscador de Permisos,
  Estadísticas, Relevamientos Operativos).
- El botón de instalar como app (manifest.json, service worker, ícono) —
  sub-proyecto aparte, al final, una vez que el sitio ya se vea bien en
  mobile.
- No se cambia nada del comportamiento en escritorio (todo lo nuevo vive
  detrás de la media query de 768px).

## Diseño

### Breakpoint

Un solo corte: `@media (max-width: 768px)`. Por encima de ese ancho, cero
cambios visuales o de comportamiento respecto a hoy. No se distingue tablet
de celular — mismo tratamiento por debajo de 768px.

### Header compacto

Estructura de 2 filas en mobile:
- **Fila 1** (igual en las 6 páginas con login): título de la página + el
  botón ☰ que ya existe. Se ocultan en esta fila (vía CSS, `display:none`
  dentro de la media query) el badge de usuario, el botón de cambiar
  contraseña y el botón de cerrar sesión — sus acciones se mueven al menú
  ☰ (ver abajo). El nombre del usuario logueado deja de mostrarse aparte;
  si hace falta, se puede agregar como primera línea del menú ☰ desplegado
  (no como parte fija del header).
- **Fila 2** (opcional, sólo en las páginas que la necesiten — ej.
  Asignación de Zonas con su selector de fecha, o el botón "⟳ Actualizar"
  de Estadísticas): los controles específicos de esa página, que hoy viven
  en el header de escritorio, bajan a una fila propia debajo. Esto se
  resuelve por página (cada una decide qué controles le corresponden a esa
  segunda fila) — la base compartida sólo provee la clase de contenedor
  (`.header-fila2` o similar) para que cada página la use.

### Menú ☰ extendido

`personal-nav.js` → `renderNavMenu()` ya arma la lista de módulos + el link
"Portal". Se le agrega, condicionalmente:

```js
// Pseudocódigo — se agrega al final de la lista que ya arma el menú, sólo
// si hay sesión activa (usuarioActual() definida por personal-auth.js) y
// sólo dentro del breakpoint mobile (el menú entero es el mismo objeto,
// pero estos ítems se muestran/ocultan por CSS según el ancho, igual que
// el resto de los elementos que cambian de header a menú).
if (window.usuarioActual && usuarioActual()) {
  html += '<a class="nav-solo-mobile" onclick="abrirModalCambiarPass()">🔑 Cambiar contraseña</a>';
  html += '<a class="nav-solo-mobile" onclick="doLogout()">Cerrar sesión</a>';
}
```

La clase `nav-solo-mobile` los oculta por CSS fuera de la media query, para
no duplicar la funcionalidad de cambiar-contraseña/logout que ya vive en el
header de escritorio.

### Panel de filtros colapsable

Nueva clase/componente compartido: un botón "⚙️ Filtros (N)" (N = cantidad
de filtros activos, opcional pero recomendable) que abre un panel con el
mismo patrón visual que los modales existentes (`.overlay` + `.modal`,
ya definido en `estilo-comun.css`) — no se inventa una animación ni un
comportamiento de apertura/cierre nuevo, se reutiliza el que ya usan
"Cambiar contraseña" y el resto de los modales. Adentro del panel van los
mismos controles de filtro que hoy están en línea en escritorio (los
`<select>`/inputs no cambian, sólo su contenedor). El buscador de texto
principal de cada página queda fuera del panel, siempre visible arriba de
la lista.

### Lista compacta (reemplaza la tabla en mobile)

Componente CSS reutilizable, con esta estructura HTML de referencia (cada
página arma su propio `.map()`/template usando estas clases, con sus
propios datos):

```html
<div class="mob-list-item" onclick="abrirModalVer('ID_DEL_REGISTRO')">
  <div class="mob-avatar">JG</div>
  <div class="mob-main">
    <div class="mob-nombre">J. García</div>
    <div class="mob-sub">Inspector · Turno Mañana</div>
  </div>
  <span class="badge bdg-activo">Activo</span>
</div>
```

- `.mob-avatar`: círculo con las iniciales (mismo criterio en todas las
  páginas: primera letra de nombre + primera de apellido).
- `.mob-sub`: hasta 2 datos separados por " · " — cuáles son esos 2 datos
  es una decisión por página (ej. en Nómina: rol + turno; en Novedades:
  tipo + fecha), se define en el sub-proyecto de esa página.
- El tap abre el modal "👁 Ver" que ya existe en cada página — no se crea
  ningún modal ni vista de detalle nueva.
- Esta clase reemplaza la tabla (`.table-row`, `.grid-*`) SÓLO dentro de la
  media query — en escritorio la tabla sigue exactamente igual que hoy.

### Botones e inputs táctiles

Regla general dentro de la media query: cualquier `button`, `.btn`, `.hbtn`
y elementos con `onclick` que hoy midan menos de 44×44px pasan a tener
`min-height: 44px; min-width: 44px` (con su padding actual, no hace falta
agrandar el ícono/texto, sólo el área clickeable). Todo `input[type=text]`,
`input[type=password]`, `input[type=date]` y `select` pasan a
`font-size: 16px` mínimo dentro de la media query.

## Testing

No hay suite de tests automatizados en este repo (sitio estático). La
verificación es manual: abrir cada página en un viewport angosto (DevTools,
"Toggle device toolbar", perfil de un celular real tipo iPhone SE 375px o
similar) y confirmar que el header/menú/filtros se comportan como se
describe arriba — pero como este sub-proyecto no toca ninguna tabla ni
filtro real todavía, la verificación acá se limita a que las clases nuevas
existen y funcionan sobre un caso de prueba simple (ej. la lista compacta
con datos de ejemplo), no a que cada página ya se vea bien — eso se
verifica en cada sub-proyecto siguiente.
