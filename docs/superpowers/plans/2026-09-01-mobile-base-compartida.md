# Base compartida para mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a `estilo-comun.css` (y los 2 lugares donde vive `renderNavMenu()`) los patrones compartidos que va a heredar cada página en los sub-proyectos siguientes: header compacto con las acciones de sesión movidas al menú ☰, lista compacta reutilizable, y accesibilidad táctil (botones/inputs). No se toca ninguna tabla ni filtro real todavía.

**Architecture:** Todo el trabajo es CSS dentro del `@media (max-width:768px)` que ya existe en `estilo-comun.css` (línea 246), más una función JS (`renderNavMenu()`) que vive duplicada en dos lugares del repo y hay que actualizar en ambos. Nada de esto es un componente nuevo de UI: reutiliza `.overlay`/`.modal` (para el futuro panel de filtros, sin CSS nueva) y el menú ☰ que ya existe (para las acciones de sesión).

**Tech Stack:** HTML/CSS/JS estático, sin build. Sin framework de test — la verificación es manual con DevTools en modo responsive.

## Global Constraints

- No se modifica ninguna tabla, filtro ni header específico de una página — sólo se agregan los patrones/clases reutilizables (spec: "Fuera de alcance").
- `buscador_permisos.html` queda explícitamente afuera de este sub-proyecto: tiene `LOGIN_REQUERIDO=false` y una estructura de badge/acciones distinta a las otras 6 páginas (`#ubadge` combinado, no `#userBadge` + botones sueltos) — se resuelve en su propio sub-proyecto posterior, no acá.
- Breakpoint único: `max-width: 768px` (ya existe en el CSS, no se crea uno nuevo).
- Todo cambio nuevo vive dentro de esa media query o en reglas que no afectan el layout de escritorio — cero cambios visuales por encima de 768px.
- Spec de referencia: `docs/superpowers/specs/2026-09-01-mobile-base-compartida-design.md`.

## Nota sobre el estado actual del CSS (importante para quien implemente)

`estilo-comun.css` **ya tiene** un `@media (max-width:768px)` (líneas 246-283) de un trabajo mobile anterior — incluye, entre otras cosas, que las tablas reales (`table.utbl`/`table.rtbl`) usan scroll horizontal (`overflow-x:auto` + `min-width:640px`). Esa regla **no se toca ni se borra en este plan** — sigue siendo el fallback hasta que el sub-proyecto de cada página específica reemplace su tabla por la lista compacta (`.mob-list-item`) y en ese momento decida si esa regla vieja le sigue haciendo falta o no. Este plan sólo **agrega** reglas nuevas dentro de esa misma media query existente.

---

## Task 1: Header — mover las acciones de sesión al menú ☰

**Files:**
- Modify: `personal-nav.js` (función `renderNavMenu()`, usada por `asignacion_zonas.html`, `gestion_personal.html`, `index.html`, `novedades_personal.html`, `relevamientos_operativos.html`)
- Modify: `estadisticas_actas.html:~1235-1247` (tiene su propia copia inline de `renderNavMenu()`, no carga `personal-nav.js` — ver commit `7bffa47` de la migración de auth, que sacó esa carga externa por duplicada)
- Modify: `estilo-comun.css`

**Interfaces:**
- Consumes: `usuarioActual()` (de `personal-auth.js`, ya cargado en las 6 páginas antes que estos scripts) — devuelve `{username,nombre}` si hay sesión, o `null`.
- Produces: clase CSS `.nav-solo-mobile` — cualquier `<a>` dentro de `#navMenu` con esta clase sólo se ve por debajo de 768px.

- [ ] **Step 1: Agregar la regla base (desktop) que oculta los ítems mobile-only del menú**

En `estilo-comun.css`, encontrar esta línea exacta (línea 58):

```css
.nav-menu .nav-empty{padding:14px var(--sp-4);color:var(--c-ink-mut);font-size:var(--fs-sm)}
```

Agregar inmediatamente después:

```css
.nav-menu a.nav-solo-mobile{display:none}
```

- [ ] **Step 2: Actualizar `personal-nav.js` — agregar cambiar-contraseña/cerrar-sesión al final del menú**

Reemplazar la función completa:

