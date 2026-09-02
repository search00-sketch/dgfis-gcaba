# Mobile: lista compacta para Nómina/Distribución/Novedades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las tablas de Nómina (gestión + novedades), Distribución (gestión) y Novedades/Historial (gestión + novedades) muestren la lista compacta mobile (`.mob-list-item`, ya definida en `estilo-comun.css`) por debajo de 768px, con sus acciones accesibles.

**Architecture:** Cada fila se sigue renderizando igual que hoy (`.table-row`/`.grid-*`, sin tocar) y se le agrega, como elemento hermano en el mismo template string, un `<div class="mob-list-item">` con los mismos datos en el formato mobile. CSS pura decide cuál de los dos se ve según el ancho de pantalla — no hay JS de detección de viewport ni re-render en resize. Las acciones secundarias (todo lo que no sea "tocar la fila") se agrupan en un panel "⋮" nuevo, compartido, que reutiliza `.overlay`/`.modal` ya existentes.

**Tech Stack:** HTML/JS estático, sin build. Sin test runner — verificación manual con DevTools.

## Global Constraints

- Cero cambios de comportamiento o de datos — sólo se agrega markup mobile al lado del desktop existente. El desktop (`.table-row`) no se toca en ningún paso de este plan.
- Por encima de 768px, cero cambios visuales (el `.mob-list-item` nuevo por fila queda oculto por la media query ya existente en `estilo-comun.css`).
- Fuera de alcance (no tocar en este plan): `asignacion_zonas.html`, panel "Carga diaria" y tabla "Ranking" de `novedades_personal.html` (ver spec, "Fuera de alcance").
- Spec de referencia: `docs/superpowers/specs/2026-09-01-mobile-nomina-listas-design.md`.

---

## Task 1: Helpers compartidos y panel de acciones ⋮

**Files:**
- Modify: `personal-dominio.js` (compartido por `gestion_personal.html`, `novedades_personal.html`, `asignacion_zonas.html`)
- Modify: `estilo-comun.css`
- Modify: `gestion_personal.html` (agregar el HTML del panel)
- Modify: `novedades_personal.html` (agregar el HTML del panel)

**Interfaces:**
- Produces: `inicialesNombre(nombre)` → string de 1-2 letras. `fmtDateCorta(fecha)` → string tipo `"12 AGO"` desde una fecha `"YYYY-MM-DD"`. `abrirMenuAcciones(titulo, acciones)` donde `acciones` es `[{label, fn}, ...]` — abre el panel `#mob-acciones-overlay` (debe existir en la página que lo llama) y ejecuta `fn()` al tocar el botón correspondiente. Todo esto lo van a usar las Tasks 2-6.

- [ ] **Step 1: Agregar los helpers a `personal-dominio.js`**

Al final del archivo (después de la última función, `ordenarLista`), agregar:

```js

// ============================================================
//  MOBILE — lista compacta (avatar/fecha + nombre + subtítulo + badge) y
//  panel de acciones secundarias "⋮". Compartido por gestion_personal.html
//  y novedades_personal.html.
// ============================================================
// Iniciales para el avatar de la lista compacta: primera letra del nombre
// + primera del apellido (si hay más de una palabra).
function inicialesNombre(nombre){
  const partes=(nombre||'').trim().split(/\s+/);
  if(!partes[0]) return '?';
  return (partes[0][0]+(partes[1]?partes[1][0]:'')).toUpperCase();
}

const MESES_CORTOS=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
// Fecha compacta para el bloque "fecha" de las listas de Novedades/
// Historial en mobile (reemplaza al avatar de iniciales, ya que estas
// listas son cronológicas). Espera "YYYY-MM-DD".
function fmtDateCorta(fecha){
  if(!fecha) return '—';
  const [, m, d]=fecha.split('-');
  return d+' '+MESES_CORTOS[parseInt(m,10)-1];
}

// Panel de acciones secundarias (el "⋮" de una fila en la lista compacta
// mobile). `acciones` = [{label, fn}, ...]. Requiere que la página host
// tenga el markup #mob-acciones-overlay (ver Task 1, Step 3/4) y las
// funciones cerrarModal()/esc() ya definidas (mismo patrón que el resto de
// los modales de estas páginas).
let _menuAccionesActuales=[];
function abrirMenuAcciones(titulo, acciones){
  _menuAccionesActuales=acciones;
  document.getElementById('mob-acciones-title').textContent=titulo;
  document.getElementById('mob-acciones-botones').innerHTML=acciones.map((a,i)=>
    `<button class="btn btn-gris" onclick="_ejecutarAccionMenu(${i})">${esc(a.label)}</button>`
  ).join('');
  document.getElementById('mob-acciones-overlay').classList.add('open');
}
function _ejecutarAccionMenu(i){
  cerrarModal('mob-acciones-overlay');
  _menuAccionesActuales[i].fn();
}
```

