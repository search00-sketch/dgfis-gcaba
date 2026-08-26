# Carga masiva de relevamientos desde WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `relevamientos_operativos.html`, add a sub-view inside the "Carga" tab that lets someone upload a WhatsApp chat export (`.zip`, with media), automatically turns each photo message into a candidate relevamiento (address parsed from the caption below the photo), shows an editable review table before saving anything, and then saves each row through the same geocoding + Drive-upload + Firestore pipeline the individual form already uses.

**Architecture:** Pure client-side addition to a static HTML/JS page (no backend of its own, no build step). JSZip (new CDN dependency) unpacks the `.zip` in the browser; a small set of pure parsing functions turn the chat `.txt` into candidate rows; a review table (plain DOM strings, same style as the rest of the file) lets the user edit/deselect rows; saving reuses `geocodificarDireccionRel`, `comprimirImagenRel`, the existing `RELEVAMIENTOS_FOTO_ENDPOINT` Apps Script call, and `guardarRelevamientoChunked` unchanged.

**Tech Stack:** Vanilla JS (no framework), Firebase v10 modular SDK, JSZip 3.10.1 (new, via CDN). **No automated test suite exists in this repo** (no `package.json`, no test runner). Verification is manual: pure parsing logic is checked in the browser devtools console against real chat-export text; the zip/save flow is checked against a small synthetic `.zip` built with PowerShell, uploaded through the real page running against the real Firestore project already configured in `config.js` (there is no emulator in this project — see the warning in Task 4).

## Global Constraints

- Follow the file's existing style throughout: string concatenation with `+` (no template literals) in any function that builds HTML, `esc()` from `utils.js` for anything interpolated into HTML or into an attribute value, index-based inline `onclick`/`onchange`/`oninput` handlers (same pattern as `renombrarRelZona(i,this.textContent)`).
- All new function/variable names end in `Rel` (matches every existing helper in this file: `geocodificarDireccionRel`, `expandirAbreviaturasRel`, `renderMapaRel`, etc.).
- New Firestore field on a relevamiento document: `origenArchivo` (string, optional) — the WhatsApp image filename that produced the record. Never required, never validated; only used to detect "already imported" on a later import.
- Never call `guardarRelevamientoChunked` twice for the same imported row (would create a duplicate Firestore document) — a row whose `estadoGuardado` is already `"ok"` or `"sin-geo"` must be skipped on any later save pass.
- `RELEVAMIENTOS_FOTO_ENDPOINT` / `RELEVAMIENTOS_FOTO_TOKEN` (from `config.js`) and Firestore (`dgfis-gcaba` project) are **live production infrastructure** — there is no emulator. Manual verification that reaches the save step must use an obviously fake Zona/Temática and clean up the test records afterward (see Task 4).
- No other file is touched — this entire feature lives in `relevamientos_operativos.html`.

---

### Task 1: Sub-view skeleton inside "Carga" (Individual / Importar desde WhatsApp)

**Files:**
- Modify: `relevamientos_operativos.html:42-45` (CSS — new rules for the review table)
- Modify: `relevamientos_operativos.html:187-216` (the `<!-- PANEL CARGA -->` block)
- Modify: `relevamientos_operativos.html:463-473` (`poblarSelectsRel`)
- Modify: `relevamientos_operativos.html:862-864` (insert `cambiarVistaCargaRel` between `cambiarEstadoRelDesdeDetalle` and the "CARGA" section header)
- Modify: `relevamientos_operativos.html:891-919` (`editarRelevamiento` — force back to the individual sub-view)

**Interfaces:**
- Produces (consumed by Tasks 2-4): DOM ids `rc-panel-individual`, `rc-panel-whatsapp`, `rc-view-btn-individual`, `rc-view-btn-whatsapp`, `rcw-zona`, `rcw-tematica`, `rcw-zip`, `rcw-analizar-btn`, `rcw-resultado`, `rcw-resumen`, `rcw-tabla`, `rcw-guardar-btn`. Two of these (`onclick="analizarChatWhatsappRel()"` on `rcw-analizar-btn`, `onclick="guardarImportWhatsappRel()"` on `rcw-guardar-btn`) reference functions that don't exist until Tasks 3 and 4 — expected, matches how this codebase's own plans stage markup ahead of its JS (see `docs/superpowers/plans/2026-07-14-confirmacion-y-edicion-novedades.md` Task 2).
- Produces: `function cambiarVistaCargaRel(modo)` — `modo` is `"individual"` or `"whatsapp"`.
- Consumes: nothing new — `esc()`, `puedeEditar()`, existing `.rlv-viewbtn`/`.rlv-viewbtn.active` CSS classes, `window.relZonas`/`window.relTematicas` (already populated by `cargarConfigRel()`).

- [ ] **Step 1: Add CSS for the review table**

Current lines 42-45:

```css
.rlv-viewbtn{border:1.5px solid var(--bor);background:#fff;padding:6px 12px;font-size:.82rem;font-weight:600;cursor:pointer}
.rlv-viewbtn.active{background:var(--azul);color:#fff;border-color:var(--azul)}

.ficha-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
```

Replace with:

```css
.rlv-viewbtn{border:1.5px solid var(--bor);background:#fff;padding:6px 12px;font-size:.82rem;font-weight:600;cursor:pointer}
.rlv-viewbtn.active{background:var(--azul);color:#fff;border-color:var(--azul)}

.rcw-row{display:grid;grid-template-columns:28px 56px 150px 1fr 220px;gap:10px;align-items:center;padding:6px 4px;border-bottom:1px solid var(--bor);font-size:.8rem}
.rcw-row:last-child{border-bottom:none}
.rcw-thumb{width:48px;height:48px;object-fit:cover;background:var(--gris);display:block}
.rcw-tabla{max-height:520px;overflow-y:auto;overflow-x:auto;border:1.5px solid var(--bor);margin-top:2px}
.rcw-origen{font-size:.7rem;color:#888;line-height:1.3}

.ficha-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
```