```js
function renderNavMenu(){
  const m=document.getElementById("navMenu");
  if(!m)return;
  // Se muestran todos los módulos siempre (no sólo los habilitados para el
  // usuario actual) para poder viajar rápido entre páginas — cada página de
  // destino ya valida su propio acceso al cargar (restaurarSesion en
  // personal-auth.js), así que esto no abre nada que esa página no controle.
  const current=location.pathname.split("/").pop();
  const items=NAV_MODULES;
  m.innerHTML=(items.length?items.map(x=>
    '<a href="'+x.url+'" class="'+(x.url===current?"current":"")+'"><span>'+x.icon+'</span><span>'+x.title+'</span></a>'
  ).join(""):'<div class="nav-empty">Sin otros módulos habilitados</div>')+
  '<a href="index.html" class="nav-portal">🏛️<span>Portal</span></a>';
}
```

por:

```js
function renderNavMenu(){
  const m=document.getElementById("navMenu");
  if(!m)return;
  // Se muestran todos los módulos siempre (no sólo los habilitados para el
  // usuario actual) para poder viajar rápido entre páginas — cada página de
  // destino ya valida su propio acceso al cargar (restaurarSesion en
  // personal-auth.js), así que esto no abre nada que esa página no controle.
  const current=location.pathname.split("/").pop();
  const items=NAV_MODULES;
  let html=(items.length?items.map(x=>
    '<a href="'+x.url+'" class="'+(x.url===current?"current":"")+'"><span>'+x.icon+'</span><span>'+x.title+'</span></a>'
  ).join(""):'<div class="nav-empty">Sin otros módulos habilitados</div>')+
  '<a href="index.html" class="nav-portal">🏛️<span>Portal</span></a>';
  // En mobile, "Cambiar contraseña" y "Cerrar sesión" se sacan del header
  // (ver estilo-comun.css, regla #userBadge/onclick con !important) y se
  // muestran acá — mismo menú ☰ que ya existe, no uno nuevo. En escritorio
  // estos ítems quedan ocultos por CSS (.nav-solo-mobile).
  if (window.usuarioActual && usuarioActual()) {
    html += '<a class="nav-solo-mobile" onclick="abrirModalCambiarPass()"><span>🔑</span><span>Cambiar contraseña</span></a>'
          + '<a class="nav-solo-mobile" onclick="doLogout()"><span>🚪</span><span>Cerrar sesión</span></a>';
  }
  m.innerHTML=html;
}
```

- [ ] **Step 3: El mismo cambio en la copia inline de `estadisticas_actas.html`**

Buscar (usa comillas simples, a diferencia de `personal-nav.js` — es la copia inline de esta página, mantener su propio estilo de comillas):

```js
function renderNavMenu(){
  const m=document.getElementById('navMenu');
  if(!m)return;
  // Se muestran todos los módulos siempre (no sólo los habilitados para el
  // usuario actual) para poder viajar rápido entre páginas — cada página de
  // destino ya valida su propio acceso al cargar.
  const current=location.pathname.split('/').pop();
  const items=NAV_MODULES;
  m.innerHTML=(items.length?items.map(x=>
    '<a href="'+x.url+'" class="'+(x.url===current?'current':'')+'"><span>'+x.icon+'</span><span>'+x.title+'</span></a>'
  ).join(''):'<div class="nav-empty">Sin otros módulos habilitados</div>')+
  '<a href="index.html" class="nav-portal">🏛️<span>Portal</span></a>';
}
```

Reemplazar por:

```js
function renderNavMenu(){
  const m=document.getElementById('navMenu');
  if(!m)return;
  // Se muestran todos los módulos siempre (no sólo los habilitados para el
  // usuario actual) para poder viajar rápido entre páginas — cada página de
  // destino ya valida su propio acceso al cargar.
  const current=location.pathname.split('/').pop();
  const items=NAV_MODULES;
  let html=(items.length?items.map(x=>
    '<a href="'+x.url+'" class="'+(x.url===current?'current':'')+'"><span>'+x.icon+'</span><span>'+x.title+'</span></a>'
  ).join(''):'<div class="nav-empty">Sin otros módulos habilitados</div>')+
  '<a href="index.html" class="nav-portal">🏛️<span>Portal</span></a>';
  // En mobile, "Cambiar contraseña" y "Cerrar sesión" se sacan del header
  // y se muestran acá — mismo menú ☰ que ya existe, no uno nuevo.
  if (window.usuarioActual && usuarioActual()) {
    html += '<a class="nav-solo-mobile" onclick="abrirModalCambiarPass()"><span>🔑</span><span>Cambiar contraseña</span></a>'
          + '<a class="nav-solo-mobile" onclick="doLogout()"><span>🚪</span><span>Cerrar sesión</span></a>';
  }
  m.innerHTML=html;
}
```