- [ ] **Step 2: Agregar el CSS del botón "⋮" y del bloque de fecha**

En `estilo-comun.css`, dentro del `@media (max-width:768px){...}` existente, agregar (después de las reglas de `.mob-sub` que ya existen de la Task 2 del sub-proyecto anterior):

```css

  /* Botón "⋮" de acciones secundarias — hereda min-height:44px de la regla
     táctil ya existente (es un <button>, no hace falta repetirlo acá). */
  .mob-kebab{background:none;border:none;font-size:20px;color:var(--c-ink-mut);cursor:pointer;flex-shrink:0;padding:0 var(--sp-2)}

  /* Bloque de fecha compacta (reemplaza al avatar en listas cronológicas
     como Novedades/Historial). */
  .mob-fecha{flex-shrink:0;text-align:center;font-size:var(--fs-sm);font-weight:700;color:var(--c-brand);min-width:40px}
```

- [ ] **Step 3: Agregar el panel de acciones a `gestion_personal.html`**

Buscar el cierre del modal "Ver" (`<div id="modal-ver-overlay">`, termina justo antes de `<script>window.MODULO_ID=`) y agregar, inmediatamente después de su `</div>` de cierre:

```html

<!-- MOBILE: panel de acciones secundarias (⋮ de la lista compacta) -->
<div class="overlay" id="mob-acciones-overlay">
  <div class="modal" style="max-width:320px">
    <div class="modal-title" id="mob-acciones-title"></div>
    <div id="mob-acciones-botones" style="display:flex;flex-direction:column;gap:8px"></div>
    <div class="modal-actions" style="margin-top:12px">
      <button class="btn btn-gris" onclick="cerrarModal('mob-acciones-overlay')">Cancelar</button>
    </div>
  </div>
</div>
```

(Verificar primero el punto exacto de inserción leyendo el archivo — el brief no asume un número de línea fijo porque otros sub-proyectos pueden haber tocado el archivo entre tanto.)

- [ ] **Step 4: El mismo panel en `novedades_personal.html`**

Mismo bloque HTML del Step 3, agregado en el lugar equivalente (después del cierre de `<div id="modal-ver-overlay">` de esa página).

- [ ] **Step 5: Verificación manual**

No hay test runner. Verificar:
1. `node --check` (o lectura manual) sobre `personal-dominio.js` — sin errores de sintaxis.
2. Que `#mob-acciones-overlay`/`#mob-acciones-title`/`#mob-acciones-botones` existan exactamente una vez en cada una de las 2 páginas (`grep -c`).
3. Que el nuevo bloque CSS esté dentro de la media query existente (no crea una nueva).

- [ ] **Step 6: Commit**

```bash
git add personal-dominio.js estilo-comun.css gestion_personal.html novedades_personal.html
git commit -m "Mobile: helpers compartidos y panel de acciones ⋮ para la lista compacta"
```

---

## Task 2: `gestion_personal.html` — Nómina