- [ ] **Step 2: Restructure the PANEL CARGA block**

Current lines 187-216:

```html
<!-- PANEL CARGA -->
<div class="panel" id="panel-carga">
  <div class="gestion-zonas">
    <div class="gz-title" id="rc-title">📥 Cargar relevamiento</div>
    <div class="rc-grid">
      <div class="form-field"><label class="fl">Fecha</label><input type="date" class="form-input" id="rc-fecha"></div>
      <div class="form-field"><label class="fl">Ubicación / Zona</label><select class="form-input" id="rc-zona"><option value="">Seleccionar…</option></select></div>
      <div class="form-field full">
        <label class="fl">Dirección</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" class="form-input" id="rc-direccion" placeholder="Calle y altura, punto de referencia…" style="flex:1">
          <button type="button" class="btn btn-gris btn-sm" id="rc-ubicacion-btn" onclick="validarDireccionRel()" title="Busca la dirección y confirma sus coordenadas — no depende de dónde estés parado">🔍 Validar dirección</button>
        </div>
        <div id="rc-ubicacion-estado" style="font-size:.74rem;color:#888;margin-top:4px"></div>
      </div>
      <div class="form-field"><label class="fl">Temática</label><select class="form-input" id="rc-tematica"><option value="">Seleccionar…</option></select></div>
      <div class="form-field"><label class="fl">Foto</label><input type="file" accept="image/*" class="form-input" id="rc-foto" onchange="previewFotoRel(this)"></div>
      <div class="form-field"><label class="fl">Foodtruck</label><select class="form-input" id="rc-foodtruck"><option value="No">No</option><option value="Si">Sí</option></select></div>
      <div class="form-field"><label class="fl">Conexión eléctrica</label><select class="form-input" id="rc-conexion"><option value="No">No</option><option value="Si">Sí</option><option value="Precaria">Precaria</option></select></div>
      <div class="form-field"><label class="fl">Patente</label><select class="form-input" id="rc-patente"><option value="No">No</option><option value="Si">Sí</option></select></div>
      <div class="form-field"><label class="fl">Estado</label><select class="form-input" id="rc-estado"><option value="Pendiente">Pendiente</option><option value="Realizado">Realizado</option><option value="Intimado">Intimado</option></select></div>
    </div>
    <div id="rc-foto-preview" style="display:none;margin:12px 0"></div>
    <div class="form-field full" style="margin:14px 0">
      <label class="fl">Observaciones</label>
      <textarea class="form-input" id="rc-observaciones" rows="4" placeholder="Detalle libre…"></textarea>
    </div>
    <button class="btn btn-verde" id="rc-guardar-btn" onclick="guardarRelevamiento()">💾 Guardar relevamiento</button>
  </div>
</div>
```

Replace with:

```html
<!-- PANEL CARGA -->
<div class="panel" id="panel-carga">
  <div class="gestion-zonas">
    <div class="gz-title" id="rc-title">📥 Cargar relevamiento</div>
    <div style="margin-bottom:14px">
      <button class="rlv-viewbtn active" id="rc-view-btn-individual" onclick="cambiarVistaCargaRel('individual')">📝 Individual</button>
      <button class="rlv-viewbtn" id="rc-view-btn-whatsapp" onclick="cambiarVistaCargaRel('whatsapp')">📦 Importar desde WhatsApp</button>
    </div>
    <div id="rc-panel-individual">
      <div class="rc-grid">
        <div class="form-field"><label class="fl">Fecha</label><input type="date" class="form-input" id="rc-fecha"></div>
        <div class="form-field"><label class="fl">Ubicación / Zona</label><select class="form-input" id="rc-zona"><option value="">Seleccionar…</option></select></div>
        <div class="form-field full">
          <label class="fl">Dirección</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" class="form-input" id="rc-direccion" placeholder="Calle y altura, punto de referencia…" style="flex:1">
            <button type="button" class="btn btn-gris btn-sm" id="rc-ubicacion-btn" onclick="validarDireccionRel()" title="Busca la dirección y confirma sus coordenadas — no depende de dónde estés parado">🔍 Validar dirección</button>
          </div>
          <div id="rc-ubicacion-estado" style="font-size:.74rem;color:#888;margin-top:4px"></div>
        </div>
        <div class="form-field"><label class="fl">Temática</label><select class="form-input" id="rc-tematica"><option value="">Seleccionar…</option></select></div>
        <div class="form-field"><label class="fl">Foto</label><input type="file" accept="image/*" class="form-input" id="rc-foto" onchange="previewFotoRel(this)"></div>
        <div class="form-field"><label class="fl">Foodtruck</label><select class="form-input" id="rc-foodtruck"><option value="No">No</option><option value="Si">Sí</option></select></div>
        <div class="form-field"><label class="fl">Conexión eléctrica</label><select class="form-input" id="rc-conexion"><option value="No">No</option><option value="Si">Sí</option><option value="Precaria">Precaria</option></select></div>
        <div class="form-field"><label class="fl">Patente</label><select class="form-input" id="rc-patente"><option value="No">No</option><option value="Si">Sí</option></select></div>
        <div class="form-field"><label class="fl">Estado</label><select class="form-input" id="rc-estado"><option value="Pendiente">Pendiente</option><option value="Realizado">Realizado</option><option value="Intimado">Intimado</option></select></div>
      </div>
      <div id="rc-foto-preview" style="display:none;margin:12px 0"></div>
      <div class="form-field full" style="margin:14px 0">
        <label class="fl">Observaciones</label>
        <textarea class="form-input" id="rc-observaciones" rows="4" placeholder="Detalle libre…"></textarea>
      </div>
      <button class="btn btn-verde" id="rc-guardar-btn" onclick="guardarRelevamiento()">💾 Guardar relevamiento</button>
    </div>
    <div id="rc-panel-whatsapp" style="display:none">
      <p style="font-size:.8rem;color:#777;margin-bottom:12px">Subí la exportación de WhatsApp del chat de relevamiento (<code>.zip</code>, con la opción "Incluir medios" activada al exportar). Se genera un relevamiento por cada foto encontrada, con la dirección que tenía escrita debajo en el chat — vas a poder revisar y corregir todo antes de guardar nada.</p>
      <div class="rc-grid">
        <div class="form-field"><label class="fl">Ubicación / Zona (para toda la tanda)</label><select class="form-input" id="rcw-zona"><option value="">Seleccionar…</option></select></div>
        <div class="form-field"><label class="fl">Temática (para toda la tanda)</label><select class="form-input" id="rcw-tematica"><option value="">Seleccionar…</option></select></div>
        <div class="form-field full">
          <label class="fl">Chat exportado de WhatsApp (.zip)</label>
          <input type="file" accept=".zip" class="form-input" id="rcw-zip">
        </div>
      </div>
      <button class="btn btn-azul" id="rcw-analizar-btn" onclick="analizarChatWhatsappRel()" style="margin-top:10px">🔍 Analizar chat</button>
      <div id="rcw-resultado" style="display:none;margin-top:16px">
        <div id="rcw-resumen" style="font-size:.85rem;color:#555;margin-bottom:8px"></div>
        <div class="rcw-row" style="font-weight:700;font-size:.72rem;color:#888;border-bottom:2px solid var(--bor)">
          <span></span><span>Foto</span><span>Fecha</span><span>Dirección</span><span>Origen</span>
        </div>
        <div class="rcw-tabla" id="rcw-tabla"></div>
        <button class="btn btn-verde" id="rcw-guardar-btn" onclick="guardarImportWhatsappRel()" style="margin-top:12px" disabled>💾 Guardar seleccionados (0)</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Populate the batch Zona/Temática selects too**

Current lines 463-473 (`poblarSelectsRel`):

```js
function poblarSelectsRel(){
  const optsZ="<option value=\"\">Seleccionar…</option>"+(window.relZonas||[]).map(z=>"<option value=\""+esc(z)+"\">"+esc(z)+"</option>").join("");
  const optsT="<option value=\"\">Seleccionar…</option>"+(window.relTematicas||[]).map(t=>"<option value=\""+esc(t)+"\">"+esc(t)+"</option>").join("");
  const zc=document.getElementById("rc-zona"); if(zc) zc.innerHTML=optsZ;
  const tc=document.getElementById("rc-tematica"); if(tc) tc.innerHTML=optsT;
  const zf=document.getElementById("rf-zona");
  if(zf) zf.innerHTML="<option value=\"\">Todas las zonas</option>"+(window.relZonas||[]).map(z=>"<option value=\""+esc(z)+"\">"+esc(z)+"</option>").join("");
  const tf=document.getElementById("rf-tematica");
  if(tf) tf.innerHTML="<option value=\"\">Todas las temáticas</option>"+(window.relTematicas||[]).map(t=>"<option value=\""+esc(t)+"\">"+esc(t)+"</option>").join("");
  renderLeyendaMapaRel();
}
```

Replace with:

```js
function poblarSelectsRel(){
  const optsZ="<option value=\"\">Seleccionar…</option>"+(window.relZonas||[]).map(z=>"<option value=\""+esc(z)+"\">"+esc(z)+"</option>").join("");
  const optsT="<option value=\"\">Seleccionar…</option>"+(window.relTematicas||[]).map(t=>"<option value=\""+esc(t)+"\">"+esc(t)+"</option>").join("");
  const zc=document.getElementById("rc-zona"); if(zc) zc.innerHTML=optsZ;
  const tc=document.getElementById("rc-tematica"); if(tc) tc.innerHTML=optsT;
  const zcw=document.getElementById("rcw-zona"); if(zcw) zcw.innerHTML=optsZ;
  const tcw=document.getElementById("rcw-tematica"); if(tcw) tcw.innerHTML=optsT;
  const zf=document.getElementById("rf-zona");
  if(zf) zf.innerHTML="<option value=\"\">Todas las zonas</option>"+(window.relZonas||[]).map(z=>"<option value=\""+esc(z)+"\">"+esc(z)+"</option>").join("");
  const tf=document.getElementById("rf-tematica");
  if(tf) tf.innerHTML="<option value=\"\">Todas las temáticas</option>"+(window.relTematicas||[]).map(t=>"<option value=\""+esc(t)+"\">"+esc(t)+"</option>").join("");
  renderLeyendaMapaRel();
}
```

- [ ] **Step 4: Add `cambiarVistaCargaRel`**

Current lines 862-866:

```js
};

// ============================================================
//  CARGA (alta de un relevamiento)
// ============================================================
```

Replace with:

```js
};

// Alterna entre el formulario individual y el import masivo de WhatsApp
// dentro de la pestaña Carga — no toca la pestaña de nivel superior
// (Dashboard/Carga/Administración), sólo qué se ve adentro de "Carga".
window.cambiarVistaCargaRel=function(modo){
  document.getElementById("rc-view-btn-individual").classList.toggle("active",modo==="individual");
  document.getElementById("rc-view-btn-whatsapp").classList.toggle("active",modo==="whatsapp");
  document.getElementById("rc-panel-individual").style.display=modo==="individual"?"":"none";
  document.getElementById("rc-panel-whatsapp").style.display=modo==="whatsapp"?"":"none";
};