- [ ] **Step 4: Ocultar por CSS el badge/botones de sesión del header en mobile**

En `estilo-comun.css`, dentro del `@media (max-width:768px){...}` existente (empieza en la línea 246), agregar al final del bloque, justo antes de la llave de cierre `}` que cierra la media query (la que sigue a la regla `.toast{left:16px;right:16px;bottom:16px}`):

```css

  /* Acciones de sesión: se ocultan del header (se movieron al menú ☰,
     ver personal-nav.js). Los tres selectores cubren index.html
     (#cpBtn/#logoutBtn) y las otras 5 páginas con login obligatorio
     (mismos onclick, sin id propio) — buscador_permisos.html queda afuera
     a propósito (ver Global Constraints del plan). !important porque
     personal-auth.js pisa el display de #userBadge con estilo inline
     (mostrarSesionUI()), que si no tendría más especificidad que esta regla. */
  #userBadge,
  [onclick="abrirModalCambiarPass()"],
  [onclick="doLogout()"]{display:none !important}

  /* Los ítems de sesión del menú ☰ (ocultos por defecto, ver regla base
     fuera de esta media query) se muestran acá. */
  .nav-menu a.nav-solo-mobile{display:flex}

  /* Segunda fila de header para controles propios de cada página (fecha en
     Asignación de Zonas, botón Actualizar en Estadísticas, etc.) — la usa
     cada página cuando le toque su sub-proyecto; acá sólo se define. */
  .header-fila2{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;width:100%;margin-top:var(--sp-2)}
```

- [ ] **Step 5: Verificación manual**

No hay test runner en este repo. Verificar a mano:
1. Abrir `gestion_personal.html` en el navegador, loguearse, achicar la ventana (o DevTools → Toggle device toolbar, perfil de celular ~375px de ancho).
2. Confirmar que `#userBadge`, el botón 🔑 y el botón "Salir" del header ya NO se ven.
3. Tocar el ☰ → confirmar que aparecen "🔑 Cambiar contraseña" y "🚪 Cerrar sesión" al final del menú, y que ambos funcionan (abren el modal / cierran sesión).
4. Repetir el mismo chequeo en `index.html`, `novedades_personal.html`, `asignacion_zonas.html`, `relevamientos_operativos.html`, `estadisticas_actas.html` (6 páginas en total).
5. Agrandar la ventana de vuelta a escritorio (>768px) y confirmar que el header vuelve exactamente a como se ve hoy (badge y botones visibles en el header, nada nuevo en el menú ☰).
6. Confirmar en `buscador_permisos.html` que **no** cambió nada (no tiene `#userBadge` ni carga `personal-nav.js`/su propia copia no se tocó).

- [ ] **Step 6: Commit**

```bash
git add estilo-comun.css personal-nav.js estadisticas_actas.html
git commit -m "Mobile: mover cambiar-contraseña/cerrar-sesión del header al menú ☰"
```

---

## Task 2: Componentes reutilizables — lista compacta y accesibilidad táctil

**Files:**
- Modify: `estilo-comun.css`

**Interfaces:**
- Produces: clases CSS `.mob-list-item`, `.mob-avatar`, `.mob-main`, `.mob-nombre`, `.mob-sub` — para que cada página arme, en su propio sub-proyecto, un `.map()` de sus registros con esta estructura (ver ejemplo en el spec). Ninguna página las usa todavía después de esta tarea — sólo quedan definidas y listas.

No depende de la Task 1 (son bloques de CSS independientes dentro de la misma media query) — se puede hacer en paralelo o en cualquier orden.

- [ ] **Step 1: Agregar las clases de la lista compacta**

En `estilo-comun.css`, dentro del mismo `@media (max-width:768px){...}`, agregar (puede ir después de las reglas de la Task 1, o si esa tarea todavía no se hizo, antes de la llave de cierre de la media query):