**Files:**
- Modify: `gestion_personal.html` (función `renderNomina()`, líneas ~498-546 al momento de escribir este plan — confirmar releyendo el archivo, pudo moverse)

**Interfaces:**
- Consumes: `inicialesNombre`, `abrirMenuAcciones` (Task 1). `abrirModalVer(id)`, `exportarHistPersonaId(id)`, `esc`, `escJsAttr`, `badgeEstado` (ya existen).

Depende de la Task 1 (usa sus helpers). No depende de las Tasks 3-6.

- [ ] **Step 1: Agregar la fila mobile dentro de `renderNomina()`**

Encontrar el `return` del `.map()` de `renderNomina()`:

```js
  document.getElementById('nom-body').innerHTML=lista.map((p,i)=>{
    const est=getEstadoPersona(p,hoy);
    return `<div class="table-row grid-nom" style="${est==='Baja'?'background:#fff5f5':''}">
      <div>
        <div class="nombre-cell" style="color:${est==='Baja'?'#c0392b':'#222'}">${esc(p.nombre)}</div>
        <div class="sub-cell">${esc(p.coordinador||'—')}</div>
      </div>
      <div>${badgeTurno(p.turno)}</div>
      <div style="font-size:12px;color:#555">${esc(p.rol||'Inspector')}</div>
      <div style="font-size:12px;color:#555">${esc(p.dni||'—')}</div>
      <div>${badgeEstado(est)}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-gris btn-sm" onclick="abrirModalVer('${p.id}')">👁 Ver</button>
        <button class="btn btn-gris btn-sm" onclick="exportarHistPersonaId('${p.id}')" title="Exportar">📥</button>
      </div>
    </div>`;
  }).join('');
```

Reemplazar por (agrega el `.mob-list-item` como hermano del `.table-row`, sin tocar este último):

```js
  document.getElementById('nom-body').innerHTML=lista.map((p,i)=>{
    const est=getEstadoPersona(p,hoy);
    return `<div class="table-row grid-nom" style="${est==='Baja'?'background:#fff5f5':''}">
      <div>
        <div class="nombre-cell" style="color:${est==='Baja'?'#c0392b':'#222'}">${esc(p.nombre)}</div>
        <div class="sub-cell">${esc(p.coordinador||'—')}</div>
      </div>
      <div>${badgeTurno(p.turno)}</div>
      <div style="font-size:12px;color:#555">${esc(p.rol||'Inspector')}</div>
      <div style="font-size:12px;color:#555">${esc(p.dni||'—')}</div>
      <div>${badgeEstado(est)}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-gris btn-sm" onclick="abrirModalVer('${p.id}')">👁 Ver</button>
        <button class="btn btn-gris btn-sm" onclick="exportarHistPersonaId('${p.id}')" title="Exportar">📥</button>
      </div>
    </div>
    <div class="mob-list-item" onclick="abrirModalVer('${p.id}')">
      <div class="mob-avatar">${inicialesNombre(p.nombre)}</div>
      <div class="mob-main">
        <div class="mob-nombre">${esc(p.nombre)}</div>
        <div class="mob-sub">${esc(p.rol||'Inspector')} · ${esc(p.turno||'—')}</div>
      </div>
      ${badgeEstado(est)}
      <button class="mob-kebab" onclick="event.stopPropagation();abrirMenuAcciones('${escJsAttr(p.nombre)}',[{label:'📥 Exportar',fn:()=>exportarHistPersonaId('${p.id}')}])">⋮</button>
    </div>`;
  }).join('');
```

- [ ] **Step 2: Verificación manual**