// ============================================================
//  CARGA (alta de un relevamiento)
// ============================================================
```

- [ ] **Step 5: `editarRelevamiento` must switch back to the individual sub-view**

Current lines 891-919:

```js
window.editarRelevamiento=function(){
  const r=window.relevamientos.find(x=>x.id===_relDetalleId);
  if(!r)return;
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  limpiarFormCarga();
  _editRelId=r.id;
  _editRelFotoFileId=r.fotoFileId||null;
  document.getElementById("rc-title").textContent="✏️ Editar relevamiento";
  document.getElementById("rc-guardar-btn").textContent="💾 Guardar cambios";
  document.getElementById("rc-fecha").value=r.fecha||todayISOSimple();
  document.getElementById("rc-zona").value=r.zona||"";
  document.getElementById("rc-direccion").value=r.direccion||"";
  document.getElementById("rc-tematica").value=r.tematica||"";
  document.getElementById("rc-foodtruck").value=r.foodTruck||"No";
  document.getElementById("rc-conexion").value=r.conexionElectrica||"No";
  document.getElementById("rc-patente").value=r.patente||"No";
  document.getElementById("rc-estado").value=r.estado||"Pendiente";
  document.getElementById("rc-observaciones").value=r.observaciones||"";
  _rcLat=r.lat!=null?r.lat:null;
  _rcLng=r.lng!=null?r.lng:null;
  document.getElementById("rc-ubicacion-estado").textContent=(_rcLat!=null&&_rcLng!=null)?"✅ Ya tiene ubicación guardada (validá la dirección de nuevo si cambió).":"";
  if(r.fotoFileId){
    const prev=document.getElementById("rc-foto-preview");
    prev.innerHTML="<div style=\"font-size:.74rem;color:#888;margin-bottom:4px\">Foto actual (elegí un archivo nuevo para reemplazarla):</div><img src=\""+esc(fotoThumbUrlRel(r.fotoFileId,300))+"\" style=\"max-height:160px\">";
    prev.style.display="block";
  }
  cerrarModal("modal-rel-detalle");
  window.cambiarTab("carga",document.getElementById("tab-btn-carga"));
};
```

Replace with (only the last two lines change):

```js
window.editarRelevamiento=function(){
  const r=window.relevamientos.find(x=>x.id===_relDetalleId);
  if(!r)return;
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  limpiarFormCarga();
  _editRelId=r.id;
  _editRelFotoFileId=r.fotoFileId||null;
  document.getElementById("rc-title").textContent="✏️ Editar relevamiento";
  document.getElementById("rc-guardar-btn").textContent="💾 Guardar cambios";
  document.getElementById("rc-fecha").value=r.fecha||todayISOSimple();
  document.getElementById("rc-zona").value=r.zona||"";
  document.getElementById("rc-direccion").value=r.direccion||"";
  document.getElementById("rc-tematica").value=r.tematica||"";
  document.getElementById("rc-foodtruck").value=r.foodTruck||"No";
  document.getElementById("rc-conexion").value=r.conexionElectrica||"No";
  document.getElementById("rc-patente").value=r.patente||"No";
  document.getElementById("rc-estado").value=r.estado||"Pendiente";
  document.getElementById("rc-observaciones").value=r.observaciones||"";
  _rcLat=r.lat!=null?r.lat:null;
  _rcLng=r.lng!=null?r.lng:null;
  document.getElementById("rc-ubicacion-estado").textContent=(_rcLat!=null&&_rcLng!=null)?"✅ Ya tiene ubicación guardada (validá la dirección de nuevo si cambió).":"";
  if(r.fotoFileId){
    const prev=document.getElementById("rc-foto-preview");
    prev.innerHTML="<div style=\"font-size:.74rem;color:#888;margin-bottom:4px\">Foto actual (elegí un archivo nuevo para reemplazarla):</div><img src=\""+esc(fotoThumbUrlRel(r.fotoFileId,300))+"\" style=\"max-height:160px\">";
    prev.style.display="block";
  }
  cerrarModal("modal-rel-detalle");
  cambiarVistaCargaRel("individual");
  window.cambiarTab("carga",document.getElementById("tab-btn-carga"));
};
```

- [ ] **Step 6: Manual verification**

Serve the project root over HTTP (module `<script>` tags don't work from `file://`):

```bash
npx http-server . -p 8080
```

Open `http://localhost:8080/relevamientos_operativos.html`, log in, go to the "Carga" tab. Expected:
- Two buttons appear above the form: "📝 Individual" (highlighted) and "📦 Importar desde WhatsApp".
- The individual form looks and behaves exactly as before (fill it in, no regressions) — this confirms nothing in Task 1 broke the existing flow.
- Click "📦 Importar desde WhatsApp": the individual form disappears, a new panel appears with "Ubicación / Zona (para toda la tanda)" and "Temática (para toda la tanda)" selects populated with the same options as the individual form's Zona/Temática, a `.zip` file input, and a disabled "🔍 Analizar chat" button area. Clicking "🔍 Analizar chat" is expected to throw a console error (`analizarChatWhatsappRel is not defined`) — normal at this stage, fixed by Task 3.
- Click "📝 Individual" again: form reappears with whatever you'd typed still there (not reset).
- Open a relevamiento from the Dashboard, click "✏️ Editar": confirm it switches to "Carga" tab **and** lands on the "📝 Individual" sub-view (not "Importar desde WhatsApp"), pre-filled as before.

- [ ] **Step 7: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: agregar sub-vista Individual/Importar desde WhatsApp en Carga"
```

---

### Task 2: Parseo del chat de WhatsApp (funciones puras)

**Files:**
- Modify: `relevamientos_operativos.html:1114-1116` (insert a new section between the end of `guardarRelevamiento` and the `RECARGA` header)

**Interfaces:**
- Produces (consumed by Task 3): `function parsearChatWhatsappRel(texto)` → `Array<{fecha:string, lineas:string[]}>` (`fecha` already `"YYYY-MM-DD"`). `function extraerCandidatosWhatsappRel(mensajes)` → `Array<{archivo:string, fecha:string, direccion:string}>`.
- Consumes: nothing (pure string-processing functions, no DOM, no network).

- [ ] **Step 1: Insert the parsing section**

Current lines 1114-1116:

```js
};

