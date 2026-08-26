# Carga masiva de WhatsApp: campos por fila y eliminar fila Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the "Importar desde WhatsApp" sub-vista of `relevamientos_operativos.html`, let the operator eliminate a candidate row from the review table entirely, and edit Zona/Temática/Foodtruck/Conexión eléctrica/Patente/Estado per row (each starting from a batch-level default copied in at analysis time) instead of one fixed value for the whole batch.

**Architecture:** Pure extension of the existing client-side review table — no new dependencies, no backend change. Each row object in `_wImportFilasRel` gains 6 fields; the row's rendered HTML grows a second line of compact `<select>` elements plus a delete button on the first line; the save loop reads these 6 fields per row instead of from batch-level variables.

**Tech Stack:** Vanilla JS (no framework), same file, same conventions as the rest of the module (`+` string concat for HTML, `esc()` for interpolated values, index-based inline `onclick`/`onchange`, `Rel`-suffixed names). No automated test suite in this repo — verification is `node --check` for syntax plus manual browser testing against the real Firestore project (no emulator).

## Global Constraints

- Same HTML-building style as the rest of the file: `+` concatenation, `esc()` on every interpolated value, index-based inline handlers (`onchange="_wImportSetCampoRel(i,'campo',this.value)"` — this helper already exists and is reused unchanged for every new field).
- No parsing of Zona/Temática/Foodtruck/Conexión/Patente/Estado from the WhatsApp chat text — these are always operator-entered, only the default-copy-at-analysis-time behavior is new (see spec: `docs/superpowers/specs/2026-08-26-whatsapp-import-campos-por-fila-design.md`).
- Deleting a row is a pure local array `splice` — never touches Firestore, no confirmation dialog.
- A row with an emptied Zona or Temática must fail *only that row* at save time (❌, clear error message) — never abort the rest of the batch.
- Foodtruck/Conexión eléctrica/Patente/Estado selects never have a blank option (same as the individual form) — no per-row validation needed for those 4.
- Existing anti-duplicate-save guard (`_wImportGuardandoRel`, commit `16366db`) is untouched by this plan — both tasks below only add/replace logic around it, never remove or reorder its checks.

---

### Task 1: Per-row fields, two-line row UI, delete button, analysis-time defaults

**Files:**
- Modify: `relevamientos_operativos.html:46-50` (CSS for `.rcw-row` and friends)
- Modify: `relevamientos_operativos.html:230-237` (batch-level selectors in the WhatsApp panel)
- Modify: `relevamientos_operativos.html:241-243` (table header row)
- Modify: `relevamientos_operativos.html:1225-1237` (`filaImportWhatsappRelHtml`)
- Modify: `relevamientos_operativos.html:1301-1339` (`window.analizarChatWhatsappRel`)
- Insert new function `_wImportEliminarFilaRel` near `_wImportSetCampoRel`

**Interfaces:**
- Produces (consumed by Task 2): each row object in `_wImportFilasRel` gains `zona:string`, `tematica:string`, `foodTruck:"No"|"Si"`, `conexionElectrica:"No"|"Si"|"Precaria"`, `patente:"No"|"Si"`, `estado:"Pendiente"|"Realizado"|"Intimado"` — all populated from the batch selectors' current values at the moment `analizarChatWhatsappRel` builds `_wImportFilasRel`, then editable per row via the existing `_wImportSetCampoRel(idx,campo,valor)`.
- Produces: `window._wImportEliminarFilaRel(idx)` — removes row `idx` from `_wImportFilasRel` and re-renders.
- Consumes: nothing new — `esc()`, `window.relZonas`/`window.relTematicas` (already populated by `cargarConfigRel()`), existing `_wImportSetCampoRel`, `renderTablaImportWhatsappRel`, `actualizarResumenImportRel`.

- [ ] **Step 1: CSS for the two-line row and delete button**

Current lines 46-50:

```css
.rcw-row{display:grid;grid-template-columns:28px 56px 150px 1fr 220px;gap:10px;align-items:center;padding:6px 4px;border-bottom:1px solid var(--bor);font-size:.8rem}
.rcw-row:last-child{border-bottom:none}
.rcw-thumb{width:48px;height:48px;object-fit:cover;background:var(--gris);display:block}
.rcw-tabla{max-height:520px;overflow-y:auto;overflow-x:auto;border:1.5px solid var(--bor);margin-top:2px}
.rcw-origen{font-size:.7rem;color:#888;line-height:1.3}
```