```css

  /* Lista compacta: reemplaza .table-row/.grid-* y table.utbl/rtbl cuando
     cada página adapte su tabla real (sub-proyectos siguientes — acá sólo
     se define la clase, ninguna página la usa todavía). Estructura de
     referencia en el spec: avatar/iniciales + nombre + subtítulo de 1-2
     datos + badge de estado a la derecha; el onclick de cada item abre el
     mismo modal "👁 Ver" que ya existe en cada página. */
  .mob-list-item{display:flex;align-items:center;gap:var(--sp-3);padding:10px var(--sp-2);border-bottom:var(--border-w) solid var(--c-line-soft);cursor:pointer}
  .mob-list-item:hover,.mob-list-item:active{background:var(--c-bg)}
  .mob-avatar{width:36px;height:36px;border-radius:50%;background:var(--c-brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--fs-sm);flex-shrink:0}
  .mob-main{flex:1;min-width:0}
  .mob-nombre{font-weight:600;font-size:var(--fs-base);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mob-sub{font-size:var(--fs-sm);color:var(--c-ink-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
```

- [ ] **Step 2: Agregar el tamaño mínimo táctil para botones e inputs**

En el mismo bloque, agregar:

```css

  /* Accesibilidad táctil: 44x44px mínimo es la recomendación estándar
     (Apple HIG / Material Design) para que un dedo pueda tocar sin errar.
     Sólo botones "de verdad" (no [onclick] genérico — eso incluiría
     encabezados de columna ordenables (.th-sort) y otros elementos chicos
     a propósito que no son botones principales). */
  button,.btn,.hbtn,.abtn{min-height:44px}

  /* 16px mínimo en inputs de texto: por debajo de eso, iOS Safari hace
     zoom automático al enfocar el campo (comportamiento del sistema, no
     configurable por CSS salvo subiendo el font-size). */
  input[type=text],input[type=password],input[type=date],input[type=email],select{font-size:16px}
```

- [ ] **Step 3: Verificación manual**

No hay test runner en este repo. Verificar a mano, con DevTools en modo responsive (~375px de ancho):
1. En cualquiera de las 6 páginas con login, abrir el modal de "Cambiar contraseña" y confirmar que sus inputs y el botón "Guardar" ya no se ven più chicos que antes (más altos/más legibles) sin que el modal se vea roto.
2. Crear un archivo HTML de prueba suelto (no forma parte del repo, se descarta después) con 3-4 `<div class="mob-list-item">` usando la estructura de referencia del spec, abrirlo en el navegador con `estilo-comun.css` enlazado, y confirmar visualmente que se ve como el mockup aprobado (avatar circular, nombre + subtítulo, badge a la derecha, sin desbordar en 375px de ancho).
3. Confirmar que por encima de 768px nada de esto aplica (las clases `.mob-*` no existen fuera de la media query, así que no hay nada que verificar ahí salvo que el sitio se siga viendo igual que antes).

- [ ] **Step 4: Commit**

```bash
git add estilo-comun.css
git commit -m "Mobile: agregar lista compacta reutilizable y tamaños táctiles mínimos"
```

---

## Self-Review

**Cobertura del spec:** breakpoint (ya existía, documentado en la nota de contexto) → cubierto; header compacto con menú ☰ extendido → Task 1; panel de filtros colapsable → el spec aclara que reutiliza `.overlay`/`.modal` existentes sin CSS nueva, así que no generó una task propia (no hay nada nuevo que construir, sólo un patrón de uso que se documenta en el spec para cuando cada página lo aplique); lista compacta → Task 2 Step 1; botones/inputs táctiles → Task 2 Step 2.

**Placeholders:** ninguno — cada step trae el CSS/JS completo a agregar, con la ubicación exacta (línea o bloque existente) donde insertarlo.

**Consistencia:** `.nav-solo-mobile` se define oculta por defecto (Task 1 Step 1) y se muestra sólo dentro de la media query (Task 1 Step 4) — mismo nombre de clase en ambos lugares. Los selectores `[onclick="abrirModalCambiarPass()"]`/`[onclick="doLogout()"]` se verificaron contra el HTML real de las 5 páginas que no son `index.html` (usan ese texto de onclick exacto, sin id propio) y contra `index.html` (que además tiene `id="cpBtn"`/`id="logoutBtn"`, pero el mismo onclick — el selector por atributo los cubre a ambos con una sola regla).