// ============================================================
//  RECARGA
// ============================================================
```

Replace with:

```js
};

// ============================================================
//  IMPORTAR DESDE WHATSAPP (carga masiva)
// ============================================================
// El chat de relevamiento se exporta desde WhatsApp con "Incluir medios":
// genera un .zip con un .txt de la conversación + todas las fotos. Cada
// mensaje real empieza con "D/M/AAAA, HH:MM - " — toda línea que no
// matchea ese prefijo es continuación del mensaje anterior (así es como
// queda, en el .txt, la leyenda que alguien escribe debajo de una foto:
// en una línea aparte, sin timestamp propio).
const RE_HEADER_CHAT_REL=/^(\d{1,2}\/\d{1,2}\/\d{4}), \d{1,2}:\d{2} - (.*)$/;
function fechaChatAIsoRel(dmy){
  const [d,m,y]=dmy.split("/");
  return y+"-"+m.padStart(2,"0")+"-"+d.padStart(2,"0");
}
function parsearChatWhatsappRel(texto){
  const lineas=texto.split(/\r\n|\r|\n/);
  const mensajes=[];
  let actual=null;
  for(const linea of lineas){
    const m=linea.match(RE_HEADER_CHAT_REL);
    if(m){
      actual={fecha:fechaChatAIsoRel(m[1]),lineas:[m[2]]};
      mensajes.push(actual);
    } else if(actual){
      actual.lineas.push(linea);
    }
  }
  return mensajes;
}
// Sólo los mensajes cuya primera línea es un adjunto de imagen generan una
// fila candidata. Un pin de "ubicación:", un mensaje de sistema ("Creaste
// este grupo", etc.) o un comentario suelto sin foto simplemente no
// matchean esta regex y quedan afuera del import sin necesitar ningún caso
// especial para cada uno — la regla es una sola: "¿tiene foto adjunta?".
const RE_ADJUNTO_IMG_REL=/([\w\-. ]+\.(?:jpg|jpeg|png|webp))\s*\(archivo adjunto\)/i;
function extraerCandidatosWhatsappRel(mensajes){
  const candidatos=[];
  mensajes.forEach(msg=>{
    const primera=msg.lineas[0]||"";
    const m=primera.match(RE_ADJUNTO_IMG_REL);
    if(!m) return;
    candidatos.push({
      archivo:m[1].trim(),
      fecha:msg.fecha,
      direccion:msg.lineas.slice(1).join(" ").trim(),
    });
  });
  return candidatos;
}

// ============================================================
//  RECARGA
// ============================================================
```

- [ ] **Step 2: Manual verification in the browser console**

Serve the project and open `relevamientos_operativos.html` (see Task 1 Step 6), log in, open devtools console, and run:

```js
const texto = `25/8/2026, 12:59 - Creaste este grupo
25/8/2026, 13:02 - Repetto Sergio: ‎IMG-20260825-WA0014.jpg (archivo adjunto)
Santo domingo 3794
25/8/2026, 13:02 - Repetto Sergio: ‎IMG-20260825-WA0108.jpg (archivo adjunto)
25/8/2026, 13:02 - Repetto Sergio: ubicación: https://maps.google.com/?q=-34.6552211,-58.4053876
25/8/2026, 13:02 - Repetto Sergio: Camino de sirga
25/8/2026, 13:02 - Repetto Sergio: ‎IMG-20260825-WA0172.jpg (archivo adjunto)
Luna 309 xolectivo abandonado`;
console.log(extraerCandidatosWhatsappRel(parsearChatWhatsappRel(texto)));
```

Expected output — exactly 3 candidates (the system message, the location pin, and the standalone "Camino de sirga" text are all correctly excluded):

```js
[
  {archivo:"IMG-20260825-WA0014.jpg", fecha:"2026-08-25", direccion:"Santo domingo 3794"},
  {archivo:"IMG-20260825-WA0108.jpg", fecha:"2026-08-25", direccion:""},
  {archivo:"IMG-20260825-WA0172.jpg", fecha:"2026-08-25", direccion:"Luna 309 xolectivo abandonado"}
]
```

Also confirm no console errors on page load (this task doesn't touch the DOM, so the page must behave exactly as after Task 1).

- [ ] **Step 3: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: parsear mensajes de un chat de WhatsApp exportado en fotos candidatas"
```

---

### Task 3: Carga del .zip, matching de fotos, deduplicación y tabla de revisión

**Files:**
- Modify: `relevamientos_operativos.html:15` (add JSZip CDN script tag)
- Modify: `relevamientos_operativos.html` — append after Task 2's section (before the `RECARGA` header)