Replace with:

```css
.rcw-row{padding:6px 4px;border-bottom:1px solid var(--bor)}
.rcw-row:last-child{border-bottom:none}
.rcw-row1{display:grid;grid-template-columns:28px 56px 150px 1fr 220px 28px;gap:10px;align-items:center;font-size:.8rem}
.rcw-row2{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-left:38px}
.rcw-row2 select{font-size:.72rem;padding:3px 4px;border:1.5px solid var(--bor);background:#fff;max-width:140px}
.rcw-thumb{width:48px;height:48px;object-fit:cover;background:var(--gris);display:block}
.rcw-tabla{max-height:520px;overflow-y:auto;overflow-x:auto;border:1.5px solid var(--bor);margin-top:2px}
.rcw-origen{font-size:.7rem;color:#888;line-height:1.3}
.rcw-del-btn{border:none;background:none;cursor:pointer;font-size:.95rem;padding:2px;line-height:1}
```

- [ ] **Step 2: Add the 4 new batch-level selectors**

Current lines 230-237:

```html
      <div class="rc-grid">
        <div class="form-field"><label class="fl">Ubicación / Zona (para toda la tanda)</label><select class="form-input" id="rcw-zona"><option value="">Seleccionar…</option></select></div>
        <div class="form-field"><label class="fl">Temática (para toda la tanda)</label><select class="form-input" id="rcw-tematica"><option value="">Seleccionar…</option></select></div>
        <div class="form-field full">
          <label class="fl">Chat exportado de WhatsApp (.zip)</label>
          <input type="file" accept=".zip" class="form-input" id="rcw-zip">
        </div>
      </div>
```

Replace with:

```html
      <div class="rc-grid">
        <div class="form-field"><label class="fl">Ubicación / Zona (para toda la tanda)</label><select class="form-input" id="rcw-zona"><option value="">Seleccionar…</option></select></div>
        <div class="form-field"><label class="fl">Temática (para toda la tanda)</label><select class="form-input" id="rcw-tematica"><option value="">Seleccionar…</option></select></div>
        <div class="form-field"><label class="fl">Foodtruck (para toda la tanda)</label><select class="form-input" id="rcw-foodtruck"><option value="No">No</option><option value="Si">Sí</option></select></div>
        <div class="form-field"><label class="fl">Conexión eléctrica (para toda la tanda)</label><select class="form-input" id="rcw-conexion"><option value="No">No</option><option value="Si">Sí</option><option value="Precaria">Precaria</option></select></div>
        <div class="form-field"><label class="fl">Patente (para toda la tanda)</label><select class="form-input" id="rcw-patente"><option value="No">No</option><option value="Si">Sí</option></select></div>
        <div class="form-field"><label class="fl">Estado (para toda la tanda)</label><select class="form-input" id="rcw-estado"><option value="Pendiente">Pendiente</option><option value="Realizado">Realizado</option><option value="Intimado">Intimado</option></select></div>
        <div class="form-field full">
          <label class="fl">Chat exportado de WhatsApp (.zip)</label>
          <input type="file" accept=".zip" class="form-input" id="rcw-zip">
        </div>
      </div>
```

These 4 new selects use the same fixed options as `rc-foodtruck`/`rc-conexion`/`rc-patente`/`rc-estado` in the individual form (`relevamientos_operativos.html:216-219`) — no JS population needed, they're static.

- [ ] **Step 3: Update the table header row to match the new first-line column count**

Current lines 241-243:

```html
        <div class="rcw-row" style="font-weight:700;font-size:.72rem;color:#888;border-bottom:2px solid var(--bor)">
          <span></span><span>Foto</span><span>Fecha</span><span>Dirección</span><span>Origen</span>
        </div>
```

Replace with:

```html
        <div class="rcw-row" style="font-weight:700;font-size:.72rem;color:#888;border-bottom:2px solid var(--bor)">
          <div class="rcw-row1"><span></span><span>Foto</span><span>Fecha</span><span>Dirección</span><span>Origen</span><span></span></div>
        </div>
```

- [ ] **Step 4: Rewrite `filaImportWhatsappRelHtml` as a two-line row with the 6 per-row selects and a delete button**

Current lines 1225-1237:

```js
function filaImportWhatsappRelHtml(f,i){
  return "<div class=\"rcw-row\">"
    +"<input type=\"checkbox\" "+(f.incluir?"checked":"")+" onchange=\"_wImportToggleFilaRel("+i+",this.checked)\">"
    +"<img class=\"rcw-thumb\" id=\"rcw-thumb-"+i+"\" alt=\"\" loading=\"lazy\">"
    +"<input type=\"date\" class=\"form-input\" value=\""+esc(f.fecha)+"\" oninput=\"_wImportSetCampoRel("+i+",'fecha',this.value)\">"
    +"<input type=\"text\" class=\"form-input\" value=\""+esc(f.direccion)+"\" oninput=\"_wImportSetCampoRel("+i+",'direccion',this.value)\">"
    +"<div><div class=\"rcw-origen\">"+esc(f.archivo)+"</div>"
    +(f.yaImportada?"<div class=\"rcw-origen\" style=\"color:#b45309\">Ya importada el "+esc(fmtDate(f.yaImportada))+"</div>":"")
    +(f.sinBinario?"<div class=\"rcw-origen\" style=\"color:#b91c1c\">⚠️ no se encontró la foto en el .zip</div>":"")
    +"<span id=\"rcw-estado-"+i+"\" style=\"font-size:1rem\"></span>"
    +"</div>"
    +"</div>";
}
```

Replace with:

```js
function selectedRel(actual,valor){return actual===valor?" selected":"";}
function opcionesZonaTematicaRel(lista,actual){
  return "<option value=\"\""+selectedRel(actual,"")+">Seleccionar…</option>"
    +(lista||[]).map(v=>"<option value=\""+esc(v)+"\""+selectedRel(actual,v)+">"+esc(v)+"</option>").join("");
}
function filaImportWhatsappRelHtml(f,i){
  return "<div class=\"rcw-row\">"
    +"<div class=\"rcw-row1\">"
    +"<input type=\"checkbox\" "+(f.incluir?"checked":"")+" onchange=\"_wImportToggleFilaRel("+i+",this.checked)\">"
    +"<img class=\"rcw-thumb\" id=\"rcw-thumb-"+i+"\" alt=\"\" loading=\"lazy\">"
    +"<input type=\"date\" class=\"form-input\" value=\""+esc(f.fecha)+"\" oninput=\"_wImportSetCampoRel("+i+",'fecha',this.value)\">"
    +"<input type=\"text\" class=\"form-input\" value=\""+esc(f.direccion)+"\" oninput=\"_wImportSetCampoRel("+i+",'direccion',this.value)\">"
    +"<div><div class=\"rcw-origen\">"+esc(f.archivo)+"</div>"
    +(f.yaImportada?"<div class=\"rcw-origen\" style=\"color:#b45309\">Ya importada el "+esc(fmtDate(f.yaImportada))+"</div>":"")
    +(f.sinBinario?"<div class=\"rcw-origen\" style=\"color:#b91c1c\">⚠️ no se encontró la foto en el .zip</div>":"")
    +"<span id=\"rcw-estado-"+i+"\" style=\"font-size:1rem\"></span>"
    +"</div>"
    +"<button type=\"button\" class=\"rcw-del-btn\" title=\"Quitar esta fila\" onclick=\"_wImportEliminarFilaRel("+i+")\">🗑</button>"
    +"</div>"
    +"<div class=\"rcw-row2\">"
    +"<select title=\"Zona\" onchange=\"_wImportSetCampoRel("+i+",'zona',this.value)\">"+opcionesZonaTematicaRel(window.relZonas,f.zona)+"</select>"
    +"<select title=\"Temática\" onchange=\"_wImportSetCampoRel("+i+",'tematica',this.value)\">"+opcionesZonaTematicaRel(window.relTematicas,f.tematica)+"</select>"
    +"<select title=\"Foodtruck\" onchange=\"_wImportSetCampoRel("+i+",'foodTruck',this.value)\"><option value=\"No\""+selectedRel(f.foodTruck,"No")+">Foodtruck: No</option><option value=\"Si\""+selectedRel(f.foodTruck,"Si")+">Foodtruck: Sí</option></select>"
    +"<select title=\"Conexión eléctrica\" onchange=\"_wImportSetCampoRel("+i+",'conexionElectrica',this.value)\"><option value=\"No\""+selectedRel(f.conexionElectrica,"No")+">Conexión: No</option><option value=\"Si\""+selectedRel(f.conexionElectrica,"Si")+">Conexión: Sí</option><option value=\"Precaria\""+selectedRel(f.conexionElectrica,"Precaria")+">Conexión: Precaria</option></select>"
    +"<select title=\"Patente\" onchange=\"_wImportSetCampoRel("+i+",'patente',this.value)\"><option value=\"No\""+selectedRel(f.patente,"No")+">Patente: No</option><option value=\"Si\""+selectedRel(f.patente,"Si")+">Patente: Sí</option></select>"
    +"<select title=\"Estado\" onchange=\"_wImportSetCampoRel("+i+",'estado',this.value)\"><option value=\"Pendiente\""+selectedRel(f.estado,"Pendiente")+">Pendiente</option><option value=\"Realizado\""+selectedRel(f.estado,"Realizado")+">Realizado</option><option value=\"Intimado\""+selectedRel(f.estado,"Intimado")+">Intimado</option></select>"
    +"</div>"
    +"</div>";
}
```

