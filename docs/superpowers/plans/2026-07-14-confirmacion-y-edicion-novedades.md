# Confirmación al guardar novedad + edición de licencias con estado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `novedades_personal.html`, add a review-and-confirm step before any novedad is saved, and allow editing already-saved novedades — including a new `estadoLic` field (Pendiente/Aprobada/A la espera de más información/Rechazada) for Licencias.

**Architecture:** Pure client-side change to a static HTML/JS page backed by Firestore (no build step, no bundler). The existing "modal-novedad" gets a second internal view (confirm/review) toggled by CSS `display`, plus an edit entry point (`editarNovedad`) that reuses the same modal and the same save path (`window._guardarNovedad`, which already upserts by `id`/`_chunk`). A new badge helper (`badgeEstadoLic`) is added to the shared domain file `personal-dominio.js` and surfaced in three read views.

**Tech Stack:** Vanilla JS (no framework), Firebase v10 modular SDK (loaded as ES module), static HTML/CSS. **No automated test suite exists in this repo** (no `package.json`, no test runner) — verification is manual, in a browser, against the real Firestore project already configured in the local `config.js`. Each task ends with a concrete manual verification checklist instead of an automated test run.

## Global Constraints

- Estado values for licencias, exact strings (must match exactly, including accents): `"Pendiente"`, `"Aprobada"`, `"A la espera de más información"`, `"Rechazada"`. Default when creating a new licencia or when reading an old licencia with no `estadoLic`: `"Pendiente"`.
- "Licencia" type detection follows the existing convention in this codebase: `tipo.toLowerCase().includes("licencia")` — never a strict `===` check, so custom tipos containing the word still get the date-range + estado UI.
- The confirmation step (resumen + Validar/Volver) applies to **every** tipo of novedad, not just Licencia.
- Editing must **update the existing record in place** (same `id`, same `_chunk`) — never create a duplicate. This relies on `window._guardarNovedad` / `guardarRegistroChunked` in `personal-datos.js`, which is **not modified** by this plan.
- `personal-dominio.js` is shared by `novedades_personal.html`, `asignacion_zonas.html`, and `gestion_personal.html` — any change to it requires bumping its cache-busting `?v=` query string in **all three** `<script src="personal-dominio.js?v=N">` tags, or the other two pages may keep serving a stale cached copy (`Cache-Control: public, max-age=3600` per `firebase.json`).
- Follow existing code style in this file: no semicolonless ASI reliance changes, string concatenation with `+` (not template literals) in the render functions being edited, `esc()`/`escJsAttr()` from `utils.js` for anything interpolated into HTML or into an `onclick="...('...')"` attribute.

---

### Task 1: Estado-de-licencia constants and badge helper

**Files:**
- Modify: `personal-dominio.js:11-13` (add constants after `ESTADO_CLASS`)
- Modify: `personal-dominio.js:60-62` (add `badgeEstadoLic` next to `badgeNov`)
- Modify: `novedades_personal.html:365` (bump `personal-dominio.js?v=4` → `?v=5`)
- Modify: `asignacion_zonas.html:247` (bump `personal-dominio.js?v=4` → `?v=5`)
- Modify: `gestion_personal.html:188` (bump `personal-dominio.js?v=4` → `?v=5`)

**Interfaces:**
- Produces: `function badgeEstadoLic(e)` — returns an HTML `<span class="badge ...">` string, same signature style as the existing `badgeNov(tipo)` / `badgeEstado(e)` in the same file. Treats `e` falsy as `"Pendiente"`.
- Produces: `const ESTADO_LIC_CLASS` — map of estado string → CSS badge class, consumed only by `badgeEstadoLic` itself (Task 2's `<select>` and Task 4's filter `<select>` hardcode their own `<option>` list as literal HTML, matching the existing pattern in this file — e.g. `fp-estado` in `abrirModalPersona` — rather than generating options from a shared JS array).
- Consumes: nothing new (uses the existing `esc()` from `utils.js`, already loaded before this file on every page that includes it).

- [ ] **Step 1: Add the constants**

In `personal-dominio.js`, current lines 11-13 read:

```js
const NOV_CLASS    = {"Licencia":"bdg-nov-lic","Llegada tarde":"bdg-nov-tar","Retiro anticipado":"bdg-nov-ret","Ausencia":"bdg-nov-aus","Otro":"bdg-nov-otro","Presente":"bdg-nov-presente"};
const ESTADO_CLASS = {"Activo":"bdg-activo","Licencia":"bdg-licencia","Baja":"bdg-baja"};
const ZONAS_DEFAULT = ["ONCE","AVELLANEDA", ... ];
```

Insert one new line right after the `ESTADO_CLASS` line (before `ZONAS_DEFAULT`):

```js
const NOV_CLASS    = {"Licencia":"bdg-nov-lic","Llegada tarde":"bdg-nov-tar","Retiro anticipado":"bdg-nov-ret","Ausencia":"bdg-nov-aus","Otro":"bdg-nov-otro","Presente":"bdg-nov-presente"};
const ESTADO_CLASS = {"Activo":"bdg-activo","Licencia":"bdg-licencia","Baja":"bdg-baja"};
const ESTADO_LIC_CLASS = {"Pendiente":"bdg-admin","Aprobada":"bdg-activo","A la espera de más información":"bdg-nov-tar","Rechazada":"bdg-baja"};
const ZONAS_DEFAULT = ["ONCE","AVELLANEDA", ... ];
```

(Leave the `ZONAS_DEFAULT` line and its full contents untouched — only insert the new line above it.)

- [ ] **Step 2: Add the badge helper**

Current lines 60-62:

```js
function badgeTurno(t){return `<span class="badge ${TURNOS_BADGE[t]||'bdg-admin'}">${esc(t||'—')}</span>`;}
function badgeEstado(e){return `<span class="badge ${ESTADO_CLASS[e]||'bdg-activo'}">${esc(e)}</span>`;}
function badgeNov(tipo){return `<span class="badge ${NOV_CLASS[tipo]||'bdg-nov-otro'}">${esc(tipo)}</span>`;}
```