**Interfaces:**
- Consumes: `parsearChatWhatsappRel`, `extraerCandidatosWhatsappRel` (Task 2); `esc()`, `fmtDate()`, `toast()`; `window.relevamientos` (already loaded on page init); DOM ids from Task 1 (`rcw-zip`, `rcw-analizar-btn`, `rcw-resultado`, `rcw-resumen`, `rcw-tabla`, `rcw-guardar-btn`); global `JSZip` (new CDN dependency).
- Produces (consumed by Task 4): module-level `let _wImportFilasRel` — array of row objects `{archivo:string, fecha:string, direccion:string, zipEntry:JSZip.ZipObject|null, sinBinario:boolean, yaImportada:string|null, incluir:boolean, estadoGuardado:null|"ok"|"sin-geo"|"error"}`. `function filasPendientesImportRel()` → the subset of `_wImportFilasRel` with `incluir===true` and `estadoGuardado` not yet `"ok"`/`"sin-geo"` (i.e. still needs saving or previously errored). `function actualizarResumenImportRel()` (re-renders the summary line and the "Guardar seleccionados" button label/disabled state — Task 4 calls this too). `window.analizarChatWhatsappRel()` (wired already by Task 1's markup).

- [ ] **Step 1: Add the JSZip dependency**

Current line 15:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

Replace with:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
```

- [ ] **Step 2: Add the zip/matching/table code**

Insert right after the code block added in Task 2 (i.e. right after the closing brace of `extraerCandidatosWhatsappRel`, still before the `RECARGA` header):

```js
// Busca dentro del .zip un archivo cuyo nombre (sin importar la carpeta)
// coincida con el de la leyenda del chat — WhatsApp exporta todo en la raíz
// del .zip, pero por las dudas no se asume esa estructura.
function buscarArchivoEnZipRel(zip,nombre){
  const nombreLower=nombre.toLowerCase();
  for(const path of Object.keys(zip.files)){
    const entry=zip.files[path];
    if(entry.dir) continue;
    if(path.split("/").pop().toLowerCase()===nombreLower) return entry;
  }
  return null;
}
let _wImportFilasRel=[];
function filaImportWhatsappRelHtml(f,i){
  return "<div class=\"rcw-row\">"
    +"<input type=\"checkbox\" "+(f.incluir?"checked":"")+" onchange=\"_wImportToggleFilaRel("+i+",this.checked)\">"
    +"<img class=\"rcw-thumb\" id=\"rcw-thumb-"+i+"\" alt=\"\">"
    +"<input type=\"date\" class=\"form-input\" value=\""+esc(f.fecha)+"\" oninput=\"_wImportSetCampoRel("+i+",'fecha',this.value)\">"
    +"<input type=\"text\" class=\"form-input\" value=\""+esc(f.direccion)+"\" oninput=\"_wImportSetCampoRel("+i+",'direccion',this.value)\">"
    +"<div><div class=\"rcw-origen\">"+esc(f.archivo)+"</div>"
    +(f.yaImportada?"<div class=\"rcw-origen\" style=\"color:#b45309\">Ya importada el "+esc(fmtDate(f.yaImportada))+"</div>":"")
    +(f.sinBinario?"<div class=\"rcw-origen\" style=\"color:#b91c1c\">⚠️ no se encontró la foto en el .zip</div>":"")
    +"<span id=\"rcw-estado-"+i+"\" style=\"font-size:1rem\"></span>"
    +"</div>"
    +"</div>";
}
// Arma la tabla con placeholders de miniatura y recién después resuelve
// cada blob del zip en forma asíncrona — así la tabla aparece de una,
// sin esperar a descomprimir las ~150 fotos antes de mostrar nada.
function renderTablaImportWhatsappRel(){
  const cont=document.getElementById("rcw-tabla");
  cont.innerHTML=_wImportFilasRel.map((f,i)=>filaImportWhatsappRelHtml(f,i)).join("");
  _wImportFilasRel.forEach((f,i)=>{
    if(!f.zipEntry) return;
    f.zipEntry.async("blob").then(blob=>{
      const img=document.getElementById("rcw-thumb-"+i);
      if(img) img.src=URL.createObjectURL(blob);
    }).catch(()=>{});
  });
}
// Una fila ya guardada ("ok" o "sin-geo") no se vuelve a intentar aunque
// siga tildada — evita duplicar el relevamiento si se aprieta "Guardar
// seleccionados" dos veces (por ejemplo, para reintentar sólo las que
// dieron error la primera vez).
function filasPendientesImportRel(){
  return _wImportFilasRel.filter(f=>f.incluir&&f.estadoGuardado!=="ok"&&f.estadoGuardado!=="sin-geo");
}
function actualizarResumenImportRel(){
  const total=_wImportFilasRel.length;
  const yaImportadas=_wImportFilasRel.filter(f=>f.yaImportada).length;
  const paraGuardar=filasPendientesImportRel().length;
  document.getElementById("rcw-resumen").textContent=
    total+" foto"+(total===1?"":"s")+" encontrada"+(total===1?"":"s")+" en el chat · "
    +yaImportadas+" ya importada"+(yaImportadas===1?"":"s")+" antes · "
    +paraGuardar+" para guardar";
  const btn=document.getElementById("rcw-guardar-btn");
  btn.disabled=paraGuardar===0;
  btn.textContent="💾 Guardar seleccionados ("+paraGuardar+")";
}
window._wImportToggleFilaRel=function(idx,checked){
  _wImportFilasRel[idx].incluir=checked;
  actualizarResumenImportRel();
};
window._wImportSetCampoRel=function(idx,campo,valor){
  _wImportFilasRel[idx][campo]=valor;
};
window.analizarChatWhatsappRel=async function(){
  const file=document.getElementById("rcw-zip").files[0];
  if(!file){toast("Elegí un archivo .zip primero.");return;}
  const btn=document.getElementById("rcw-analizar-btn");
  btn.disabled=true;btn.textContent="Analizando…";
  try{
    const zip=await JSZip.loadAsync(file);
    const txtPath=Object.keys(zip.files).find(p=>/\.txt$/i.test(p)&&!zip.files[p].dir);
    if(!txtPath) throw new Error("No se encontró un archivo .txt de chat dentro del .zip.");
    const buf=await zip.files[txtPath].async("uint8array");
    const texto=new TextDecoder("utf-8").decode(buf);
    const candidatos=extraerCandidatosWhatsappRel(parsearChatWhatsappRel(texto));
    const existentesPorArchivo={};
    (window.relevamientos||[]).forEach(r=>{
      if(r.origenArchivo) existentesPorArchivo[r.origenArchivo.toLowerCase()]=r;
    });
    _wImportFilasRel=candidatos.map(c=>{
      const zipEntry=buscarArchivoEnZipRel(zip,c.archivo);
      const existente=existentesPorArchivo[c.archivo.toLowerCase()]||null;
      return {
        archivo:c.archivo,fecha:c.fecha,direccion:c.direccion,
        zipEntry,sinBinario:!zipEntry,
        yaImportada:existente?existente.fecha:null,
        incluir:!existente,
        estadoGuardado:null,
      };
    });
    renderTablaImportWhatsappRel();
    actualizarResumenImportRel();
    document.getElementById("rcw-resultado").style.display="";
    if(!candidatos.length) toast("No se encontraron fotos con leyenda en ese chat.");
  }catch(e){
    toast("❌ Error al analizar el .zip: "+e.message,4000);
    console.error(e);
  }finally{
    btn.disabled=false;btn.textContent="🔍 Analizar chat";
  }
};
```

- [ ] **Step 3: Build a small synthetic test .zip**

There's no real WhatsApp export in this repo, so build a throwaway one with PowerShell (works on the Windows dev machine this project is developed on):

```powershell
$dir = "$env:TEMP\rel-import-test"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dir | Out-Null

Add-Type -AssemblyName System.Drawing
function New-TestJpg($path, $color) {
  $bmp = New-Object System.Drawing.Bitmap 8,8
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::$color)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $bmp.Dispose()
}
New-TestJpg "$dir\IMG-TEST-0001.jpg" "Red"
New-TestJpg "$dir\IMG-TEST-0002.jpg" "Blue"