DevTools en modo responsive (~375px), logueado en `gestion_personal.html`, pestaña Nómina:
1. Se ve la lista compacta (no la tabla) con nombre, "Rol · Turno", badge de estado.
2. Tocar una fila abre el modal "👁 Ver" con los datos de esa persona (no de otra).
3. Tocar "⋮" abre el panel con "📥 Exportar" y NO dispara también el modal "Ver" (gracias al `stopPropagation`).
4. Ese botón exporta el historial de esa persona (mismo resultado que el botón 📥 de escritorio).
5. Por encima de 768px, la tabla se ve exactamente igual que antes de este cambio.

- [ ] **Step 3: Commit**

```bash
git add gestion_personal.html
git commit -m "Mobile: lista compacta para Nómina (gestión de personal)"
```

---

## Task 3: `gestion_personal.html` — Distribución del día

**Files:**
- Modify: `gestion_personal.html` (función `renderDist()`, líneas ~418-493 al momento de escribir este plan)

**Interfaces:**
- Consumes: `inicialesNombre` (Task 1). `abrirModalVer(id)`, `esc`, `badgeTurno` (ya existen).

No depende de las Tasks 2/4-6.

- [ ] **Step 1: Agregar la fila mobile dentro de `renderDist()`**

Encontrar:

```js
  document.getElementById('dist-body').innerHTML=lista.map(p=>{
    const zona=dist[p.id]||'';
    const novs=novsDePersonaHoy(p.id);
    const est=getEstadoPersona(p,fechaAsig);
    return `<div class="table-row grid-dist">
      <div>
        <div class="nombre-cell">${esc(p.nombre)}</div>
        <div class="sub-cell">${esc(p.rol||'Inspector')} · ${esc(p.celular||'—')}</div>
      </div>
      <div>${badgeTurno(p.turno)}</div>
      <div style="font-size:13px;color:${zona?'#222;font-weight:600':'#aaa'}">${esc(zona||'Sin asignar')}</div>
      <div>${novs.map(n=>badgeNov(n.tipo)).join(' ')}${est==='Licencia'?badgeEstado('Licencia'):''}</div>
      <div><button onclick="abrirModalVer('${p.id}')" style="background:none;border:none;font-size:16px;cursor:pointer">👁</button></div>
    </div>`;
  }).join('');
```

Reemplazar por:

```js
  document.getElementById('dist-body').innerHTML=lista.map(p=>{
    const zona=dist[p.id]||'';
    const novs=novsDePersonaHoy(p.id);
    const est=getEstadoPersona(p,fechaAsig);
    return `<div class="table-row grid-dist">
      <div>
        <div class="nombre-cell">${esc(p.nombre)}</div>
        <div class="sub-cell">${esc(p.rol||'Inspector')} · ${esc(p.celular||'—')}</div>
      </div>
      <div>${badgeTurno(p.turno)}</div>
      <div style="font-size:13px;color:${zona?'#222;font-weight:600':'#aaa'}">${esc(zona||'Sin asignar')}</div>
      <div>${novs.map(n=>badgeNov(n.tipo)).join(' ')}${est==='Licencia'?badgeEstado('Licencia'):''}</div>
      <div><button onclick="abrirModalVer('${p.id}')" style="background:none;border:none;font-size:16px;cursor:pointer">👁</button></div>
    </div>
    <div class="mob-list-item" onclick="abrirModalVer('${p.id}')">
      <div class="mob-avatar">${inicialesNombre(p.nombre)}</div>
      <div class="mob-main">
        <div class="mob-nombre">${esc(p.nombre)}</div>
        <div class="mob-sub">${esc(p.turno||'—')} · ${esc(zona||'Sin asignar')}</div>
      </div>
    </div>`;
  }).join('');
```

- [ ] **Step 2: Verificación manual**

DevTools en modo responsive, pestaña "Distribución del día":
1. Lista compacta con nombre y "Turno · Zona" (o "Turno · Sin asignar").
2. Tocar una fila abre "👁 Ver" con los datos correctos.
3. Sin "⋮" (esta tabla no tiene acciones secundarias).
4. Desktop sin cambios.

- [ ] **Step 3: Commit**