- [ ] **Step 5: Add `_wImportEliminarFilaRel`**

Find the existing block (unchanged, for context — insert the new function right after it):

```js
window._wImportSetCampoRel=function(idx,campo,valor){
  _wImportFilasRel[idx][campo]=valor;
};
```

Insert immediately after it:

```js
window._wImportEliminarFilaRel=function(idx){
  _wImportFilasRel.splice(idx,1);
  renderTablaImportWhatsappRel();
  actualizarResumenImportRel();
};
```

- [ ] **Step 6: Require the batch defaults before analyzing, and copy them into each new row**

Current lines 1301-1328 (start of `window.analizarChatWhatsappRel` through the `_wImportFilasRel=candidatos.map(...)` block):

```js
window.analizarChatWhatsappRel=async function(){
  if(_wImportGuardandoRel){toast("Esperá a que termine el guardado en curso antes de analizar de nuevo.");return;}
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
```

Replace with:

```js
window.analizarChatWhatsappRel=async function(){
  if(_wImportGuardandoRel){toast("Esperá a que termine el guardado en curso antes de analizar de nuevo.");return;}
  const file=document.getElementById("rcw-zip").files[0];
  if(!file){toast("Elegí un archivo .zip primero.");return;}
  const zonaDefault=document.getElementById("rcw-zona").value;
  const tematicaDefault=document.getElementById("rcw-tematica").value;
  if(!zonaDefault||!tematicaDefault){toast("Elegí zona y temática para la tanda antes de analizar.");return;}
  const foodTruckDefault=document.getElementById("rcw-foodtruck").value;
  const conexionDefault=document.getElementById("rcw-conexion").value;
  const patenteDefault=document.getElementById("rcw-patente").value;
  const estadoDefault=document.getElementById("rcw-estado").value;
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
        zona:zonaDefault,tematica:tematicaDefault,
        foodTruck:foodTruckDefault,conexionElectrica:conexionDefault,
        patente:patenteDefault,estado:estadoDefault,
      };
    });
```

The rest of the function (from `renderTablaImportWhatsappRel();` to the closing `};`) is unchanged.

