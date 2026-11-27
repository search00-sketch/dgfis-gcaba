// Pestaña Talonarios: qué rango de actas tiene cada persona, cuál fue la última
// acta labrada y cuándo, y cuántas quedan. Lee las actas de la colección
// existente (sólo lectura); no modifica nada de Estadísticas.
import { S, lista, guardarTalonarios, borrarTalonario, nuevoId, cargarActas, statsTalonarios } from './store.js';
import * as L from './logica.js';
import { $, $$, esc, debounce, toast, abrir, cerrar, fmtFecha, fmtNum, hace, descargarCSV, cargarXLSX } from './dom.js';

const opcionesTipo = sel => Object.entries(L.TIPOS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');

let el, vista = 'talonarios', filtro = { q: '', tipo: '', estado: 'activo' }, orden = 'persona', pidiendoActas = false;

export function mount(raiz) {
  el = raiz;
  el.innerHTML = `
    <div class="toolbar">
      <div class="seg"><button class="btn btn-azul" data-v="talonarios">📖 Por talonario</button><button class="btn btn-gris" data-v="personas">👤 Por persona</button></div>
      <input class="search-input" id="tq" placeholder="🔍 Persona (DNI o nombre) o número de acta…" autocomplete="off">
      <select class="ctrl" id="ttipo"><option value="">Todos los tipos</option>${opcionesTipo('')}</select>
      <select class="ctrl" id="test"><option value="activo">Activos</option><option value="cerrado">Cerrados</option><option value="">Todos</option></select>
      <select class="ctrl" id="tord"><option value="persona">Orden: persona</option><option value="antiguo">Orden: más tiempo sin labrar</option><option value="restan">Orden: menos restantes</option></select>
      <button class="btn btn-verde" id="tnuevo">＋ Nuevo talonario</button>
      <label class="btn btn-azul" id="timp-btn" title="La planilla ACTAS 2026.xlsx (hojas Actas secuestro / comprobacion / Intimacion)">📥 Importar planilla de actas<input type="file" id="timp" accept=".xlsx,.xls" hidden></label>
      <button class="btn btn-gris" id="tcsv">⬇ Exportar</button>
    </div>
    <div id="timp-res"></div>
    <div class="kpis" id="tkpis"></div>
    <div id="taviso"></div>
    <div class="table-wrap"><table class="rtbl"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>`;
  $$('[data-v]', el).forEach(b => b.addEventListener('click', () => { vista = b.dataset.v; render(); }));
  const q = $('#tq', el);
  q.addEventListener('input', debounce(() => { filtro.q = q.value; render(); }, 180));
  $('#ttipo', el).addEventListener('change', e => { filtro.tipo = e.target.value; render(); });
  $('#test', el).addEventListener('change', e => { filtro.estado = e.target.value; render(); });
  $('#tord', el).addEventListener('change', e => { orden = e.target.value; render(); });
  $('#tnuevo', el).addEventListener('click', () => abrirForm({}));
  $('#tcsv', el).addEventListener('click', exportar);
  $('#timp', el).addEventListener('change', e => leerPlanilla(e.target.files[0], e.target));
  $('#tbody', el).addEventListener('click', ev => { const b = ev.target.closest('[data-edit]'); if (b) abrirForm({ id: b.dataset.edit }); });
  $('#taviso', el).addEventListener('click', ev => { if (ev.target.id === 'tcargar') pedirActas(true); });
  $('#modal-talonario').addEventListener('click', ev => { if (ev.target.id === 'modal-talonario') cerrar('modal-talonario'); });
}

async function pedirActas(forzar) {
  if (pidiendoActas) return;
  pidiendoActas = true; render();
  try { await cargarActas(forzar); } catch (e) { /* el mensaje queda en S.actasError */ }
  pidiendoActas = false; render();
}

function filas() {
  const st = statsTalonarios() || {};
  const q = filtro.q.trim(), dq = L.dg(q);
  let ts = lista('talonarios').filter(t => (!filtro.tipo || t.tipo === filtro.tipo) && (!filtro.estado || (t.estado || 'activo') === filtro.estado));
  if (q) {
    ts = ts.filter(t => {
      const p = S.porDni.get(t.dni);
      if (dq && dq.length >= 4 && dq === q.replace(/[.\-\s]/g, '')) {
        const n = Number(dq);
        return t.dni.startsWith(dq) || (n >= t.desde && n <= t.hasta);
      }
      return p && L.buscarPersonas([p], q).length > 0;
    });
  }
  const dias = t => { const s = st[t.id]; return s && s.ultimaFecha ? L.diasEntre(s.ultimaFecha) : null; };
  const nom = t => (S.porDni.get(t.dni) || { nombre: '~' }).nombre;
  ts.sort((a, b) => orden === 'antiguo' ? ((dias(b) ?? 1e6) - (dias(a) ?? 1e6))
    : orden === 'restan' ? (((st[a.id] || {}).restantes ?? 1e9) - ((st[b.id] || {}).restantes ?? 1e9))
    : nom(a).localeCompare(nom(b), 'es') || a.desde - b.desde);
  return { ts, st, dias };
}

export function render() {
  if (!el) return;
  $$('[data-v]', el).forEach(b => b.className = 'btn ' + (b.dataset.v === vista ? 'btn-azul' : 'btn-gris'));
  $('#tnuevo', el).hidden = !S.editar; $('#timp-btn', el).hidden = !S.editar;
  if (!S.actas && !S.actasError && !pidiendoActas) pedirActas(false);
  const { ts, st, dias } = filas();
  const hay = !!S.actas;
  // aviso de estado de las actas
  $('#taviso', el).innerHTML = pidiendoActas ? '<div class="aviso">Leyendo las actas para calcular la última de cada talonario…</div>'
    : !hay ? `<div class="aviso aviso-mal">${esc(S.actasError || 'Todavía no se leyeron las actas.')} <button class="btn btn-sm btn-gris" id="tcargar">Reintentar</button></div>`
    : `<div class="aviso aviso-ok">Actas leídas: ${fmtNum(S.actas.length)} con número. Última acta cargada en el sistema: ${fmtFecha(S.actas.reduce((m, a) => a.fecha > m ? a.fecha : m, ''))}. <button class="btn btn-sm btn-gris" id="tcargar">Releer</button></div>`;
  // KPIs
  const activos = lista('talonarios').filter(t => (t.estado || 'activo') === 'activo');
  const sinMov = activos.filter(t => { const s = st[t.id]; return s && (s.ultimaFecha ? L.diasEntre(s.ultimaFecha) > 30 : true); }).length;
  const personas = new Set(activos.map(t => t.dni)).size;
  const agot = activos.filter(t => st[t.id] && st[t.id].agotado).length;
  $('#tkpis', el).innerHTML = [['Talonarios activos', activos.length], ['Personas con talonario', personas],
    ['Sin actas hace +30 días', hay ? sinMov : '—'], ['Agotados sin cerrar', hay ? agot : '—']]
    .map(([k, v]) => `<div class="kpi"><div class="kpi-n">${v}</div><div class="kpi-l">${k}</div></div>`).join('');

  if (vista === 'talonarios') {
    $('#thead', el).innerHTML = '<tr><th>Talonario</th><th>Persona</th><th>Entregado</th><th>Uso</th><th>Última acta labrada</th><th>Último nº del talonario</th><th>Restan</th><th>Avisos</th><th></th></tr>';
    $('#tbody', el).innerHTML = ts.map(t => {
      const p = S.porDni.get(t.dni), s = st[t.id];
      const avisos = s ? [s.saltadas ? s.saltadas + ' saltadas' : '', s.repetidas ? s.repetidas + ' repetidas' : '', s.ajenas ? s.ajenas + ' de otra persona' : ''].filter(Boolean) : [];
      return `<tr>
        <td class="mono">${esc(L.TIPOS[t.tipo] || t.tipo)}<br><b>${t.desde}–${t.hasta}</b>${t.largo ? ` <span class="nota">${t.largo} díg.</span>` : ''}${t.notas ? `<br><span class="nota" title="${esc(t.notas)}">${esc(t.notas.slice(0, 40))}</span>` : ''}</td>
        <td>${p ? `<b>${esc(p.nombre)}</b><br><span class="nota mono">${esc(p.dni)}</span>` : `<span class="err-linea">DNI ${esc(t.dni)} no está en Personas</span>`}</td>
        <td>${fmtFecha(t.entregadoEn)}</td>
        <td>${s && !s.sinFuente ? `${s.usadas} / ${s.total}<div class="barra"><i style="width:${Math.min(100, s.pct)}%"></i></div>` : (s ? `<span class="nota">${s.total} números</span>` : '—')}</td>
        <td>${s && s.sinFuente ? '<span class="nota" title="Las actas del portal no incluyen las de intimación">sin fuente de actas</span>' : s ? (s.ultimaFecha ? `<b class="mono">${s.ultimaNro}</b><br>${fmtFecha(s.ultimaFecha)} <span class="nota">${hace(dias(t))}</span>` : '<span class="nota">ninguna todavía</span>') : '—'}</td>
        <td class="mono">${t.hasta}</td>
        <td>${s && !s.sinFuente ? (s.agotado ? '<span class="badge bdg-baja">agotado</span>' : s.restantes) : '—'}</td>
        <td class="nota">${avisos.map(esc).join('<br>')}</td>
        <td>${S.editar ? `<button class="btn btn-sm btn-gris" data-edit="${esc(t.id)}">✏️</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="vacio">No hay talonarios con estos filtros. Cargá el primero con "Nuevo talonario".</td></tr>';
  } else {
    const por = L.ultimaPorPersona(ts, st);
    const grupos = new Map();
    ts.forEach(t => { (grupos.get(t.dni) || grupos.set(t.dni, []).get(t.dni)).push(t); });
    const filasP = [...grupos.entries()].map(([dni, tl]) => ({ dni, p: S.porDni.get(dni), n: tl.length, u: por[dni] }));
    filasP.sort((a, b) => orden === 'antiguo' ? ((b.u ? L.diasEntre(b.u.fecha) : 1e6) - (a.u ? L.diasEntre(a.u.fecha) : 1e6)) : ((a.p || { nombre: '~' }).nombre).localeCompare((b.p || { nombre: '~' }).nombre, 'es'));
    $('#thead', el).innerHTML = '<tr><th>Persona</th><th>Talonarios</th><th>Última acta labrada</th><th>Fecha</th><th>Hace</th></tr>';
    $('#tbody', el).innerHTML = filasP.map(f => `<tr>
      <td>${f.p ? `<b>${esc(f.p.nombre)}</b><br><span class="nota mono">${esc(f.dni)}</span>` : `<span class="err-linea">DNI ${esc(f.dni)} no está en Personas</span>`}</td>
      <td>${f.n}</td>
      <td class="mono">${f.u ? '<b>' + f.u.nro + '</b>' : '—'}</td><td>${f.u ? fmtFecha(f.u.fecha) : '—'}</td>
      <td>${f.u ? hace(L.diasEntre(f.u.fecha)) : (hay ? 'sin actas' : '—')}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin datos.</td></tr>';
  }
}

function exportar() {
  const { ts, st } = filas();
  const f = [['Tipo', 'Desde', 'Hasta', 'Dígitos', 'DNI', 'Persona', 'Entregado', 'Estado', 'Usadas', 'Restan', 'Última acta', 'Fecha última acta', 'Saltadas', 'Repetidas', 'De otra persona']];
  ts.forEach(t => { const p = S.porDni.get(t.dni), s = st[t.id] || {};
    f.push([t.tipo, t.desde, t.hasta, t.largo || '', t.dni, p ? p.nombre : '', t.entregadoEn || '', t.estado || 'activo', s.usadas ?? '', s.restantes ?? '', s.ultimaNro ?? '', s.ultimaFecha || '', s.saltadas ?? '', s.repetidas ?? '', s.ajenas ?? '']); });
  descargarCSV('talonarios.csv', f);
}

// ---------- alta / edición (también la llama la ficha de la persona) ----------
export function abrirForm({ id, dni } = {}) {
  const t = id ? S.talonarios[id] : null;
  const g = (k, def = '') => (t && t[k] != null ? t[k] : def);
  const pers = S.personas.filter(p => p.estado !== 'Baja' || (t && p.dni === t.dni));
  const actual = dni || (t && t.dni) || '';
  const hoy = new Date().toISOString().slice(0, 10);
  $('#modal-talonario').innerHTML = `<div class="modal" style="max-width:560px">
    <button class="modal-close" data-cerrar>✕</button>
    <div class="modal-title">${t ? 'Editar talonario' : 'Nuevo talonario'}</div>
    <div id="tf-err" class="err-linea" hidden></div><div id="tf-avisos" class="aviso" hidden></div>
    <div class="form-grid">
      <div class="form-field"><label class="fl">Tipo de acta</label><select class="form-input" id="tf-tipo">${opcionesTipo(g('tipo', 'secuestro'))}</select></div>
      <div class="form-field"><label class="fl">Dígitos del número (opcional)</label><input class="form-input" id="tf-largo" inputmode="numeric" value="${esc(g('largo'))}" placeholder="ej. 5, 7 u 8"></div>
      <div class="form-field"><label class="fl">Desde el N°</label><input class="form-input mono" id="tf-desde" inputmode="numeric" value="${esc(g('desde'))}"></div>
      <div class="form-field"><label class="fl">Hasta el N° (último del talonario)</label><input class="form-input mono" id="tf-hasta" inputmode="numeric" value="${esc(g('hasta'))}"></div>
      <div class="form-field full"><label class="fl">Persona (DNI o nombre)</label>
        <input class="form-input" id="tf-persona" list="tf-lista" autocomplete="off" value="${esc(actual ? (S.porDni.get(actual) ? actual + ' — ' + S.porDni.get(actual).nombre : actual) : '')}" placeholder="Escribí y elegí de la lista">
        <datalist id="tf-lista">${pers.map(p => `<option value="${esc(p.dni + ' — ' + p.nombre)}"></option>`).join('')}</datalist></div>
      <div class="form-field"><label class="fl">Fecha de entrega</label><input type="date" class="form-input" id="tf-fecha" value="${esc(g('entregadoEn', hoy))}"></div>
      <div class="form-field"><label class="fl">Estado</label><select class="form-input" id="tf-estado"><option value="activo" ${g('estado', 'activo') === 'activo' ? 'selected' : ''}>Activo</option><option value="cerrado" ${g('estado') === 'cerrado' ? 'selected' : ''}>Cerrado</option></select></div>
      <div class="form-field full"><label class="fl">Notas</label><input class="form-input" id="tf-notas" value="${esc(g('notas'))}"></div>
    </div>
    <div class="modal-actions">
      ${t && S.admin ? '<button class="btn btn-rojo" id="tf-borrar">🗑 Eliminar</button>' : ''}
      <button class="btn btn-gris" data-cerrar>Cancelar</button>
      <button class="btn btn-azul" id="tf-guardar">💾 Guardar</button>
    </div></div>`;
  const caja = $('#modal-talonario');
  $$('[data-cerrar]', caja).forEach(b => b.addEventListener('click', () => cerrar('modal-talonario')));
  $('#tf-guardar', caja).addEventListener('click', () => guardar(t));
  if ($('#tf-borrar', caja)) $('#tf-borrar', caja).addEventListener('click', async () => {
    if (!window.confirm('¿Eliminar este talonario? Las actas ya labradas no se tocan.')) return;
    try { await borrarTalonario(t.id); toast('Talonario eliminado'); cerrar('modal-talonario'); } catch (e) { toast('No se pudo eliminar: ' + e.message, 4000); }
  });
  abrir('modal-talonario');
}

async function guardar(t) {
  const caja = $('#modal-talonario'), err = $('#tf-err', caja), av = $('#tf-avisos', caja);
  const mal = m => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  const m = $('#tf-persona', caja).value.match(/^\s*(\d{6,9})/);
  const dni = m ? L.normDni(m[1]) : L.claveDeBusqueda($('#tf-persona', caja).value);
  if (!dni || !S.porDni.has(dni)) return mal('Elegí una persona de la lista (tiene que existir en Personas).');
  const num = id => { const s = $(id, caja).value.trim(); return /^\d+$/.test(s) ? parseInt(s, 10) : NaN; };
  const largoTxt = $('#tf-largo', caja).value.trim();
  const nuevo = { id: t ? t.id : nuevoId(), tipo: $('#tf-tipo', caja).value, desde: num('#tf-desde'), hasta: num('#tf-hasta'),
    largo: largoTxt ? parseInt(largoTxt, 10) : 0, dni, entregadoEn: $('#tf-fecha', caja).value, estado: $('#tf-estado', caja).value,
    notas: $('#tf-notas', caja).value.trim() };
  if (largoTxt && !/^\d+$/.test(largoTxt)) return mal('"Dígitos" tiene que ser un número.');
  const v = L.validarTalonario(nuevo, lista('talonarios'));
  if (v.errores.length) return mal(v.errores.join(' '));
  if (v.avisos.length && !av.dataset.visto) { av.textContent = v.avisos.join(' ') + ' Tocá Guardar otra vez para confirmar.'; av.hidden = false; av.dataset.visto = '1'; return; }
  const b = $('#tf-guardar', caja); b.disabled = true; b.textContent = 'Guardando…';
  try { await guardarTalonarios([nuevo]); toast('✅ Talonario guardado'); cerrar('modal-talonario'); }
  catch (e) { mal('No se pudo guardar: ' + (e.code === 'permission-denied' ? 'tu usuario no tiene permiso de edición.' : e.message)); b.disabled = false; b.textContent = '💾 Guardar'; }
}

// ---------- importación de la planilla "ACTAS 2026.xlsx" ----------
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function leerPlanilla(archivo, input) {
  if (!archivo) return;
  const caja = $('#timp-res', el);
  caja.innerHTML = '<div class="aviso">Leyendo la planilla…</div>';
  try {
    if (!S.personas.length) throw new Error('Todavía no hay personas cargadas: primero importá la nómina (pestaña "Importar nómina").');
    const XLSX = await cargarXLSX();
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const hojas = {};
    libro.SheetNames.forEach(n => {
      const k = sinTildes(n);
      const tipo = !k.startsWith('actas ') || k.includes('denunciar') ? null : k.includes('secuestro') ? 'secuestro' : k.includes('comprobacion') ? 'comprobacion' : k.includes('intimacion') ? 'intimacion' : null;
      if (tipo) hojas[tipo] = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: null, raw: true });
    });
    if (!Object.keys(hojas).length) throw new Error('No encontré las hojas "Actas secuestro", "Actas comprobacion" ni "Actas Intimacion". Hojas del archivo: ' + libro.SheetNames.join(', '));
    const r = L.parsearPlanillaActas(hojas, 'planilla ' + archivo.name);
    const conPersona = r.talonarios.filter(t => S.porDni.has(t.dni));
    const sinPersona = r.talonarios.filter(t => !S.porDni.has(t.dni));
    // Lo que ya existe se actualiza pero conserva el estado que se le puso a mano.
    const lote = conPersona.map(t => S.talonarios[t.id] ? { ...t, estado: S.talonarios[t.id].estado || t.estado } : t);
    const nuevos = lote.filter(t => !S.talonarios[t.id]).length;
    const porTipo = Object.keys(L.TIPOS).map(k => `${L.TIPOS[k]}: <b>${lote.filter(t => t.tipo === k).length}</b>`).join(' · ');
    caja.innerHTML = `<div class="aviso aviso-ok">
      <b>${lote.length}</b> talonarios listos (${porTipo}): <b>${nuevos}</b> nuevos y <b>${lote.length - nuevos}</b> que ya estaban y se actualizan.
      <br>Cada fila se asocia a la persona por el CUIT (su DNI). De los talonarios de cada persona queda activo sólo el último, salvo que su nota diga que se entregó a legales, se extravió o se terminó.
      ${sinPersona.length ? `<br>⚠️ <b>${sinPersona.length}</b> talonarios no se importan porque esa persona no está en Personas (${new Set(sinPersona.map(t => t.dni)).size} DNI).` : ''}
      ${r.sinCuit.length ? `<br>⚠️ ${r.sinCuit.length} entregas sin CUIT válido.` : ''}
      ${r.ignoradas.length ? `<br>⚠️ ${r.ignoradas.length} celdas ignoradas (rangos al revés, números incompletos…).` : ''}
      <div class="modal-actions">
        ${r.ignoradas.length || sinPersona.length || r.sinCuit.length ? '<button class="btn btn-gris" id="timp-rev">⬇ Lista para revisar</button>' : ''}
        <button class="btn btn-gris" id="timp-no">Cancelar</button>
        <button class="btn btn-azul" id="timp-ok" ${lote.length ? '' : 'disabled'}>Importar ${lote.length}</button>
      </div></div>`;
    $('#timp-no', el).addEventListener('click', () => { caja.innerHTML = ''; });
    const rev = $('#timp-rev', el);
    if (rev) rev.addEventListener('click', () => descargarCSV('planilla-actas-para-revisar.csv', [
      ['Motivo', 'Tipo', 'Fila de la hoja', 'Nombre en la planilla', 'Detalle'],
      ...r.ignoradas.map(x => [x.motivo, L.TIPOS[x.tipo], x.fila, x.nombre, x.texto]),
      ...r.sinCuit.map(x => ['Sin CUIT válido', L.TIPOS[x.tipo], x.fila, x.nombre, x.texto]),
      ...sinPersona.map(t => ['La persona no está en Personas', L.TIPOS[t.tipo], '', '', t.desde + '–' + t.hasta + ' (DNI ' + t.dni + ')'])]));
    $('#timp-ok', el).addEventListener('click', async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Guardando…';
      try { await guardarTalonarios(lote); toast('✅ ' + lote.length + ' talonarios importados'); caja.innerHTML = ''; }
      catch (e) { toast('No se pudo importar: ' + (e.code === 'permission-denied' ? 'tu usuario no tiene permiso de edición.' : e.message), 5000); ev.target.disabled = false; ev.target.textContent = 'Importar ' + lote.length; }
    });
  } catch (e) {
    caja.innerHTML = `<div class="aviso aviso-mal">${esc(e.message)}</div>`;
  } finally { input.value = ''; }
}