```bash
git add gestion_personal.html
git commit -m "Mobile: lista compacta para Distribución del día (gestión de personal)"
```

---

## Task 4: `gestion_personal.html` — Novedades (historial)

**Files:**
- Modify: `gestion_personal.html` (función `renderNovedades()`, líneas ~551-607 al momento de escribir este plan)

**Interfaces:**
- Consumes: `fmtDateCorta` (Task 1). `esc`, `badgeNov`, `fmtDate` (ya existen).

No depende de las Tasks 2/3/5/6.

- [ ] **Step 1: Agregar la fila mobile dentro de `renderNovedades()`**

Encontrar:

```js
  document.getElementById('nov-body').innerHTML=hist.map(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:'—'};
    const extra=n.licIni?`${fmtDate(n.licIni)}→${fmtDate(n.licFin)}`:'';
    return `<div class="table-row grid-hist">
      <span style="font-size:12px;color:#777">${fmtDate(n.fecha)}</span>
      <span style="font-size:13px;font-weight:600">${esc(p.nombre)}</span>
      ${badgeNov(n.tipo)}
      <span style="font-size:12px;color:#555">${esc(n.detalle||extra||'—')}</span>
      <span></span>
    </div>`;
  }).join('');
```

Reemplazar por:

```js
  document.getElementById('nov-body').innerHTML=hist.map(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:'—'};
    const extra=n.licIni?`${fmtDate(n.licIni)}→${fmtDate(n.licFin)}`:'';
    return `<div class="table-row grid-hist">
      <span style="font-size:12px;color:#777">${fmtDate(n.fecha)}</span>
      <span style="font-size:13px;font-weight:600">${esc(p.nombre)}</span>
      ${badgeNov(n.tipo)}
      <span style="font-size:12px;color:#555">${esc(n.detalle||extra||'—')}</span>
      <span></span>
    </div>
    <div class="mob-list-item">
      <div class="mob-fecha">${fmtDateCorta(n.fecha)}</div>
      <div class="mob-main">
        <div class="mob-nombre">${esc(p.nombre)}</div>
        <div class="mob-sub">${esc(n.detalle||extra||'—')}</div>
      </div>
      ${badgeNov(n.tipo)}
    </div>`;
  }).join('');
```

- [ ] **Step 2: Verificación manual**

DevTools en modo responsive, pestaña "Novedades":
1. Lista compacta con bloque de fecha corta ("12 AGO"), nombre, detalle como subtítulo, badge de tipo a la derecha.
2. Sin acción de tap ni "⋮" (esta tabla no tiene ninguna acción, igual que en escritorio).
3. Desktop sin cambios.

- [ ] **Step 3: Commit**

```bash
git add gestion_personal.html
git commit -m "Mobile: lista compacta para Novedades (gestión de personal)"
```

---

## Task 5: `novedades_personal.html` — Nómina

**Files:**
- Modify: `novedades_personal.html` (función `renderNomina()`, líneas ~902-947 al momento de escribir este plan)

**Interfaces:**
- Consumes: `inicialesNombre`, `abrirMenuAcciones` (Task 1). `abrirModalVer`, `abrirModalPersona`, `abrirModalNovedad`, `reactivarPersona`, `pedirBaja`, `esc`, `escJsAttr`, `badgeEstado` (ya existen).

Depende de la Task 1. No depende de las Tasks 2-4/6.

- [ ] **Step 1: Agregar la fila mobile dentro de `renderNomina()`**

Encontrar (nota: este archivo concatena strings con `+`, no usa template literals para las filas — mantener ese estilo):