- [ ] **Step 7: Syntax check**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('relevamientos_operativos.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
fs.writeFileSync('scratch_check_rel.js', scripts.join('\n;\n'));
"
node --check scratch_check_rel.js && echo "SYNTAX OK"
rm -f scratch_check_rel.js
```

- [ ] **Step 8: Manual verification**

Serve the project (`npx http-server . -p 8080`), open `relevamientos_operativos.html`, log in, go to Carga → "📦 Importar desde WhatsApp". Expected:
- 4 new selects appear (Foodtruck/Conexión eléctrica/Patente/Estado "para toda la tanda"), each defaulting to No/No/No/Pendiente.
- Clicking "🔍 Analizar chat" without Zona/Temática selected shows the toast "Elegí zona y temática para la tanda antes de analizar." and does not open the table (this is new behavior — previously it was un-gated).
- With Zona/Temática/Foodtruck/Conexión/Patente/Estado all set and a test `.zip` chosen (reuse the one from the original plan's Task 3 Step 3), analyzing shows each row as two lines: the existing checkbox/thumbnail/fecha/dirección/origen line, plus a new line of 6 small selects, each pre-filled with the batch defaults just chosen.
- Editing a row's Zona select changes only that row (confirm another row still shows the batch default).
- Clicking 🗑 on a row removes it from the table immediately and updates the "N para guardar" summary count.
- Browser console has no errors throughout.

- [ ] **Step 9: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: campos por fila (zona/tematica/foodtruck/conexion/patente/estado) y eliminar fila en el import de WhatsApp"
```

---

### Task 2: Save loop reads per-row fields, with per-row zona/tematica validation

**Files:**
- Modify: `relevamientos_operativos.html:1340-1354` (start of `window.guardarImportWhatsappRel`, removing the batch-level zona/tematica read+check)
- Modify: `relevamientos_operativos.html` inside the per-row `try` block (add per-row validation, use `f.zona`/`f.tematica`/etc. instead of batch variables / hardcoded values)

**Interfaces:**
- Consumes: `f.zona`, `f.tematica`, `f.foodTruck`, `f.conexionElectrica`, `f.patente`, `f.estado` (Task 1).
- No new interfaces produced — `window.guardarImportWhatsappRel` keeps its existing signature and DOM ids.

- [ ] **Step 1: Remove the batch-level zona/tematica read and check**

Current (start of the function):

```js
window.guardarImportWhatsappRel=async function(){
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  const zona=document.getElementById("rcw-zona").value;
  const tematica=document.getElementById("rcw-tematica").value;
  if(!zona||!tematica){toast("Elegí zona y temática para la tanda antes de guardar.");return;}
  if(_wImportGuardandoRel){toast("Ya hay un guardado en curso, esperá a que termine.");return;}
  const pendientes=filasPendientesImportRel();
```

Replace with:

```js
window.guardarImportWhatsappRel=async function(){
  if(!puedeEditar()){toast("🔒 Sólo lectura: no tenés permiso para editar este módulo.");return;}
  if(_wImportGuardandoRel){toast("Ya hay un guardado en curso, esperá a que termine.");return;}
  const pendientes=filasPendientesImportRel();
```

- [ ] **Step 2: Validate per row and build `rel` from the row's own fields**

Current (inside the per-row `try` block, from the `let lat=null,lng=null;` line through the `rel={...}` object):

```js
    try{
      let lat=null,lng=null;
      if(f.direccion){
        try{
          const geo=await geocodificarDireccionRel(f.direccion);
          if(geo){lat=geo.lat;lng=geo.lng;}
        }catch(e){}
      }
      let fotoFileId=null;
      const id=Date.now().toString()+"-"+idx;
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
```

Replace with:

```js
    try{
      if(!f.zona||!f.tematica){throw new Error("Falta zona o temática en esta fila.");}
      let lat=null,lng=null;
      if(f.direccion){
        try{
          const geo=await geocodificarDireccionRel(f.direccion);
          if(geo){lat=geo.lat;lng=geo.lng;}
        }catch(e){}
      }
      let fotoFileId=null;
      const id=Date.now().toString()+"-"+idx;
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
        fecha:f.fecha,zona:f.zona,tematica:f.tematica,fotoFileId,
        direccion:f.direccion,lat,lng,
        foodTruck:f.foodTruck,conexionElectrica:f.conexionElectrica,patente:f.patente,
        estado:f.estado,observaciones:"",
        origenArchivo:f.archivo,
      };
```

- [ ] **Step 3: Syntax check**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('relevamientos_operativos.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
fs.writeFileSync('scratch_check_rel.js', scripts.join('\n;\n'));
"
node --check scratch_check_rel.js && echo "SYNTAX OK"
rm -f scratch_check_rel.js
```

- [ ] **Step 4: Manual verification (reaches real Firestore + real Drive — use a fake Zona/Temática, same warning as the original plan's Task 4)**

Analyze a test `.zip` with valid batch defaults, then in the review table:
- Edit one row's Zona select to a different (real) Zona from the dropdown, and one row's Foodtruck to "Sí" — save, then confirm in the Dashboard that row saved with the *edited* Zona/Foodtruck values, not the batch default.
- Clear another row's Zona select back to "Seleccionar…" (blank) and save — confirm that row alone shows ❌ in the table, the toast's error count includes it, and the rest of the batch still saves successfully.
- Confirm no console errors throughout.

- [ ] **Step 5: Commit**

```bash
git add relevamientos_operativos.html
git commit -m "Relevamientos: el guardado del import de WhatsApp usa zona/tematica/foodtruck/conexion/patente/estado por fila"
```
