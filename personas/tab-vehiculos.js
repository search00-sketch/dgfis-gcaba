// Pestaña Vehículos: listado actualizable (a mano o importando un Excel/CSV)
// y quién maneja cada uno (las personas con categoría Chofer).
import { S, lista, guardarItems, borrarItem, choferesDe } from './store.js';
import * as L from './logica.js';
import { $, $$, esc, debounce, toast, abrir, cerrar, descargarCSV, cargarXLSX } from './dom.js';

const TIPOS = ['Auto', 'Camioneta', 'Utilitario', 'Camión', 'Moto', 'Otro'];
const ESTADOS = ['Operativo', 'En taller', 'Baja'];
let el, filtro = { q: '', estado: '' }, prevista = null;

export function mount(raiz) {
  el = raiz;
  el.innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="vq" placeholder="🔍 Patente, marca, interno o chofer…" autocomplete="off">
      <select class="ctrl" id="vest"><option value="">Todos los estados</option>${ESTADOS.map(e => `<option>${e}</option>`).join('')}</select>
      <button class="btn btn-verde" id="vnuevo">＋ Nuevo vehículo</button>
      <label class="btn btn-azul" id="vimp-btn">📥 Importar Excel / CSV<input type="file" id="vimp" accept=".xlsx,.xls,.csv" hidden></label>
      <button class="btn btn-gris" id="vcsv">⬇ Exportar</button>
    </div>
    <div id="vprev"></div>
    <div class="info-linea" id="vinfo"></div>
    <div class="table-wrap"><table class="rtbl"><thead><tr><th>Patente</th><th>Tipo</th><th>Marca / modelo</th><th>Año</th><th>Interno</th><th>Estado</th><th>Choferes asignados</th><th></th></tr></thead><tbody id="vbody"></tbody></table></div>`;
  const q = $('#vq', el);
  q.addEventListener('input', debounce(() => { filtro.q = q.value; render(); }, 180));
  $('#vest', el).addEventListener('change', e => { filtro.estado = e.target.value; render(); });
  $('#vnuevo', el).addEventListener('click', () => abrirForm(null));
  $('#vcsv', el).addEventListener('click', exportar);
  $('#vimp', el).addEventListener('change', e => leerArchivo(e.target.files[0], e.target));
  $('#vbody', el).addEventListener('click', ev => { const b = ev.target.closest('[data-edit]'); if (b) abrirForm(b.dataset.edit); });
  $('#modal-vehiculo').addEventListener('click', ev => { if (ev.target.id === 'modal-vehiculo') cerrar('modal-vehiculo'); });
}

function filtrados() {
  const q = filtro.q.trim().toUpperCase();
  return lista('vehiculos').filter(v => (!filtro.estado || v.estado === filtro.estado) &&
    (!q || [v.patente, v.marca, v.modelo, v.interno, ...choferesDe(v.id).map(p => p.nombre)].join(' ').toUpperCase().includes(q)))
    .sort((a, b) => a.patente.localeCompare(b.patente));
}

export function render() {
  if (!el) return;
  $('#vnuevo', el).hidden = !S.editar; $('#vimp-btn', el).hidden = !S.editar;
  const vs = filtrados();
  $('#vinfo', el).textContent = vs.length + ' de ' + lista('vehiculos').length + ' vehículos';
  $('#vbody', el).innerHTML = vs.map(v => {
    const ch = choferesDe(v.id);
    return `<tr><td class="mono"><b>${esc(v.patente)}</b>${L.patenteConFormato(v.patente) ? '' : ' <span title="La patente no tiene un formato conocido">⚠️</span>'}</td>
      <td>${esc(v.tipo || '')}</td><td>${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</td><td>${esc(v.anio || '')}</td><td>${esc(v.interno || '')}</td>
      <td><span class="badge ${v.estado === 'Operativo' ? 'bdg-activo' : v.estado === 'Baja' ? 'bdg-baja' : 'bdg-licencia'}">${esc(v.estado || 'Operativo')}</span></td>
      <td>${ch.length ? ch.map(p => esc(p.nombre)).join('<br>') : '<span class="nota">sin chofer</span>'}${ch.length && v.estado === 'Baja' ? ' <span title="Vehículo dado de baja con chofer asignado">⚠️</span>' : ''}</td>
      <td>${S.editar ? `<button class="btn btn-sm btn-gris" data-edit="${esc(v.id)}">✏️</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="vacio">Todavía no hay vehículos. Cargá uno o importá el listado.</td></tr>';
}

function exportar() {
  const f = [['Patente', 'Tipo', 'Marca', 'Modelo', 'Año', 'Interno', 'Estado', 'Notas', 'Choferes']];
  filtrados().forEach(v => f.push([v.patente, v.tipo, v.marca, v.modelo, v.anio, v.interno, v.estado, v.notas, choferesDe(v.id).map(p => p.nombre).join(' / ')]));
  descargarCSV('vehiculos.csv', f);
}

// ---------- alta / edición ----------
function abrirForm(id) {
  const v = id ? S.vehiculos[id] : null, g = k => (v && v[k] != null ? v[k] : '');
  const opt = (arr, sel) => arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('#modal-vehiculo').innerHTML = `<div class="modal" style="max-width:520px">
    <button class="modal-close" data-cerrar>✕</button>
    <div class="modal-title">${v ? 'Editar vehículo' : 'Nuevo vehículo'}</div>
    <div id="vf-err" class="err-linea" hidden></div>
    <div class="form-grid">
      <div class="form-field"><label class="fl">Patente</label><input class="form-input mono" id="vf-patente" value="${esc(g('patente'))}" ${v ? 'readonly' : ''} placeholder="AB123CD"></div>
      <div class="form-field"><label class="fl">Tipo</label><select class="form-input" id="vf-tipo">${opt(TIPOS, g('tipo') || 'Auto')}</select></div>
      <div class="form-field"><label class="fl">Marca</label><input class="form-input" id="vf-marca" value="${esc(g('marca'))}"></div>
      <div class="form-field"><label class="fl">Modelo</label><input class="form-input" id="vf-modelo" value="${esc(g('modelo'))}"></div>
      <div class="form-field"><label class="fl">Año</label><input class="form-input" id="vf-anio" inputmode="numeric" value="${esc(g('anio'))}"></div>
      <div class="form-field"><label class="fl">N° de interno</label><input class="form-input" id="vf-interno" value="${esc(g('interno'))}"></div>
      <div class="form-field"><label class="fl">Estado</label><select class="form-input" id="vf-estado">${opt(ESTADOS, g('estado') || 'Operativo')}</select></div>
      <div class="form-field full"><label class="fl">Notas</label><input class="form-input" id="vf-notas" value="${esc(g('notas'))}"></div>
    </div>
    ${v ? `<div class="nota">Choferes: ${choferesDe(v.id).map(p => esc(p.nombre)).join(', ') || 'ninguno'}. Se asignan desde la ficha de cada persona.</div>` : ''}
    <div class="modal-actions">
      ${v && S.admin ? '<button class="btn btn-rojo" id="vf-borrar">🗑 Eliminar</button>' : ''}
      <button class="btn btn-gris" data-cerrar>Cancelar</button><button class="btn btn-azul" id="vf-guardar">💾 Guardar</button>
    </div></div>`;
  const caja = $('#modal-vehiculo');
  $$('[data-cerrar]', caja).forEach(b => b.addEventListener('click', () => cerrar('modal-vehiculo')));
  $('#vf-guardar', caja).addEventListener('click', async () => {
    const err = $('#vf-err', caja); err.hidden = true;
    const patente = L.normPatente($('#vf-patente', caja).value);
    if (patente.length < 5) { err.textContent = 'Cargá la patente.'; err.hidden = false; return; }
    if (!v && S.vehiculos[patente]) { err.textContent = 'Ya existe un vehículo con esa patente.'; err.hidden = false; return; }
    const nuevo = { id: patente, patente, tipo: $('#vf-tipo', caja).value, marca: $('#vf-marca', caja).value.trim(), modelo: $('#vf-modelo', caja).value.trim(),
      anio: $('#vf-anio', caja).value.trim(), interno: $('#vf-interno', caja).value.trim(), estado: $('#vf-estado', caja).value, notas: $('#vf-notas', caja).value.trim() };
    try { await guardarItems('vehiculos', [nuevo]); toast('✅ Vehículo guardado'); cerrar('modal-vehiculo'); }
    catch (e) { err.textContent = 'No se pudo guardar: ' + (e.code === 'permission-denied' ? 'tu usuario no tiene permiso de edición.' : e.message); err.hidden = false; }
  });
  if ($('#vf-borrar', caja)) $('#vf-borrar', caja).addEventListener('click', async () => {
    const ch = choferesDe(v.id);
    if (!window.confirm(ch.length ? 'Este vehículo tiene ' + ch.length + ' chofer(es) asignado(s). ¿Eliminarlo igual? Esas fichas quedarán con la patente sin vehículo.' : '¿Eliminar este vehículo?')) return;
    try { await borrarItem('vehiculos', v.id); toast('Vehículo eliminado'); cerrar('modal-vehiculo'); } catch (e) { toast('No se pudo eliminar: ' + e.message, 4000); }
  });
  abrir('modal-vehiculo');
}

// ---------- importación ----------
const SINONIMOS = { patente: ['patente', 'dominio', 'matricula'], tipo: ['tipo', 'tipo de vehiculo'], marca: ['marca'], modelo: ['modelo'],
  anio: ['anio', 'ano', 'año'], interno: ['interno', 'n interno', 'nro interno', 'numero de interno'], estado: ['estado', 'situacion'], notas: ['notas', 'observaciones', 'obs'] };
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function leerArchivo(archivo, input) {
  if (!archivo) return;
  const aviso = $('#vprev', el); aviso.innerHTML = '<div class="aviso">Leyendo el archivo…</div>';
  try {
    const XLSX = await cargarXLSX();
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
    if (!filas.length) throw new Error('El archivo no tiene filas.');
    const cols = Object.keys(filas[0]);
    const col = {}; Object.entries(SINONIMOS).forEach(([k, sin]) => { col[k] = cols.find(c => sin.includes(sinTildes(c))); });
    if (!col.patente) throw new Error('No encontré una columna "Patente" (o "Dominio"). Columnas del archivo: ' + cols.join(', '));
    const mapa = new Map(), invalidas = [];
    filas.forEach((f, i) => {
      const patente = L.normPatente(f[col.patente]);
      if (patente.length < 5) { if (String(f[col.patente]).trim()) invalidas.push(i + 2); return; }
      const est = ESTADOS.find(e => sinTildes(e) === sinTildes(f[col.estado])) || (sinTildes(f[col.estado]).includes('baja') ? 'Baja' : 'Operativo');
      const tipo = TIPOS.find(t => sinTildes(t) === sinTildes(f[col.tipo])) || (f[col.tipo] ? String(f[col.tipo]).trim() : 'Auto');
      mapa.set(patente, { id: patente, patente, tipo, marca: String(f[col.marca] || '').trim(), modelo: String(f[col.modelo] || '').trim(),
        anio: String(f[col.anio] || '').trim(), interno: String(f[col.interno] || '').trim(), estado: est, notas: String(f[col.notas] || '').trim() });
    });
    const items = [...mapa.values()];
    prevista = { items, nuevos: items.filter(v => !S.vehiculos[v.id]).length, faltan: lista('vehiculos').filter(v => !mapa.has(v.id) && v.estado !== 'Baja') };
    aviso.innerHTML = `<div class="aviso aviso-ok"><b>${items.length}</b> vehículos en el archivo: <b>${prevista.nuevos}</b> nuevos y <b>${items.length - prevista.nuevos}</b> que se actualizan.
      ${invalidas.length ? `<br>${invalidas.length} filas sin patente válida (filas ${invalidas.slice(0, 8).join(', ')}${invalidas.length > 8 ? '…' : ''}) se ignoran.` : ''}
      ${prevista.faltan.length ? `<br><label class="chk"><input type="checkbox" id="vimp-baja"> Marcar como <b>Baja</b> los ${prevista.faltan.length} que están en el sistema y no figuran en el archivo</label>` : ''}
      <div class="modal-actions"><button class="btn btn-gris" id="vimp-no">Cancelar</button><button class="btn btn-azul" id="vimp-ok">Aplicar</button></div></div>`;
    $('#vimp-no', el).addEventListener('click', () => { prevista = null; aviso.innerHTML = ''; });
    $('#vimp-ok', el).addEventListener('click', async () => {
      const lote = [...prevista.items];
      if ($('#vimp-baja', el) && $('#vimp-baja', el).checked) prevista.faltan.forEach(v => lote.push({ ...v, estado: 'Baja' }));
      $('#vimp-ok', el).disabled = true;
      try { await guardarItems('vehiculos', lote); toast('✅ Listado actualizado (' + lote.length + ')'); prevista = null; aviso.innerHTML = ''; }
      catch (e) { toast('No se pudo importar: ' + e.message, 5000); $('#vimp-ok', el).disabled = false; }
    });
  } catch (e) {
    aviso.innerHTML = `<div class="aviso aviso-mal">${esc(e.message)}</div>`;
  } finally { input.value = ''; }
}