@"
25/8/2026, 12:59 - Creaste este grupo
25/8/2026, 13:02 - Tester: IMG-TEST-0001.jpg (archivo adjunto)
Calle Falsa 123
25/8/2026, 13:03 - Tester: IMG-TEST-0002.jpg (archivo adjunto)
25/8/2026, 13:04 - Tester: ubicación: https://maps.google.com/?q=-34.6,-58.4
25/8/2026, 13:05 - Tester: Comentario suelto sin foto
"@ | Set-Content -Encoding utf8 "$dir\Chat de WhatsApp con Testing.txt"

Compress-Archive -Path "$dir\*" -DestinationPath "$dir\chat-test.zip" -Force
Write-Host "Test zip listo en $dir\chat-test.zip"
```

- [ ] **Step 4: Manual verification**

Serve the project and open `relevamientos_operativos.html` (see Task 1 Step 6), log in, go to Carga → "📦 Importar desde WhatsApp". Choose the batch Zona/Temática (any values), pick the `chat-test.zip` built in Step 3 as the file, click "🔍 Analizar chat". Expected:
- The summary line reads "2 fotos encontradas en el chat · 0 ya importadas antes · 2 para guardar" (the location pin and the standalone comment correctly produced zero extra rows).
- Two rows appear: one with date `2026-08-25`, address "Calle Falsa 123", filename "IMG-TEST-0001.jpg"; one with the same date, empty address, filename "IMG-TEST-0002.jpg". Both thumbnails load (a small solid red square and a small solid blue square) within a second or two.
- Both rows are checked by default. Edit the address text of the second row — confirm it updates a Guardar seleccionados stays enabled.
- Uncheck one row — confirm the "💾 Guardar seleccionados (N)" button's count decreases by one, and re-check it to bring it back.
- Rename `IMG-TEST-0002.jpg` reference: re-run Step 3's script after deleting `IMG-TEST-0002.jpg` from `$dir` before compressing, to produce a `.zip` missing that binary, re-upload, and confirm that row shows "⚠️ no se encontró la foto en el .zip" instead of a thumbnail.
- Check the browser console for errors throughout (aside from clicking "Guardar seleccionados", which is still expected to fail until Task 4 — don't click it yet).

- [ ] **Step 5: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: analizar el .zip de WhatsApp y mostrar tabla de revisión antes de guardar"
```

---

### Task 4: Guardado en lote (geocodificación + foto + Firestore)

**Files:**
- Modify: `relevamientos_operativos.html` — append after Task 3's section (before the `RECARGA` header)