```js
  document.getElementById("nom-body").innerHTML=lista.map(p=>{
    const est=getEstadoPersona(p,hoy);
    const rol=p.rol||"Inspector";
    return "<div class=\"table-row\" style=\"grid-template-columns:2fr .9fr .8fr .8fr .8fr 120px;"+(est==="Baja"?"background:#fff5f5":"")+"\">"
      +"<div><div class=\"nombre-cell\" style=\"color:"+(est==="Baja"?"#c0392b":"#222")+"\">"
      +esc(p.nombre)+(rol==="Chofer"?" 🚗":"")+"</div>"
      +"<div class=\"sub-cell\">"+esc(p.coordinador||"—")+"</div></div>"
      +badgeTurno(p.turno)
      +"<span style=\"font-size:12px;color:#555\">"+esc(rol)+"</span>"
      +"<span style=\"font-size:12px;color:#555\">"+esc(p.dni||"—")+"</span>"
      +badgeEstado(est)
      +"<div style=\"display:flex;gap:4px;flex-wrap:wrap\">"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalVer(\'"+p.id+"\')\" >👁</button>"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalPersona(\'"+p.id+"\')\" >✏️</button>"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalNovedad(\'"+p.id+"\')\"  >+ nov</button>"
      +(est==="Baja"
        ?"<button class=\"btn btn-sm\" style=\"background:#e8f8e8;color:#1b5e20;border:1px solid #a5d6a7\" onclick=\"reactivarPersona(\'"+p.id+"\')\" >✅</button>"
        :"<button class=\"btn btn-sm\" style=\"background:#fff5f5;color:#c0392b;border:1px solid #ef9a9a\" onclick=\"pedirBaja(\'"+p.id+"\')\" >🚫</button>")
      +"</div></div>";
  }).join("");
```

Reemplazar por (agrega el `.mob-list-item` al final de la misma concatenación, antes del `;`):

```js
  document.getElementById("nom-body").innerHTML=lista.map(p=>{
    const est=getEstadoPersona(p,hoy);
    const rol=p.rol||"Inspector";
    return "<div class=\"table-row\" style=\"grid-template-columns:2fr .9fr .8fr .8fr .8fr 120px;"+(est==="Baja"?"background:#fff5f5":"")+"\">"
      +"<div><div class=\"nombre-cell\" style=\"color:"+(est==="Baja"?"#c0392b":"#222")+"\">"
      +esc(p.nombre)+(rol==="Chofer"?" 🚗":"")+"</div>"
      +"<div class=\"sub-cell\">"+esc(p.coordinador||"—")+"</div></div>"
      +badgeTurno(p.turno)
      +"<span style=\"font-size:12px;color:#555\">"+esc(rol)+"</span>"
      +"<span style=\"font-size:12px;color:#555\">"+esc(p.dni||"—")+"</span>"
      +badgeEstado(est)
      +"<div style=\"display:flex;gap:4px;flex-wrap:wrap\">"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalVer(\'"+p.id+"\')\" >👁</button>"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalPersona(\'"+p.id+"\')\" >✏️</button>"
      +"<button class=\"btn btn-gris btn-sm\" onclick=\"abrirModalNovedad(\'"+p.id+"\')\"  >+ nov</button>"
      +(est==="Baja"
        ?"<button class=\"btn btn-sm\" style=\"background:#e8f8e8;color:#1b5e20;border:1px solid #a5d6a7\" onclick=\"reactivarPersona(\'"+p.id+"\')\" >✅</button>"
        :"<button class=\"btn btn-sm\" style=\"background:#fff5f5;color:#c0392b;border:1px solid #ef9a9a\" onclick=\"pedirBaja(\'"+p.id+"\')\" >🚫</button>")
      +"</div></div>"
      +"<div class=\"mob-list-item\" onclick=\"abrirModalVer('"+p.id+"')\">"
      +"<div class=\"mob-avatar\">"+inicialesNombre(p.nombre)+"</div>"
      +"<div class=\"mob-main\">"
      +"<div class=\"mob-nombre\">"+esc(p.nombre)+(rol==="Chofer"?" 🚗":"")+"</div>"
      +"<div class=\"mob-sub\">"+esc(rol)+" · "+esc(p.turno||"—")+"</div>"
      +"</div>"
      +badgeEstado(est)
      +"<button class=\"mob-kebab\" onclick=\"event.stopPropagation();abrirMenuAcciones('"+escJsAttr(p.nombre)+"',[{label:'✏️ Editar',fn:()=>abrirModalPersona('"+p.id+"')},{label:'➕ Agregar novedad',fn:()=>abrirModalNovedad('"+p.id+"')},{label:'"+(est==="Baja"?"✅ Reactivar":"🚫 Dar de baja")+"',fn:()=>"+(est==="Baja"?"reactivarPersona":"pedirBaja")+"('"+p.id+"')}])\">⋮</button>"
      +"</div>";
  }).join("");
```

