// Pestaña Personas: buscador por DNI/CUIL/nombre y ficha editable.
import { S, lista, guardarPersona, getSensibles, guardarSensibles, statsTalonarios, cargarActas } from './store.js';
import * as L from './logica.js';
import { $, $$, esc, debounce, toast, abrir, cerrar, fmtFecha, hace, descargarCSV } from './dom.js';

const PAGINA = 100;
let el, filtro = { q: '', cat: '', estado: 'Activo' }, limite = PAGINA, abierta = null; // abierta = dni de la ficha abierta ('' = nueva)

export function mount(raiz) {
  el = raiz;
  el.innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="pq" placeholder="🔍 DNI, CUIL/CUIT o nombre…" autocomplete="off">
      <select class="ctrl" id="pcat"><option value="">Todas las categorías</option>${L.CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <select class="ctrl" id="pest"><option value="Activo">Activos</option><option value="Baja">Bajas</option><option value="">Todos</option></select>
      <button class="btn btn-verde" id="pnueva">＋ Nueva persona</button>
      <button class="btn btn-gris" id="pcsv" title="Descarga la lista filtrada">⬇ Exportar lista</button>
    </div>
    <div class="info-linea" id="pinfo"></div>
    <div class="table-wrap"><table class="rtbl">
      <thead><tr><th>DNI</th><th>Nombre</th><th>Categorías</th><th>Turno</th><th>Estado</th><th>Vehículo</th></tr></thead>
      <tbody id="pbody"></tbody></table></div>
    <div class="pager"><button class="btn btn-gris" id="pmas" hidden>Ver más</button></div>`;
  const q = $('#pq', el);
  q.addEventListener('input', debounce(() => { filtro.q = q.value; limite = PAGINA; render(); }, 180));
  q.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    const dni = L.claveDeBusqueda(q.value);
    if (dni && S.porDni.has(dni)) abrirFicha(dni);
    else if (dni) toast('No hay nadie con DNI ' + dni + '. Podés crearla con "Nueva persona".');
  });
  $('#pcat', el).addEventListener('change', e => { filtro.cat = e.target.value; limite = PAGINA; render(); });
  $('#pest', el).addEventListener('change', e => { filtro.estado = e.target.value; limite = PAGINA; render(); });
  $('#pmas', el).addEventListener('click', () => { limite += PAGINA; render(); });
  $('#pnueva', el).addEventListener('click', () => abrirFicha(''));
  $('#pcsv', el).addEventListener('click', exportar);
  $('#pbody', el).addEventListener('click', ev => { const tr = ev.target.closest('tr[data-dni]'); if (tr) abrirFicha(tr.dataset.dni); });
  $('#modal-ficha').addEventListener('click', ev => { if (ev.target.id === 'modal-ficha') cerrar('modal-ficha'); });
}

function filtrar() {
  let l = S.personas;
  if (filtro.estado) l = l.filter(p => (p.estado || 'Activo') === filtro.estado);
  if (filtro.cat) l = l.filter(p => (p.categorias || []).includes(filtro.cat));
  return L.buscarPersonas(l, filtro.q);
}

export function render() {
  if (!el) return;
  $('#pnueva', el).hidden = !S.editar;
  const todas = filtrar(), vista = todas.slice(0, limite);
  $('#pinfo', el).textContent = todas.length + ' de ' + S.personas.length + ' personas';
  $('#pbody', el).innerHTML = vista.map(p => {
    const v = p.vehiculoId && S.vehiculos[p.vehiculoId];
    return `<tr data-dni="${esc(p.dni)}" class="fila-click">
      <td class="mono">${esc(p.dni)}</td><td><b>${esc(p.nombre)}</b></td>
      <td>${(p.categorias || []).map(c => `<span class="chip">${esc(c)}</span>`).join('')}</td>
      <td>${esc(p.turno || '')}</td>
      <td><span class="badge ${p.estado === 'Baja' ? 'bdg-baja' : 'bdg-activo'}">${esc(p.estado || 'Activo')}</span></td>
      <td class="mono">${v ? esc(v.patente) : (p.vehiculoId ? esc(p.vehiculoId) + ' ⚠️' : '')}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="vacio">Nada para mostrar con estos filtros.</td></tr>';
  $('#pmas', el).hidden = todas.length <= limite;
  if (abierta !== null && $('#modal-ficha').classList.contains('open')) pintarTalonarios();
}

function exportar() {
  const filas = [['DNI', 'CUIL', 'Nombre', 'Categorías', 'Rol', 'Turno', 'Modalidad', 'Estado', 'Vehículo']];
  filtrar().forEach(p => filas.push([p.dni, p.cuil, p.nombre, (p.categorias || []).join(' / '), p.rol, p.turno, p.modalidad, p.estado, p.vehiculoId]));
  descargarCSV('personas.csv', filas);
}

// ---------- ficha ----------
const campo = (k, etiqueta, valor, o = {}) => {
  const comun = `data-k="${k}" ${o.ro ? 'readonly' : ''} ${o.solo ? 'disabled' : ''}`;
  let ctrl;
  if (o.opciones) ctrl = `<select class="form-input" ${comun}>${o.opciones.map(x => `<option ${x === valor ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  else ctrl = `<input class="form-input ${o.mono ? 'mono' : ''}" ${comun} value="${esc(valor)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} autocomplete="off">`;
  return `<div class="form-field ${o.full ? 'full' : ''}"><label class="fl">${esc(etiqueta)}</label>${ctrl}</div>`;
};
const SENS_CAMPOS = [['cbu', 'CBU'], ['imei', 'IMEI'], ['telEmergencia', 'Tel. de emergencia'], ['contactoEmergencia', 'Contacto de emergencia'], ['fechaNacimiento', 'Fecha de nacimiento'], ['leyDiscapacidad', 'Ley de discapacidad']];

export async function abrirFicha(dni) {
  const p = dni ? S.porDni.get(dni) : null;
  if (dni && !p) { toast('No se encontró esa persona.'); return; }
  abierta = dni || '';
  const ro = !S.editar, g = k => (p ? p[k] || '' : '');
  const cats = p ? p.categorias || [] : [];
  $('#modal-ficha').innerHTML = `<div class="modal ficha-modal">
    <button class="modal-close" data-cerrar>✕</button>
    <div class="modal-title">${p ? esc(p.nombre) : 'Nueva persona'}</div>
    ${p ? `<div class="ficha-sub"><span class="chip mono">DNI ${esc(p.dni)}</span>${p.cuil ? `<span class="chip mono">CUIL ${esc(p.cuil)}</span>` : ''}${p.legacyIds && p.legacyIds.length ? `<span class="chip" title="Identificadores de la nómina anterior">nómina anterior: ${esc(p.legacyIds.join(', '))}</span>` : ''}</div>` : '<p class="nota">Cargá el DNI o el CUIL/CUIT: el otro se deduce. Ese número es la clave única de la persona y después no se cambia.</p>'}
    <div id="ficha-err" class="err-linea" hidden></div>
    <h4 class="sec">Identidad</h4>
    <div class="form-grid">
      ${campo('dni', 'DNI', g('dni'), { ro: !!p || ro, mono: 1 })}
      ${campo('cuil', 'CUIL / CUIT', g('cuil'), { ro, mono: 1, ph: '20-12345678-3' })}
      ${campo('nombre', 'Apellido y nombre', g('nombre'), { full: 1, ro })}
      ${campo('genero', 'Género', g('genero'), { ro })}
    </div>
    <h4 class="sec">Contacto</h4>
    <div class="form-grid">
      ${campo('celular', 'Celular', g('celular'), { ro })}${campo('celularFlota', 'Celular de flota', g('celularFlota'), { ro })}
      ${campo('mailPersonal', 'Mail personal', g('mailPersonal'), { ro })}${campo('mailInstitucional', 'Mail institucional', g('mailInstitucional'), { ro })}
      ${campo('domicilio', 'Domicilio', g('domicilio'), { full: 1, ro })}
      ${campo('barrio', 'Barrio', g('barrio'), { ro })}${campo('comuna', 'Comuna', g('comuna'), { ro })}
    </div>
    <h4 class="sec">Laboral</h4>
    <div class="form-grid">
      ${campo('estado', 'Estado', g('estado') || 'Activo', { opciones: ['Activo', 'Baja'], solo: ro })}
      ${campo('rol', 'Rol / cargo', g('rol'), { ro })}
      ${campo('jefatura', 'Jefatura', g('jefatura'), { ro })}${campo('coordinador', 'Coordinador', g('coordinador'), { ro })}
      ${campo('turno', 'Turno', g('turno'), { ro })}${campo('modalidad', 'Modalidad', g('modalidad'), { ro })}
      ${campo('horario', 'Horario', g('horario'), { ro })}${campo('oficinaCalle', 'Oficina / calle', g('oficinaCalle'), { ro })}
      ${campo('fechaIngreso', 'Fecha de ingreso', g('fechaIngreso'), { ro })}${campo('fechaBaja', 'Fecha de baja', g('fechaBaja'), { ro })}
      ${campo('motivoBaja', 'Motivo de baja', g('motivoBaja'), { full: 1, ro })}
    </div>
    <h4 class="sec">Categorías</h4>
    <div class="cats">${L.CATEGORIAS.map(c => `<label class="chk"><input type="checkbox" data-cat="${esc(c)}" ${cats.includes(c) ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${esc(c)}</label>`).join('')}</div>
    <div id="ficha-veh" class="form-grid" hidden>
      <div class="form-field full"><label class="fl">Vehículo asignado (chofer)</label>
        <select class="form-input" data-k="vehiculoId" ${ro ? 'disabled' : ''}>${opcionesVehiculo(g('vehiculoId'))}</select></div>
    </div>
    ${p ? `<h4 class="sec">Talonarios de actas <button class="btn btn-sm btn-azul" id="ficha-asignar" ${S.editar ? '' : 'hidden'}>＋ Asignar talonario</button></h4><div id="ficha-tal"></div>` : ''}
    ${S.admin ? `<h4 class="sec">Datos sensibles <span class="nota">(sólo administradores)</span></h4><div class="form-grid" id="ficha-sens"><div class="nota">Cargando…</div></div>` : ''}
    ${p && ((p.historial && p.historial.length) || (p.extra && Object.keys(p.extra).length)) ? `<details class="mas"><summary>Historial y otros datos de la nómina anterior</summary>
      ${(p.historial || []).map(h => `<div class="nota">Registro anterior: ${esc(h.estado)} · ingreso ${esc(h.fechaIngreso || '—')} · baja ${esc(h.fechaBaja || '—')} ${esc(h.motivoBaja || '')}</div>`).join('')}
      ${Object.entries(p.extra || {}).map(([k, v]) => `<div class="nota"><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</details>` : ''}
    <div class="modal-actions">
      <button class="btn btn-gris" data-cerrar>Cerrar</button>
      ${S.editar ? '<button class="btn btn-azul" id="ficha-guardar">💾 Guardar</button>' : ''}
    </div></div>`;
  const caja = $('#modal-ficha');
  caja.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => { abierta = null; cerrar('modal-ficha'); }));
  const alternarVeh = () => { $('#ficha-veh', caja).hidden = !$('[data-cat="Chofer"]', caja).checked; };
  $('[data-cat="Chofer"]', caja).addEventListener('change', alternarVeh); alternarVeh();
  if ($('#ficha-guardar', caja)) $('#ficha-guardar', caja).addEventListener('click', () => guardar(p));
  if ($('#ficha-asignar', caja)) $('#ficha-asignar', caja).addEventListener('click', async () => (await import('./tab-talonarios.js')).abrirForm({ dni: p.dni }));
  abrir('modal-ficha');
  if (p) pintarTalonarios();
  if (S.admin) cargarSensiblesEnFicha(p);
}

function opcionesVehiculo(actual) {
  const vs = lista('vehiculos').filter(v => v.estado !== 'Baja' || v.id === actual).sort((a, b) => a.patente.localeCompare(b.patente));
  const extra = actual && !S.vehiculos[actual] ? `<option value="${esc(actual)}" selected>${esc(actual)} (ya no está en la lista)</option>` : '';
  return '<option value="">— sin vehículo —</option>' + extra + vs.map(v => `<option value="${esc(v.id)}" ${v.id === actual ? 'selected' : ''}>${esc(v.patente)} · ${esc([v.marca, v.modelo].filter(Boolean).join(' '))}${v.interno ? ' · int. ' + esc(v.interno) : ''}</option>`).join('');
}

async function cargarSensiblesEnFicha(p) {
  const caja = $('#ficha-sens'); if (!caja) return;
  try {
    const s = p ? await getSensibles(p.dni) : {};
    caja.innerHTML = SENS_CAMPOS.map(([k, e]) => campo('s_' + k, e, s[k] || '', { ro: !S.editar, mono: k === 'cbu' || k === 'imei' })).join('');
    caja.dataset.listo = '1';
  } catch (e) { caja.innerHTML = '<div class="err-linea">No se pudieron leer los datos sensibles: ' + esc(e.message) + '</div>'; }
}

function pintarTalonarios() {
  const caja = $('#ficha-tal'); if (!caja || !abierta) return;
  const ts = lista('talonarios').filter(t => t.dni === abierta).sort((a, b) => (b.entregadoEn || '').localeCompare(a.entregadoEn || ''));
  const st = statsTalonarios();
  if (!ts.length) { caja.innerHTML = '<div class="nota">Todavía no tiene talonarios asignados.</div>'; return; }
  const dias = f => L.diasEntre(f);
  caja.innerHTML = `<table class="rtbl mini"><thead><tr><th>Talonario</th><th>Entregado</th><th>Usadas</th><th>Última acta labrada</th></tr></thead><tbody>${ts.map(t => {
    const s = st && st[t.id];
    return `<tr><td class="mono">${esc(L.TIPOS[t.tipo] || t.tipo)} ${t.desde}–${t.hasta}${t.largo ? ' (' + t.largo + ' díg.)' : ''}${t.estado === 'cerrado' ? ' · cerrado' : ''}</td>
      <td>${fmtFecha(t.entregadoEn)}</td>
      <td>${s ? s.usadas + ' / ' + s.total : '—'}</td>
      <td>${s ? (s.ultimaFecha ? '<b class="mono">' + s.ultimaNro + '</b> · ' + fmtFecha(s.ultimaFecha) + ' <span class="nota">(' + hace(dias(s.ultimaFecha)) + ')</span>' : 'ninguna todavía') : '—'}</td></tr>`;
  }).join('')}</tbody></table>
  ${st ? '' : '<button class="btn btn-sm btn-gris" id="ficha-calc">Calcular última acta</button><span class="nota" id="ficha-calc-msg"></span>'}`;
  const b = $('#ficha-calc', caja);
  if (b) b.addEventListener('click', async () => { b.disabled = true; try { await cargarActas(); } catch (e) { $('#ficha-calc-msg', caja).textContent = ' ' + S.actasError; b.disabled = false; } });
}

async function guardar(actual) {
  const caja = $('#modal-ficha'), err = $('#ficha-err', caja);
  const falla = m => { err.textContent = m; err.hidden = false; caja.querySelector('.modal').scrollTo({ top: 0, behavior: 'smooth' }); };
  err.hidden = true;
  const v = {};
  $$('[data-k]', caja).forEach(i => { v[i.dataset.k] = (i.value || '').trim(); });
  if (!v.nombre) return falla('Falta el apellido y nombre.');
  let dni, cuil;
  if (actual) {
    dni = actual.dni;
    cuil = L.normCuil(v.cuil);
    if (v.cuil && !cuil) return falla('El CUIL/CUIT tiene que tener 11 dígitos.');
  } else {
    const idf = L.identificar({ dni: v.dni, cuil: v.cuil });
    if (!idf.id) return falla('Cargá un DNI (7 u 8 dígitos) o un CUIL/CUIT de 11 dígitos.');
    if (v.cuil && !idf.cuil) return falla('El CUIL/CUIT tiene que tener 11 dígitos.');
    dni = idf.id; cuil = idf.cuil;
    const ya = S.porDni.get(dni);
    if (ya) return falla('Ya existe una persona con ese DNI (' + ya.nombre + '). Buscala en la lista para editarla.');
  }
  if (cuil && L.dniDeCuil(cuil) !== dni) toast('Ojo: el CUIL no coincide con el DNI. Se guarda igual.', 4200);
  const cats = $$('[data-cat]', caja).filter(c => c.checked).map(c => c.dataset.cat);
  const BASE_EDIT = L.BASE.filter(k => k !== 'nombre');
  const nueva = { ...(actual || { extra: {}, historial: [], legacyIds: [], origen: 'manual', creadoEn: new Date().toISOString() }) };
  BASE_EDIT.forEach(k => { nueva[k] = v[k] ?? ''; });
  Object.assign(nueva, { dni, cuil, nombre: v.nombre, categorias: cats, vehiculoId: cats.includes('Chofer') ? (v.vehiculoId || '') : '',
    actualizadoEn: new Date().toISOString(), actualizadoPor: S.usuario ? S.usuario.username : '' });
  const btn = $('#ficha-guardar', caja); btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await guardarPersona(nueva);
    const sens = $('#ficha-sens', caja);
    if (S.admin && sens && sens.dataset.listo) {
      const s = {}; SENS_CAMPOS.forEach(([k]) => { if (v['s_' + k]) s[k] = v['s_' + k]; });
      await guardarSensibles(dni, s);
    }
    toast('✅ Guardado');
    abierta = null; cerrar('modal-ficha');
  } catch (e) {
    console.error(e);
    falla('No se pudo guardar: ' + (e.code === 'permission-denied' ? 'tu usuario no tiene permiso de edición en este módulo.' : e.message));
    btn.disabled = false; btn.textContent = '💾 Guardar';
  }
}