**Interfaces:**
- Consumes: `_wImportFilasRel`, `filasPendientesImportRel()` (Task 3); `geocodificarDireccionRel()`, `comprimirImagenRel()`, `conAuditoriaRel()`, `guardarRelevamientoChunked()`, `aplicarFiltrosRel()`, `puedeEditar()`, `toast()` (all pre-existing); `RELEVAMIENTOS_FOTO_ENDPOINT`/`RELEVAMIENTOS_FOTO_TOKEN` (from `config.js`).
- Produces: `function actualizarEstadoFilaImportRel(idx)` (updates one row's ✅/⚠️/❌ span without re-rendering the whole table — re-rendering would re-trigger every thumbnail's blob read again). `window.guardarImportWhatsappRel()` (wired already by Task 1's markup).

- [ ] **Step 1: Add the save function**

Insert right after `window.analizarChatWhatsappRel` (end of Task 3's block), still before the `RECARGA` header:

```js
function actualizarEstadoFilaImportRel(idx){
  const el=document.getElementById("rcw-estado-"+idx);
  if(!el) return;
  const f=_wImportFilasRel[idx];
  el.textContent=f.estadoGuardado==="ok"?"✅":f.estadoGuardado==="sin-geo"?"⚠️":f.estadoGuardado==="error"?"❌":"";
}
// Secuencial (una fila por vez), mismo criterio que
// regeocodificarPendientesRel(): no se puede geocodificar en paralelo por
// la política de uso de Nominatim, y tampoco conviene golpear el Apps
// Script de subida de fotos con decenas de requests simultáneos.
window.guardarImportWhatsappRel=async function(){
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  const zona=document.getElementById("rcw-zona").value;
  const tematica=document.getElementById("rcw-tematica").value;
  if(!zona||!tematica){toast("Elegí zona y temática para la tanda antes de guardar.");return;}
  const pendientes=filasPendientesImportRel();
  if(!pendientes.length){toast("No hay filas seleccionadas para guardar.");return;}
  const btn=document.getElementById("rcw-guardar-btn");
  btn.disabled=true;
  let ok=0,sinGeo=0,errores=0;
  for(let i=0;i<pendientes.length;i++){
    const f=pendientes[i];
    const idx=_wImportFilasRel.indexOf(f);
    btn.textContent="Guardando "+(i+1)+"/"+pendientes.length+"…";
    try{
      let lat=null,lng=null;
      if(f.direccion){
        try{
          const geo=await geocodificarDireccionRel(f.direccion);
          if(geo){lat=geo.lat;lng=geo.lng;}
        }catch(e){}
      }
      let fotoFileId=null;
      const id=f.archivo+"-"+Date.now()+"-"+idx;
      if(f.zipEntry){
        if(typeof RELEVAMIENTOS_FOTO_ENDPOINT==="undefined"||!RELEVAMIENTOS_FOTO_ENDPOINT){
          throw new Error("La subida de fotos todavía no está configurada.");
        }
        const blob=await f.zipEntry.async("blob");
        const dataUrl=await comprimirImagenRel(blob,1200,0.8);
        const base64=dataUrl.split(",")[1];
        const resp=await fetch(RELEVAMIENTOS_FOTO_ENDPOINT,{
          method:"POST",
          headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({token:RELEVAMIENTOS_FOTO_TOKEN,id,base64,mimeType:"image/jpeg"}),
        });
        const data=await resp.json();
        if(!data.ok) throw new Error(data.error||"Error al subir la foto.");
        fotoFileId=data.fileId;
      }
      const rel={
        fecha:f.fecha,zona,tematica,fotoFileId,
        direccion:f.direccion,lat,lng,
        foodTruck:"No",conexionElectrica:"No",patente:"No",
        estado:"Pendiente",observaciones:"",
        origenArchivo:f.archivo,
      };
      conAuditoriaRel(rel,null);
      rel.id=id;
      await guardarRelevamientoChunked(rel,window.relevamientos);
      window.relevamientos.push(rel);
      f.estadoGuardado=(f.direccion&&lat==null)?"sin-geo":"ok";
      if(f.estadoGuardado==="sin-geo") sinGeo++; else ok++;
    }catch(e){
      f.estadoGuardado="error";
      errores++;
      console.error(e);
    }
    actualizarEstadoFilaImportRel(idx);
  }
  btn.disabled=false;
  actualizarResumenImportRel();
  aplicarFiltrosRel();
  toast("✅ "+ok+" guardado"+(ok===1?"":"s")+(sinGeo?", "+sinGeo+" sin geocodificar":"")+(errores?", "+errores+" con error":"")+".",6000);
};
```

- [ ] **Step 2: Manual verification (reaches real Firestore + real Drive — read the warning first)**

⚠️ There is no Firebase emulator in this project — this step writes to the real `dgfis-gcaba` Firestore project and uploads real (tiny, throwaway) files to the real Drive folder via the Apps Script endpoint in `config.js`. Use an obviously fake Zona/Temática so the test records are easy to find and delete afterward, e.g. type `ZZZ_PRUEBA_BORRAR` into the Administración tab's "Zonas" and "Temáticas" lists first (they persist in `relevamientos_config`, so add them once, use them, then remove them again in Step 4 below).

1. In Administración, add a Zona `ZZZ_PRUEBA_BORRAR` and a Temática `ZZZ_PRUEBA_BORRAR`.
2. Go to Carga → "📦 Importar desde WhatsApp", pick both as the batch Zona/Temática, upload the `chat-test.zip` from Task 3 Step 3 (rebuild it with both `IMG-TEST-0001.jpg` and `IMG-TEST-0002.jpg` present), click "🔍 Analizar chat", then "💾 Guardar seleccionados (2)".
   - Expected: button shows "Guardando 1/2…" then "Guardando 2/2…", both rows end up with a ✅ (both have a photo; the first also geocodes since "Calle Falsa 123" doesn't exist in USIG/Nominatim — if it happens to fail to geocode you'll see ⚠️ on that row instead, which is also correct behavior, not a bug). A final toast summarizes the result.
3. Go to the Dashboard, filter by Zona `ZZZ_PRUEBA_BORRAR`: confirm exactly 2 relevamientos appear, each with its photo visible (a tiny red/blue square), dated `25/08/2026`, one with dirección "Calle Falsa 123" and one with no dirección.
4. Go to Administración → "📌 Ubicaciones pendientes": if "Calle Falsa 123" didn't geocode (expected, it's a fake address), confirm that record shows up there with no code changes needed — it's the pre-existing `relPendientesGeo()` logic picking it up automatically.
5. Go back to Carga → "📦 Importar desde WhatsApp", re-upload the **same** `chat-test.zip`, click "🔍 Analizar chat" again. Expected: summary reads "2 fotos encontradas en el chat · 2 ya importadas antes · 0 para guardar", both rows appear unchecked with "Ya importada el 25/08/2026" under the filename, and "💾 Guardar seleccionados (0)" is disabled — this confirms the `origenArchivo` dedup works end-to-end.
6. Check the browser console for errors throughout.

- [ ] **Step 3: Clean up the test data**

From the Dashboard, open each of the two `ZZZ_PRUEBA_BORRAR` relevamientos and delete them ("🗑 Eliminar"). Then go to Administración and remove the `ZZZ_PRUEBA_BORRAR` Zona and Temática from their lists. (The two tiny test photos remain in the Drive folder — same accepted limitation `eliminarRelevamiento()` already documents for the individual flow: "la foto en Drive no se borra… no vale la pena la complejidad de coordinar el borrado con el Apps Script para un caso poco frecuente".)

- [ ] **Step 4: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: guardar en lote el import de WhatsApp (geocodificado, foto y deduplicación)"
```

---