Add a new line right after `badgeNov`:

```js
function badgeTurno(t){return `<span class="badge ${TURNOS_BADGE[t]||'bdg-admin'}">${esc(t||'—')}</span>`;}
function badgeEstado(e){return `<span class="badge ${ESTADO_CLASS[e]||'bdg-activo'}">${esc(e)}</span>`;}
function badgeNov(tipo){return `<span class="badge ${NOV_CLASS[tipo]||'bdg-nov-otro'}">${esc(tipo)}</span>`;}
function badgeEstadoLic(e){return `<span class="badge ${ESTADO_LIC_CLASS[e]||'bdg-admin'}">${esc(e||'Pendiente')}</span>`;}
```

- [ ] **Step 3: Bump the cache-busting version on all three pages**

In `novedades_personal.html:365`, `asignacion_zonas.html:247`, and `gestion_personal.html:188`, change:

```html
<script src="personal-dominio.js?v=4"></script>
```
to:
```html
<script src="personal-dominio.js?v=5"></script>
```

- [ ] **Step 4: Manual verification**

Serve the project root over HTTP (module `<script>` tags don't work from `file://`), for example:

```bash
npx http-server . -p 8080
```

Open `http://localhost:8080/novedades_personal.html`, log in, open the browser devtools console, and run:

```js
badgeEstadoLic('Aprobada')
```

Expected: returns `'<span class="badge bdg-activo">Aprobada</span>'` with no console errors on page load. Also open `asignacion_zonas.html` and `gestion_personal.html` and confirm both still load without console errors (they don't use `badgeEstadoLic` yet, this just confirms the version bump didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add personal-dominio.js novedades_personal.html asignacion_zonas.html gestion_personal.html
git commit -m "Agregar estados de licencia (Pendiente/Aprobada/Espera info/Rechazada) y su badge"
```

---

### Task 2: Modal markup — confirm view, estado selector, split action rows

**Files:**
- Modify: `novedades_personal.html:280-316` (modal-novedad block)
- Modify: `novedades_personal.html:17` (`.grid-hist` column widths, to fit two action buttons in Task 4)

**Interfaces:**
- Produces (DOM ids consumed by Task 3's JS): `#mn-form-body` (wraps all form fields), `#mn-lic-estado` (hidden div containing `#mn-lic-estado-sel`, a `<select>`), `#mn-confirm-box` (hidden div containing `#mn-confirm-ficha`), `#mn-actions-form` (existing two buttons, now id'd and calling `revisarNovedad()` instead of `guardarNovedad()`), `#mn-actions-confirm` (new hidden button row: "✅ Validar y guardar" calling `confirmarGuardarNovedad()`, "← Volver" calling `volverFormNovedad()`).
- Consumes: existing CSS classes `.confirm-box`, `.ficha-grid`, `.ficha-item`, `.ficha-key`, `.ficha-val`, `.modal-actions`, `.form-field`, `.fl`, `.form-input` (all already defined in `estilo-comun.css` / the page's own `<style>` block — no new CSS classes needed for this task beyond the `.grid-hist` width tweak).

- [ ] **Step 1: Widen the Historial action column**

Current line 17:

```css
.grid-hist{grid-template-columns:90px 2fr 1fr 2fr 40px}
```

Change to:

```css
.grid-hist{grid-template-columns:90px 2fr 1fr 2fr 64px}
```

(This makes room for two small icon buttons — edit + delete — in Task 4; harmless on its own before Task 4 adds the second button.)

- [ ] **Step 2: Restructure the modal-novedad block**

Current lines 279-316:

```html
<!-- MODAL NOVEDAD -->
<div class="overlay" id="modal-novedad-overlay">
  <div class="modal">
    <button class="modal-close" onclick="cerrarModal('modal-novedad-overlay')">✕</button>
    <div class="modal-title" id="mn-title">Cargar novedad</div>
    <div class="form-field full" style="margin-bottom:12px">
      <label class="fl">Fecha de la novedad</label>
      <input type="date" class="form-input" id="mn-fecha">
    </div>
    <div class="form-field full" id="mn-persona-wrap" style="margin-bottom:12px">
      <label class="fl">Persona</label>
      <div class="autocomplete-wrap">
        <input class="form-input" id="mn-persona-input" placeholder="Escribir nombre…" oninput="filtrarPersonasAC()" autocomplete="off">
        <div class="autocomplete-list" id="mn-persona-list"></div>
      </div>
      <div id="mn-persona-seleccionada" style="display:none;background:#e8f4fd;border-radius:0;padding:8px 10px;font-size:13px;margin-top:4px;font-weight:600"></div>
    </div>
    <div style="margin-bottom:12px">
      <label class="fl">Tipo de novedad</label>
      <div class="tipo-grid" style="margin-top:6px" id="mn-tipos-grid"></div>
    </div>
    <div id="mn-lic-fechas" style="display:none;margin-bottom:12px">
      <div class="nov-info">📋 Las licencias se aplican a un rango de fechas.</div>
      <div class="lic-dates">
        <div class="form-field"><label class="fl">Inicio</label><input type="date" class="form-input" id="mn-lic-inicio"></div>
        <div class="form-field"><label class="fl">Fin</label><input type="date" class="form-input" id="mn-lic-fin"></div>
      </div>
    </div>
    <div class="form-field full" style="margin-bottom:14px">
      <label class="fl">Detalle (opcional)</label>
      <textarea class="form-input" id="mn-detalle" rows="3" placeholder="Motivo, observaciones…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-azul" onclick="guardarNovedad()">Guardar novedad</button>
      <button class="btn btn-gris" onclick="cerrarModal('modal-novedad-overlay')">Cancelar</button>
    </div>
  </div>
</div>
```

Replace the whole block with:

```html
<!-- MODAL NOVEDAD -->
<div class="overlay" id="modal-novedad-overlay">
  <div class="modal">
    <button class="modal-close" onclick="cerrarModal('modal-novedad-overlay')">✕</button>
    <div class="modal-title" id="mn-title">Cargar novedad</div>
    <div id="mn-form-body">
      <div class="form-field full" style="margin-bottom:12px">
        <label class="fl">Fecha de la novedad</label>
        <input type="date" class="form-input" id="mn-fecha">
      </div>
      <div class="form-field full" id="mn-persona-wrap" style="margin-bottom:12px">
        <label class="fl">Persona</label>
        <div class="autocomplete-wrap">
          <input class="form-input" id="mn-persona-input" placeholder="Escribir nombre…" oninput="filtrarPersonasAC()" autocomplete="off">
          <div class="autocomplete-list" id="mn-persona-list"></div>
        </div>
        <div id="mn-persona-seleccionada" style="display:none;background:#e8f4fd;border-radius:0;padding:8px 10px;font-size:13px;margin-top:4px;font-weight:600"></div>
      </div>
      <div style="margin-bottom:12px">
        <label class="fl">Tipo de novedad</label>
        <div class="tipo-grid" style="margin-top:6px" id="mn-tipos-grid"></div>
      </div>
      <div id="mn-lic-fechas" style="display:none;margin-bottom:12px">
        <div class="nov-info">📋 Las licencias se aplican a un rango de fechas.</div>
        <div class="lic-dates">
          <div class="form-field"><label class="fl">Inicio</label><input type="date" class="form-input" id="mn-lic-inicio"></div>
          <div class="form-field"><label class="fl">Fin</label><input type="date" class="form-input" id="mn-lic-fin"></div>
        </div>
      </div>
      <div id="mn-lic-estado" style="display:none;margin-bottom:12px">
        <label class="fl">Estado de la licencia</label>
        <select class="form-input" id="mn-lic-estado-sel">
          <option value="Pendiente">Pendiente</option>
          <option value="Aprobada">Aprobada</option>
          <option value="A la espera de más información">A la espera de más información</option>
          <option value="Rechazada">Rechazada</option>
        </select>
      </div>
      <div class="form-field full" style="margin-bottom:14px">
        <label class="fl">Detalle (opcional)</label>
        <textarea class="form-input" id="mn-detalle" rows="3" placeholder="Motivo, observaciones…"></textarea>
      </div>
    </div>
    <div id="mn-confirm-box" style="display:none">
      <div class="confirm-box"><strong>Revisá los datos antes de guardar:</strong></div>
      <div class="ficha-grid" id="mn-confirm-ficha"></div>
    </div>
    <div class="modal-actions" id="mn-actions-form">
      <button class="btn btn-azul" onclick="revisarNovedad()">Guardar novedad</button>
      <button class="btn btn-gris" onclick="cerrarModal('modal-novedad-overlay')">Cancelar</button>
    </div>
    <div class="modal-actions" id="mn-actions-confirm" style="display:none">
      <button class="btn btn-verde" onclick="confirmarGuardarNovedad()">✅ Validar y guardar</button>
      <button class="btn btn-gris" onclick="volverFormNovedad()">← Volver</button>
    </div>
  </div>
</div>
```

Note: this task intentionally leaves `guardarNovedad()`, `revisarNovedad()`, `confirmarGuardarNovedad()` and `volverFormNovedad()` as-yet-undefined JS functions (Task 3 defines them) — the page will show console errors on click until Task 3 lands. That's expected and fixed by the next task; don't skip the verification step below, but don't be alarmed if clicking "Guardar novedad" errors out before Task 3.

- [ ] **Step 3: Manual verification**

Serve the project and open `novedades_personal.html` (see Task 1 Step 4 for how). Log in, click "+ Cargar novedad". Expected:
- Modal opens looking the same as before (fecha, persona, tipo grid, detalle) — no visible "Estado de la licencia" field yet (still hidden).
- Click a "Licencia" tipo button: the date-range fields appear as before; the new "Estado de la licencia" selector should also become visible right below the dates (its `display:none` is only overridden by Task 3's `selTipo`, so if it stays hidden at this point, open devtools and manually run `document.getElementById('mn-lic-estado').style.display=''` to confirm the markup itself renders correctly with a 4-option select — that's enough to validate this task; full wiring lands in Task 3).
- No visual regressions in the modal layout (buttons, spacing) compared to before this change.

- [ ] **Step 4: Commit**

```bash
git add novedades_personal.html
git commit -m "Restructurar modal de novedad: vista de confirmación y selector de estado de licencia"
```

---

### Task 3: Confirmation flow + tipo-grid refactor (JS)

**Files:**
- Modify: `novedades_personal.html:868-922` (the `MODAL NOVEDAD` JS section — `abrirModalNovedad`, `filtrarPersonasAC`, `selPersonaAC`, `selTipo`, `guardarNovedad`)

**Interfaces:**
- Consumes: DOM ids from Task 2 (`#mn-form-body`, `#mn-lic-estado`, `#mn-lic-estado-sel`, `#mn-confirm-box`, `#mn-confirm-ficha`, `#mn-actions-form`, `#mn-actions-confirm`); `badgeEstadoLic(e)` and `badgeNov(tipo)` from `personal-dominio.js` (Task 1); `esc()`/`escJsAttr()` from `utils.js`; `puedeEditar()` from `personal-auth.js`; `window._guardarNovedad(nov)` from `personal-datos.js` (unchanged).
- Produces (consumed by Task 4): `function editarNovedad(id)` — looks up `window.novedades` by `id`, opens the modal pre-filled in edit mode. `let _editNovId` — module-level flag Task 4 doesn't touch directly but must know exists (nonzero means edit mode). Both `revisarNovedad()` (replaces old `guardarNovedad()` as the "Guardar novedad" button's handler) and `confirmarGuardarNovedad()` are new; nothing outside this task calls them except the Task 2 markup (`onclick` attributes already wired).
- Removes: the old `guardarNovedad()` function (fully replaced — grep the file afterward to confirm no leftover `onclick="guardarNovedad()"` references remain outside this task's edits).

- [ ] **Step 1: Replace the MODAL NOVEDAD JS section**

Current lines 868-922 (from the `// MODAL NOVEDAD` header comment through the end of the old `guardarNovedad`):

```js
// ============================================================
//  MODAL NOVEDAD
// ============================================================
let _novPersonaId=null,_novTipo=null;
function abrirModalNovedad(pid){
  _novPersonaId=pid||null;_novTipo=null;
  document.getElementById("mn-detalle").value="";
  document.getElementById("mn-fecha").value=getFecha();
  document.getElementById("mn-lic-fechas").style.display="none";
  document.getElementById("mn-lic-inicio").value=getFecha();
  document.getElementById("mn-lic-fin").value=getFecha();
  const TIPO_ICONS={"Licencia":"📋","Llegada tarde":"⏰","Retiro anticipado":"🚪","Ausencia":"❌","Otro":"📝"};
  document.getElementById("mn-tipos-grid").innerHTML=(window.tiposNovedad||[]).map((t,i)=>{
    const esLast=i===(window.tiposNovedad.length-1)&&window.tiposNovedad.length%2!==0;
    return "<button class=\"tipo-btn\" onclick=\"selTipo(this,\'"+escJsAttr(t)+"\')\" style=\""+(esLast?"grid-column:1/-1":"")+"\">"+(TIPO_ICONS[t]||"📌")+" "+esc(t)+"</button>";
  }).join("");
  const input=document.getElementById("mn-persona-input");
  const selDiv=document.getElementById("mn-persona-seleccionada");
  if(pid){const p=window.nomina.find(x=>x.id===pid);input.value="";input.style.display="none";selDiv.style.display="";selDiv.textContent=p?p.nombre:"—";}
  else{input.value="";input.style.display="";selDiv.style.display="none";_novPersonaId=null;}
  document.getElementById("mn-title").textContent="Cargar novedad";
  document.getElementById("modal-novedad-overlay").classList.add("open");
}
function filtrarPersonasAC(){
  const q=(document.getElementById("mn-persona-input").value||"").toLowerCase();
  const list=document.getElementById("mn-persona-list");
  if(!q||q.length<2){list.classList.remove("open");return;}
  const res=window.nomina.filter(p=>p.estado!=="Baja"&&(p.nombre.toLowerCase().includes(q)||(p.dni||"").includes(q))).slice(0,10);
  if(!res.length){list.classList.remove("open");return;}
  list.innerHTML=res.map(p=>"<div class=\"autocomplete-item\" onclick=\"selPersonaAC(\'"+p.id+"\',\'"+escJsAttr(p.nombre)+"\')\" >"+esc(p.nombre)+" <span style=\"color:#888;font-size:11px\">"+esc(p.rol||"")+"</span></div>").join("");
  list.classList.add("open");
}
function selPersonaAC(id,nombre){_novPersonaId=id;document.getElementById("mn-persona-input").value=nombre;document.getElementById("mn-persona-list").classList.remove("open");}
function selTipo(btn,tipo){_novTipo=tipo;document.querySelectorAll(".tipo-btn").forEach(b=>b.classList.remove("sel"));btn.classList.add("sel");document.getElementById("mn-lic-fechas").style.display=tipo.toLowerCase().includes("licencia")?"":"none";}
async function guardarNovedad(){
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  if(!_novPersonaId){alert("Seleccioná una persona.");return;}
  if(!_novTipo){alert("Seleccioná el tipo.");return;}
  const fechaNov=document.getElementById("mn-fecha").value||getFecha();
  const nov={id:Date.now().toString(),personaId:_novPersonaId,fecha:fechaNov,tipo:_novTipo,detalle:(document.getElementById("mn-detalle").value||"").trim()};
  if(_novTipo.toLowerCase().includes("licencia")){
    const ini=document.getElementById("mn-lic-inicio").value;
    const fin=document.getElementById("mn-lic-fin").value;
    if(!ini||!fin){alert("Completá las fechas.");return;}
    if(fin<ini){alert("La fecha de fin debe ser igual o posterior al inicio.");return;}
    nov.licIni=ini;nov.licFin=fin;
  }
  window.novedades.push(nov);
  cerrarModal("modal-novedad-overlay");
  renderAll();
  try{
    await window._guardarNovedad(nov);
    toast("✅ Novedad guardada");
  }catch(e){toast("❌ Error al guardar: "+e.message,4000);console.error(e);}
}
```

Replace it entirely with:

```js
// ============================================================
//  MODAL NOVEDAD
// ============================================================
const TIPO_ICONS={"Licencia":"📋","Llegada tarde":"⏰","Retiro anticipado":"🚪","Ausencia":"❌","Otro":"📝"};
let _novPersonaId=null,_novTipo=null,_editNovId=null,_novPendiente=null;

function renderTiposGrid(tipoSel){
  document.getElementById("mn-tipos-grid").innerHTML=(window.tiposNovedad||[]).map((t,i)=>{
    const esLast=i===(window.tiposNovedad.length-1)&&window.tiposNovedad.length%2!==0;
    const sel=t===tipoSel?" sel":"";
    return "<button class=\"tipo-btn"+sel+"\" onclick=\"selTipo(this,\'"+escJsAttr(t)+"\')\" style=\""+(esLast?"grid-column:1/-1":"")+"\">"+(TIPO_ICONS[t]||"📌")+" "+esc(t)+"</button>";
  }).join("");
}
function mostrarVistaForm(){
  document.getElementById("mn-form-body").style.display="";
  document.getElementById("mn-confirm-box").style.display="none";
  document.getElementById("mn-actions-form").style.display="flex";
  document.getElementById("mn-actions-confirm").style.display="none";
}
function abrirModalNovedad(pid){
  _novPersonaId=pid||null;_novTipo=null;_editNovId=null;_novPendiente=null;
  document.getElementById("mn-detalle").value="";
  document.getElementById("mn-fecha").value=getFecha();
  document.getElementById("mn-lic-fechas").style.display="none";
  document.getElementById("mn-lic-inicio").value=getFecha();
  document.getElementById("mn-lic-fin").value=getFecha();
  document.getElementById("mn-lic-estado").style.display="none";
  document.getElementById("mn-lic-estado-sel").value="Pendiente";
  renderTiposGrid(null);
  const input=document.getElementById("mn-persona-input");
  const selDiv=document.getElementById("mn-persona-seleccionada");
  if(pid){const p=window.nomina.find(x=>x.id===pid);input.value="";input.style.display="none";selDiv.style.display="";selDiv.textContent=p?p.nombre:"—";}
  else{input.value="";input.style.display="";selDiv.style.display="none";_novPersonaId=null;}
  document.getElementById("mn-title").textContent="Cargar novedad";
  mostrarVistaForm();
  document.getElementById("modal-novedad-overlay").classList.add("open");
}
function editarNovedad(id){
  const n=window.novedades.find(x=>x.id===id);
  if(!n)return;
  _editNovId=id;_novPersonaId=n.personaId;_novTipo=n.tipo;_novPendiente=null;
  document.getElementById("mn-detalle").value=n.detalle||"";
  document.getElementById("mn-fecha").value=n.fecha||getFecha();
  const esLic=n.tipo.toLowerCase().includes("licencia");
  document.getElementById("mn-lic-fechas").style.display=esLic?"":"none";
  document.getElementById("mn-lic-inicio").value=n.licIni||getFecha();
  document.getElementById("mn-lic-fin").value=n.licFin||getFecha();
  document.getElementById("mn-lic-estado").style.display=esLic?"":"none";
  document.getElementById("mn-lic-estado-sel").value=n.estadoLic||"Pendiente";
  renderTiposGrid(n.tipo);
  const p=window.nomina.find(x=>x.id===n.personaId);
  document.getElementById("mn-persona-input").style.display="none";
  const selDiv=document.getElementById("mn-persona-seleccionada");
  selDiv.style.display="";selDiv.textContent=p?p.nombre:"—";
  document.getElementById("mn-title").textContent="Editar novedad";
  mostrarVistaForm();
  document.getElementById("modal-novedad-overlay").classList.add("open");
}
function filtrarPersonasAC(){
  const q=(document.getElementById("mn-persona-input").value||"").toLowerCase();
  const list=document.getElementById("mn-persona-list");
  if(!q||q.length<2){list.classList.remove("open");return;}
  const res=window.nomina.filter(p=>p.estado!=="Baja"&&(p.nombre.toLowerCase().includes(q)||(p.dni||"").includes(q))).slice(0,10);
  if(!res.length){list.classList.remove("open");return;}
  list.innerHTML=res.map(p=>"<div class=\"autocomplete-item\" onclick=\"selPersonaAC(\'"+p.id+"\',\'"+escJsAttr(p.nombre)+"\')\" >"+esc(p.nombre)+" <span style=\"color:#888;font-size:11px\">"+esc(p.rol||"")+"</span></div>").join("");
  list.classList.add("open");
}
function selPersonaAC(id,nombre){_novPersonaId=id;document.getElementById("mn-persona-input").value=nombre;document.getElementById("mn-persona-list").classList.remove("open");}
function selTipo(btn,tipo){
  _novTipo=tipo;
  document.querySelectorAll(".tipo-btn").forEach(b=>b.classList.remove("sel"));
  btn.classList.add("sel");
  const esLic=tipo.toLowerCase().includes("licencia");
  document.getElementById("mn-lic-fechas").style.display=esLic?"":"none";
  document.getElementById("mn-lic-estado").style.display=esLic?"":"none";
}
function revisarNovedad(){
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  if(!_novPersonaId){alert("Seleccioná una persona.");return;}
  if(!_novTipo){alert("Seleccioná el tipo.");return;}
  const fechaNov=document.getElementById("mn-fecha").value||getFecha();
  const nov={id:_editNovId||Date.now().toString(),personaId:_novPersonaId,fecha:fechaNov,tipo:_novTipo,detalle:(document.getElementById("mn-detalle").value||"").trim()};
  if(_novTipo.toLowerCase().includes("licencia")){
    const ini=document.getElementById("mn-lic-inicio").value;
    const fin=document.getElementById("mn-lic-fin").value;
    if(!ini||!fin){alert("Completá las fechas.");return;}
    if(fin<ini){alert("La fecha de fin debe ser igual o posterior al inicio.");return;}
    nov.licIni=ini;nov.licFin=fin;
    nov.estadoLic=document.getElementById("mn-lic-estado-sel").value||"Pendiente";
  }
  if(_editNovId){
    const original=window.novedades.find(x=>x.id===_editNovId);
    if(original&&original._chunk!==undefined) nov._chunk=original._chunk;
  }
  _novPendiente=nov;
  renderConfirmNovedad(nov);
  document.getElementById("mn-form-body").style.display="none";
  document.getElementById("mn-confirm-box").style.display="";
  document.getElementById("mn-actions-form").style.display="none";
  document.getElementById("mn-actions-confirm").style.display="flex";
}
function renderConfirmNovedad(nov){
  const p=window.nomina.find(x=>x.id===nov.personaId)||{};
  const filas=[
    ["Persona",esc(p.nombre||"—")],
    ["Tipo",badgeNov(nov.tipo)],
    ["Fecha",nov.licIni?fmtDate(nov.licIni)+" → "+fmtDate(nov.licFin):fmtDate(nov.fecha)],
  ];
  if(nov.estadoLic) filas.push(["Estado",badgeEstadoLic(nov.estadoLic)]);
  filas.push(["Detalle",nov.detalle?esc(nov.detalle):"—"]);
  document.getElementById("mn-confirm-ficha").innerHTML=filas.map(([k,v])=>
    "<div class=\"ficha-item\"><div class=\"ficha-key\">"+k+"</div><div class=\"ficha-val\">"+v+"</div></div>"
  ).join("");
}
function volverFormNovedad(){
  mostrarVistaForm();
}
async function confirmarGuardarNovedad(){
  if(!_novPendiente)return;
  const nov=_novPendiente;
  if(_editNovId){
    const idx=window.novedades.findIndex(x=>x.id===_editNovId);
    if(idx>=0) window.novedades[idx]=nov; else window.novedades.push(nov);
  } else {
    window.novedades.push(nov);
  }
  cerrarModal("modal-novedad-overlay");
  renderAll();
  try{
    await window._guardarNovedad(nov);
    toast("✅ Novedad guardada");
  }catch(e){toast("❌ Error al guardar: "+e.message,4000);console.error(e);}
  _novPendiente=null;
}
```

- [ ] **Step 2: Manual verification — create flow**

Serve the project (see Task 1 Step 4) and open `novedades_personal.html`, logged in as a user with edit rights. In the "Novedades del día" panel:

1. Click "+ Cargar novedad", pick a persona, pick tipo "Ausencia", leave detalle empty, click "Guardar novedad".
   - Expected: the form disappears, a "Revisá los datos antes de guardar" box appears showing Persona / Tipo badge / Fecha / Detalle "—", and the buttons change to "✅ Validar y guardar" / "← Volver". Nothing is saved yet (check the "Novedades activas" list behind the modal — unchanged).
2. Click "← Volver". Expected: form reappears with the same persona/tipo/fecha still selected (not reset).
3. Click "Guardar novedad" again, then "✅ Validar y guardar". Expected: modal closes, toast "✅ Novedad guardada", the new Ausencia appears in "Novedades activas" for today.
4. Repeat with tipo "Licencia": after picking a date range and clicking "Guardar novedad", the confirm box must show an "Estado" row with a "Pendiente" badge, and the "Fecha" row must show the date range (`dd/mm/yyyy → dd/mm/yyyy`), not a single date. Confirm and check it lands correctly.
5. Check the browser console for errors throughout — expect none.

- [ ] **Step 3: Commit**

```bash
git add novedades_personal.html
git commit -m "Agregar paso de confirmación (Validar/Volver) antes de guardar una novedad"
```

---

### Task 4: Edit entry points, estado badges, and Historial estado filter

**Files:**
- Modify: `novedades_personal.html:512-541` (`renderNovedades` — nov-hoy-list rendering)
- Modify: `novedades_personal.html:171-181` (Historial toolbar — add estado `<select>`)
- Modify: `novedades_personal.html:640-654` (`historialFiltrado`)
- Modify: `novedades_personal.html:667-673` (`limpiarFiltrosHistorial`)
- Modify: `novedades_personal.html:699-710` (`renderHistorial` — hist-body rendering)
- Modify: `novedades_personal.html:1080-1083` (`abrirModalVer` — mv-novs rendering)

**Interfaces:**
- Consumes: `editarNovedad(id)` and `badgeEstadoLic(e)` from Tasks 1 & 3 (already defined by the time this task runs).
- No new exported interfaces — this task only touches rendering functions that are page-internal (called from `onclick`/`onchange` attributes already present in the page, or from `renderAll()`/`_cambiarTabExtra`).

- [ ] **Step 1: Add edit button + estado badge to "Novedades activas del día"**

Current lines 526-540 (inside `renderNovedades`):

```js
  document.getElementById("nov-hoy-list").innerHTML=novHoy.length?
    novHoy.map(n=>{
      const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"Desconocido"};
      const extra=n.licIni?" ("+fmtDate(n.licIni)+" al "+fmtDate(n.licFin)+")":"";
      return "<div style=\"background:#f9f9f9;border:1px solid var(--bor);border-radius:0;padding:10px 14px;display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap\">"
        +"<span style=\"font-weight:700;font-size:13px\">"+esc(p.nombre)+"</span>"
        +badgeTurno(p.turno)
        +(p.rol?"<span style=\"font-size:11px;color:#666\">"+esc(p.rol)+"</span>":"")
        +badgeNov(n.tipo)
        +(extra?"<span style=\"font-size:12px;color:#555\">"+esc(extra)+"</span>":"")
        +(n.detalle?"<span style=\"font-size:12px;color:#555\">"+esc(n.detalle)+"</span>":"")
        +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"margin-left:auto;background:none;border:none;color:#c0392b;font-size:14px;cursor:pointer\">✕</button>"
        +"</div>";
    }).join("")
    :"<div style=\"color:#aaa;font-size:13px;padding:8px 0\">Sin novedades activas para hoy.</div>";
```

Replace with:

```js
  document.getElementById("nov-hoy-list").innerHTML=novHoy.length?
    novHoy.map(n=>{
      const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"Desconocido"};
      const extra=n.licIni?" ("+fmtDate(n.licIni)+" al "+fmtDate(n.licFin)+")":"";
      return "<div style=\"background:#f9f9f9;border:1px solid var(--bor);border-radius:0;padding:10px 14px;display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap\">"
        +"<span style=\"font-weight:700;font-size:13px\">"+esc(p.nombre)+"</span>"
        +badgeTurno(p.turno)
        +(p.rol?"<span style=\"font-size:11px;color:#666\">"+esc(p.rol)+"</span>":"")
        +badgeNov(n.tipo)
        +(n.estadoLic?badgeEstadoLic(n.estadoLic):"")
        +(extra?"<span style=\"font-size:12px;color:#555\">"+esc(extra)+"</span>":"")
        +(n.detalle?"<span style=\"font-size:12px;color:#555\">"+esc(n.detalle)+"</span>":"")
        +"<span style=\"margin-left:auto;display:flex;gap:8px\">"
        +"<button onclick=\"editarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#2563a8;font-size:14px;cursor:pointer\">✏️</button>"
        +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#c0392b;font-size:14px;cursor:pointer\">✕</button>"
        +"</span>"
        +"</div>";
    }).join("")
    :"<div style=\"color:#aaa;font-size:13px;padding:8px 0\">Sin novedades activas para hoy.</div>";
```

- [ ] **Step 2: Add the estado filter to the Historial toolbar**

Current lines 171-181:

```html
  <div class="toolbar">
    <button class="btn btn-verde" onclick="exportarHistorialNovedades()">⬇ Exportar historial Excel</button>
    <input class="search-input" id="hist-buscar" placeholder="🔍 Buscar…" oninput="renderHistorial()" style="flex:0 1 200px">
    <div class="autocomplete-wrap" id="hist-tipo-wrap" style="min-width:150px">
      <button type="button" class="btn btn-gris btn-sm" style="width:100%;text-align:left" onclick="toggleHistTipoDropdown(event)" id="hist-tipo-btn">Todos los tipos ▾</button>
      <div class="autocomplete-list" id="hist-tipo-list"></div>
    </div>
    <label style="font-size:.78rem;color:#777;display:flex;align-items:center;gap:4px">Desde<input type="date" class="pinput" id="hist-desde" onchange="renderHistorial()"></label>
    <label style="font-size:.78rem;color:#777;display:flex;align-items:center;gap:4px">Hasta<input type="date" class="pinput" id="hist-hasta" onchange="renderHistorial()"></label>
    <button class="btn btn-gris btn-sm" onclick="limpiarFiltrosHistorial()">✕ Limpiar filtros</button>
  </div>
```

Replace with (adds one `<select>` right after the tipo dropdown):

```html
  <div class="toolbar">
    <button class="btn btn-verde" onclick="exportarHistorialNovedades()">⬇ Exportar historial Excel</button>
    <input class="search-input" id="hist-buscar" placeholder="🔍 Buscar…" oninput="renderHistorial()" style="flex:0 1 200px">
    <div class="autocomplete-wrap" id="hist-tipo-wrap" style="min-width:150px">
      <button type="button" class="btn btn-gris btn-sm" style="width:100%;text-align:left" onclick="toggleHistTipoDropdown(event)" id="hist-tipo-btn">Todos los tipos ▾</button>
      <div class="autocomplete-list" id="hist-tipo-list"></div>
    </div>
    <select class="ctrl" id="hist-estado" onchange="renderHistorial()" style="min-width:170px">
      <option value="">Todos los estados</option>
      <option value="Pendiente">Pendiente</option>
      <option value="Aprobada">Aprobada</option>
      <option value="A la espera de más información">A la espera de más información</option>
      <option value="Rechazada">Rechazada</option>
    </select>
    <label style="font-size:.78rem;color:#777;display:flex;align-items:center;gap:4px">Desde<input type="date" class="pinput" id="hist-desde" onchange="renderHistorial()"></label>
    <label style="font-size:.78rem;color:#777;display:flex;align-items:center;gap:4px">Hasta<input type="date" class="pinput" id="hist-hasta" onchange="renderHistorial()"></label>
    <button class="btn btn-gris btn-sm" onclick="limpiarFiltrosHistorial()">✕ Limpiar filtros</button>
  </div>
```

- [ ] **Step 3: Wire the estado filter into `historialFiltrado()`**

Current lines 640-654:

```js
function historialFiltrado(){
  const busq=(document.getElementById("hist-buscar").value||"").toLowerCase();
  const tiposSel=tiposHistSeleccionados();
  const desde=document.getElementById("hist-desde")?.value||"";
  const hasta=document.getElementById("hist-hasta")?.value||"";

  return [...window.novedades].reverse().filter(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{};
    if(busq&&!(p.nombre||"").toLowerCase().includes(busq))return false;
    if(tiposSel.length&&!tiposSel.includes(n.tipo))return false;
    if(desde&&n.fecha<desde)return false;
    if(hasta&&n.fecha>hasta)return false;
    return true;
  });
}
```

Replace with:

```js
function historialFiltrado(){
  const busq=(document.getElementById("hist-buscar").value||"").toLowerCase();
  const tiposSel=tiposHistSeleccionados();
  const desde=document.getElementById("hist-desde")?.value||"";
  const hasta=document.getElementById("hist-hasta")?.value||"";
  const filtEstado=document.getElementById("hist-estado")?.value||"";

  return [...window.novedades].reverse().filter(n=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{};
    if(busq&&!(p.nombre||"").toLowerCase().includes(busq))return false;
    if(tiposSel.length&&!tiposSel.includes(n.tipo))return false;
    if(desde&&n.fecha<desde)return false;
    if(hasta&&n.fecha>hasta)return false;
    if(filtEstado&&(n.estadoLic||"Pendiente")!==filtEstado)return false;
    return true;
  });
}
```

- [ ] **Step 4: Reset the estado filter in `limpiarFiltrosHistorial()`**

Current lines 667-673:

```js
function limpiarFiltrosHistorial(){
  document.getElementById("hist-buscar").value="";
  document.getElementById("hist-tipo-list").querySelectorAll("input").forEach(i=>i.checked=false);
  document.getElementById("hist-desde").value="";
  document.getElementById("hist-hasta").value="";
  renderHistorial();
}
```

Replace with:

```js
function limpiarFiltrosHistorial(){
  document.getElementById("hist-buscar").value="";
  document.getElementById("hist-tipo-list").querySelectorAll("input").forEach(i=>i.checked=false);
  document.getElementById("hist-desde").value="";
  document.getElementById("hist-hasta").value="";
  document.getElementById("hist-estado").value="";
  renderHistorial();
}
```

- [ ] **Step 5: Add edit button + estado badge to the Historial table rows**

Current lines 699-710 (inside `renderHistorial`):

```js
  document.getElementById("hist-body").innerHTML=hist.map((n,i)=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"—"};
    const extra=n.licIni?fmtDate(n.licIni)+"→"+fmtDate(n.licFin):"";
    return "<div class=\"table-row grid-hist\" style=\""+(i%2===0?"":"background:#fafafa")+";\">"
      +"<span style=\"font-size:12px;color:#777\">"+fmtDate(n.fecha)+"</span>"
      +"<span style=\"font-size:13px;font-weight:600\">"+esc(p.nombre)+"</span>"
      +badgeNov(n.tipo)
      +"<span style=\"font-size:12px;color:#555\">"+esc(n.detalle||extra||"—")+"</span>"
      +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#c0392b;cursor:pointer;font-size:13px\">✕</button>"
      +"</div>";
  }).join("");
```

Replace with:

```js
  document.getElementById("hist-body").innerHTML=hist.map((n,i)=>{
    const p=window.nomina.find(x=>x.id===n.personaId)||{nombre:"—"};
    const extra=n.licIni?fmtDate(n.licIni)+"→"+fmtDate(n.licFin):"";
    const detalleTxt=[extra,n.detalle].filter(Boolean).map(esc).join(" · ")||"—";
    const estadoBadge=n.estadoLic?badgeEstadoLic(n.estadoLic):"";
    return "<div class=\"table-row grid-hist\" style=\""+(i%2===0?"":"background:#fafafa")+";\">"
      +"<span style=\"font-size:12px;color:#777\">"+fmtDate(n.fecha)+"</span>"
      +"<span style=\"font-size:13px;font-weight:600\">"+esc(p.nombre)+"</span>"
      +badgeNov(n.tipo)
      +"<span style=\"font-size:12px;color:#555\">"+estadoBadge+" "+detalleTxt+"</span>"
      +"<span style=\"display:flex;gap:4px\">"
      +"<button onclick=\"editarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#2563a8;cursor:pointer;font-size:13px\">✏️</button>"
      +"<button onclick=\"borrarNovedad(\'"+n.id+"\')\" style=\"background:none;border:none;color:#c0392b;cursor:pointer;font-size:13px\">✕</button>"
      +"</span>"
      +"</div>";
  }).join("");
```

- [ ] **Step 6: Add estado badge to "Ver persona" → Novedades recientes**

Current lines 1080-1083:

```js
  const novP=[...window.novedades].filter(n=>n.personaId===id).reverse().slice(0,10);
  document.getElementById("mv-novs").innerHTML=novP.length?
    novP.map(n=>"<div class=\"hist-row\">"+badgeNov(n.tipo)+" <strong>"+fmtDate(n.fecha)+"</strong>"+(n.licIni?" ("+fmtDate(n.licIni)+"→"+fmtDate(n.licFin)+")":"")+(n.detalle?" · "+esc(n.detalle):"")+"</div>").join("")
    :"<div style=\"color:#aaa;font-size:12px\">Sin novedades.</div>";
```

Replace with:

```js
  const novP=[...window.novedades].filter(n=>n.personaId===id).reverse().slice(0,10);
  document.getElementById("mv-novs").innerHTML=novP.length?
    novP.map(n=>"<div class=\"hist-row\">"+badgeNov(n.tipo)+(n.estadoLic?" "+badgeEstadoLic(n.estadoLic):"")+" <strong>"+fmtDate(n.fecha)+"</strong>"+(n.licIni?" ("+fmtDate(n.licIni)+"→"+fmtDate(n.licFin)+")":"")+(n.detalle?" · "+esc(n.detalle):"")+"</div>").join("")
    :"<div style=\"color:#aaa;font-size:12px\">Sin novedades.</div>";
```

- [ ] **Step 7: Manual verification**

Serve the project and open `novedades_personal.html`, logged in as a user with edit rights.

1. In "Novedades activas del día", find a Licencia entry (or create one via Task 3's flow) and click ✏️. Expected: modal opens titled "Editar novedad", persona shown read-only, tipo/fecha-range/detalle pre-filled, and "Estado de la licencia" pre-filled with its current value (or "Pendiente" if it had none).
2. Change the estado to "Aprobada", click "Guardar novedad" → confirm box shows "Estado: Aprobada" badge → click "✅ Validar y guardar". Expected: modal closes, the same entry (not a new duplicate one) now shows the green "Aprobada" badge in "Novedades activas del día".
3. Go to the "Historial" tab. Expected: the same entry shows the "Aprobada" badge next to its detail text. Use the new "Todos los estados" select, pick "Aprobada" — the row stays visible; pick "Rechazada" — the row disappears; pick "Todos los estados" again — it reappears. Click "✕ Limpiar filtros" and confirm the estado select resets to "Todos los estados".
4. Click ✏️ on a non-Licencia row in Historial (e.g. an Ausencia) — confirm it opens in edit mode with no "Estado de la licencia" field, change the "Detalle" text, save, and confirm the row updates in place (still one row, not duplicated) and the date/tipo elsewhere (Novedades activas, if same day) reflect the new detalle.
5. Open "Ver persona" (👁) for the same person from the Nómina tab and confirm the "Novedades recientes" list shows the estado badge next to the Licencia entry.
6. Log out and back in as (or simulate) a read-only user if one exists in this deployment, and confirm clicking "✅ Validar y guardar" on an edit shows the "🔒 Sólo lectura" toast instead of saving (this exercises the existing `puedeEditar()` gate inside `revisarNovedad()`, unchanged by this task but worth confirming end-to-end).
7. Check the browser console for errors throughout — expect none.

- [ ] **Step 8: Commit**

```bash
git add novedades_personal.html
git commit -m "Permitir editar novedades y mostrar estado de licencia en las listas y el historial"
```

---

### Task 5: Full cross-feature smoke test

**Files:** none (verification-only task; no code changes).

**Interfaces:** N/A.

- [ ] **Step 1: End-to-end manual walkthrough**

With the project served locally and logged in as an editor, in a single session on `novedades_personal.html`:

1. Create a new Licencia for a person via "+ Cargar novedad" → confirm review box → Validar. Confirm it appears with a "Pendiente" badge everywhere (Novedades activas, Historial, Ver persona).
2. Edit that same Licencia via ✏️ from Historial, change estado to "A la espera de más información", save. Confirm the orange badge shows up in all three places and there is still exactly one record for it (check Historial isn't showing two rows for the same date range).
3. Edit it again, change estado to "Rechazada", save. Confirm the red badge.
4. Create a plain "Ausencia" novedad and confirm the review step still shows (no Estado row) and the delete (✕) and edit (✏️) buttons both work on it afterward.
5. Reload the page fully (hard refresh) and confirm all the above persisted correctly by reading it back from Firestore (i.e. it survived a reload, not just local state).
6. Open `asignacion_zonas.html` and `gestion_personal.html` once each and confirm no console errors from the `personal-dominio.js?v=5` bump (Task 1).

- [ ] **Step 2: Report results**

If every check in Step 1 passes, the feature is complete. If any check fails, note which numbered check failed and go back to the corresponding task (1-4) to fix before considering this plan done — do not commit a "fix" as part of this task; re-open the relevant earlier task.

---