- [ ] **Step 2: Verificación manual**

DevTools en modo responsive, logueado en `novedades_personal.html`, pestaña Nómina:
1. Lista compacta con nombre (+🚗 si Chofer), "Rol · Turno", badge de estado.
2. Tocar la fila abre "👁 Ver".
3. "⋮" muestra 3 acciones: Editar, Agregar novedad, y Reactivar/Dar de baja según el estado actual de esa persona — cada una hace lo mismo que su botón equivalente en escritorio.
4. Desktop sin cambios.

- [ ] **Step 3: Commit**

```bash
git add novedades_personal.html
git commit -m "Mobile: lista compacta para Nómina (novedades de personal)"
```

---

## Task 6: `novedades_personal.html` — Historial

**Files:**
- Modify: `novedades_personal.html` (función `renderHistorial()`, líneas ~832-881 al momento de escribir este plan)

**Interfaces:**
- Consumes: `fmtDateCorta`, `abrirMenuAcciones` (Task 1). `editarNovedad`, `borrarNovedad`, `esc`, `escJsAttr`, `badgeNov` (ya existen).

Depende de la Task 1. No depende de las Tasks 2-5.

- [ ] **Step 1: Agregar la fila mobile dentro de `renderHistorial()`**

Encontrar:

```js
  document.getElementById("hist-body").innerHTML=hist.map(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"—"};
    const extra=n.licIni?fmtDate(n.licIni)+"→"+fmtDate(n.licFin):"";
    const detalleTxt=[extra,n.detalle].filter(Boolean).map(esc).join(" · ")||"—";
    const estadoBadge=n.estadoLic?badgeEstadoLic(n.estadoLic):"";
    const tituloPor="Cargado por "+(n.creadoPor||n.modificadoPor)+(n.modificadoPor&&n.modificadoPor!==n.creadoPor?" · Última edición: "+n.modificadoPor:"");
    const porTxt=n.modificadoPor?"<span style=\"font-size:11px;color:#aaa\" title=\""+esc(tituloPor)+"\"> · 👤 "+esc(n.modificadoPor)+"</span>":"";
    return "<div class=\"table-row grid-hist\">"
      +"<span style=\"font-size:12px;color:#777\">"+fmtDate(n.fecha)+"</span>"
      +"<span style=\"font-size:13px;font-weight:600\">"+esc(p.nombre)+"</span>"
      +badgeNov(n.tipo)
      +"<span style=\"font-size:12px;color:#555\">"+estadoBadge+" "+detalleTxt+porTxt+"</span>"
      +"<span style=\"display:flex;gap:4px\">"
      +"<button onclick=\"editarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#2563a8;cursor:pointer;font-size:13px\">✏️</button>"
      +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#c0392b;cursor:pointer;font-size:13px\">✕</button>"
      +"</span>"
      +"</div>";
  }).join("");
```

Reemplazar por:

```js
  document.getElementById("hist-body").innerHTML=hist.map(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"—"};
    const extra=n.licIni?fmtDate(n.licIni)+"→"+fmtDate(n.licFin):"";
    const detalleTxt=[extra,n.detalle].filter(Boolean).map(esc).join(" · ")||"—";
    const estadoBadge=n.estadoLic?badgeEstadoLic(n.estadoLic):"";
    const tituloPor="Cargado por "+(n.creadoPor||n.modificadoPor)+(n.modificadoPor&&n.modificadoPor!==n.creadoPor?" · Última edición: "+n.modificadoPor:"");
    const porTxt=n.modificadoPor?"<span style=\"font-size:11px;color:#aaa\" title=\""+esc(tituloPor)+"\"> · 👤 "+esc(n.modificadoPor)+"</span>":"";
    return "<div class=\"table-row grid-hist\">"
      +"<span style=\"font-size:12px;color:#777\">"+fmtDate(n.fecha)+"</span>"
      +"<span style=\"font-size:13px;font-weight:600\">"+esc(p.nombre)+"</span>"
      +badgeNov(n.tipo)
      +"<span style=\"font-size:12px;color:#555\">"+estadoBadge+" "+detalleTxt+porTxt+"</span>"
      +"<span style=\"display:flex;gap:4px\">"
      +"<button onclick=\"editarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#2563a8;cursor:pointer;font-size:13px\">✏️</button>"
      +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#c0392b;cursor:pointer;font-size:13px\">✕</button>"
      +"</span>"
      +"</div>"
      +"<div class=\"mob-list-item\">"
      +"<div class=\"mob-fecha\">"+fmtDateCorta(n.fecha)+"</div>"
      +"<div class=\"mob-main\">"
      +"<div class=\"mob-nombre\">"+esc(p.nombre)+"</div>"
      +"<div class=\"mob-sub\">"+detalleTxt+"</div>"
      +"</div>"
      +badgeNov(n.tipo)
      +"<button class=\"mob-kebab\" onclick=\"abrirMenuAcciones('"+escJsAttr(p.nombre)+"',[{label:'✏️ Editar',fn:()=>editarNovedad('"+n.id+"')},{label:'✕ Eliminar',fn:()=>borrarNovedad('"+n.id+"')}])\">⋮</button>"
      +"</div>";
  }).join("");
```

Nota: esta fila no tiene `onclick` propio en el `.mob-list-item` (a diferencia de Nómina) porque no hay acción "Ver" para una novedad — todo pasa por el "⋮", así que no hace falta `event.stopPropagation()` en el botón.

- [ ] **Step 2: Verificación manual**

DevTools en modo responsive, pestaña "Historial":
1. Lista compacta con fecha corta, nombre, detalle como subtítulo, badge de tipo.
2. "⋮" muestra "✏️ Editar" y "✕ Eliminar", cada uno hace lo mismo que su ícono equivalente en escritorio (probar editar uno de prueba, no uno real, o cancelar el modal de edición sin guardar).
3. Desktop sin cambios.

- [ ] **Step 3: Commit**

```bash
git add novedades_personal.html
git commit -m "Mobile: lista compacta para Historial (novedades de personal)"
```

---

## Self-Review

**Cobertura del spec:** las 5 tablas en alcance (Nómina×2, Distribución, Novedades/Historial×2) tienen una task cada una; el panel "⋮" y los helpers compartidos son la Task 1, consumida por las demás. Fuera de alcance (Asignación de Zonas, Carga diaria, Ranking) no tiene tasks, como corresponde.

**Placeholders:** ninguno — cada task trae el código completo (antes/después) a aplicar. Los números de línea se marcan explícitamente como "al momento de escribir este plan" y cada task pide releer el archivo antes de aplicar el cambio, ya que las tasks anteriores del mismo archivo lo van modificando.

**Consistencia:** `inicialesNombre`/`fmtDateCorta`/`abrirMenuAcciones` se usan con la misma firma en las 5 tasks que las consumen. El patrón "agregar `.mob-list-item` como hermano de `.table-row`, sin tocar este último" es idéntico en las 5 — verificado que ninguna task modifica una línea del `.table-row` existente, sólo agrega contenido nuevo después de su `</div>` de cierre.
