// ============================================================
//  PERSONAS — lógica pura (sin Firebase ni DOM) del módulo "Personas".
//  Módulo ES: lo importa la página y también las pruebas en Node con datos
//  reales (pruebas/personas/probar.mjs). No toca nada de la nómina actual.
//
//  Clave única de persona: el DNI (sólo dígitos, sin ceros adelante). Si un
//  registro no tiene DNI pero sí un CUIL/CUIT de 11 dígitos, el DNI se
//  deriva de los dígitos 3 a 10 del CUIL (así se arma el CUIL: 2 de prefijo
//  + DNI de 8 + 1 verificador). El CUIL se guarda igual como dato.
// ============================================================

const dg = s => String(s == null ? '' : s).replace(/\D/g, '');
const hoyISO = () => new Date().toISOString().slice(0, 10);

// ---------- identificación ----------
function normDni(s) {
  const d = dg(s).replace(/^0+/, '');
  return d.length >= 6 && d.length <= 9 ? d : '';
}
function normCuil(s) {
  const d = dg(s);
  return d.length === 11 ? d : '';
}
function dniDeCuil(s) {
  const c = normCuil(s);
  return c ? normDni(c.slice(2, 10)) : '';
}
// Dígito verificador del CUIL/CUIT (módulo 11). Sólo para avisar de
// posibles errores de tipeo; nunca rechaza un dato.
function cuilVerificadorOk(s) {
  const c = normCuil(s);
  if (!c) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += parseInt(c[i], 10) * pesos[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return true; // caso especial (cambia el prefijo): no se juzga
  return dv === parseInt(c[10], 10);
}
// Acepta lo que escribe la persona: DNI, CUIL con guiones, etc.
function identificar(rec) {
  const dni = normDni(rec && rec.dni);
  const cuil = normCuil(rec && rec.cuil);
  const dniC = dniDeCuil(rec && rec.cuil);
  let id = '', origen = '';
  if (dni) { id = dni; origen = 'dni'; }
  else if (dniC) { id = dniC; origen = 'cuil'; }
  return { id, origen, cuil, conflicto: !!(dni && dniC && dni !== dniC), dniDeclarado: dni, dniDelCuil: dniC };
}
// Para el buscador de la ficha: un número (DNI o CUIL, con o sin
// puntos y guiones) lleva a la persona; si tiene 11 dígitos se busca por CUIL.
function claveDeBusqueda(q) {
  const d = dg(q);
  if (d.length === 11) return dniDeCuil(d) || '';
  return normDni(d);
}

// ---------- nombres ----------
function normNombre(s) {
  s = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return s.replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}
function tokens(s) { return new Set(normNombre(s).split(' ').filter(Boolean)); }
// ¿Es plausiblemente la misma persona? (mismas palabras, o un nombre
// contenido en el otro, con al menos 2 palabras)
function nombreCoincide(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size < 2 || tb.size < 2) return false;
  const sub = (x, y) => [...x].every(t => y.has(t));
  return sub(ta, tb) || sub(tb, ta);
}
function buscarPersonas(lista, q) {
  q = String(q || '').trim();
  if (!q) return lista;
  const d = dg(q);
  if (d.length >= 4 && d.length === q.replace(/[.\-\s]/g, '').length) {
    return lista.filter(p => p.dni.startsWith(d) || (p.cuil || '').includes(d));
  }
  const palabras = normNombre(q).split(' ').filter(Boolean);
  return lista.filter(p => {
    const n = ' ' + normNombre(p.nombre) + ' ';
    return palabras.every(w => n.includes(w));
  });
}

// ---------- esquema de persona ----------
const SENSIBLES = ['cbu', 'imei', 'telEmergencia', 'contactoEmergencia', 'fechaNacimiento', 'leyDiscapacidad'];
const BASE = ['nombre', 'genero', 'celular', 'celularFlota', 'mailPersonal', 'mailInstitucional', 'domicilio',
  'barrio', 'comuna', 'rol', 'jefatura', 'coordinador', 'turno', 'modalidad', 'horario', 'estado',
  'fechaIngreso', 'fechaBaja', 'motivoBaja', 'oficinaCalle'];
const CATEGORIAS = ['Inspector', 'Chofer', 'Coordinador', 'Administrativo', 'Jefatura'];

function categoriasDeRol(rol) {
  const r = String(rol || '').toUpperCase();
  if (!r) return [];
  if (r.includes('INSPECTOR')) return ['Inspector'];
  if (r.includes('COORDINADOR')) return ['Coordinador'];
  if (r.includes('ADMINISTRATIVO')) return ['Administrativo'];
  if (/JEFE|GERENTE/.test(r)) return ['Jefatura'];
  return [];
}
function sinUndefined(o) {
  const out = {};
  Object.keys(o).forEach(k => { if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; });
  return out;
}
const txt = v => (v == null ? '' : String(v).trim());

// Un registro de la nómina actual (+ los duplicados del mismo DNI) -> persona nueva.
function aPersona(principal, idf, grupo) {
  const p = { dni: idf.id, cuil: idf.cuil };
  BASE.forEach(k => { p[k] = txt(principal[k]); });
  const extra = {};
  Object.keys(principal).forEach(k => {
    if (k === 'id' || k === 'dni' || k === 'cuil' || k.startsWith('_') || k === 'agentes_calle' && !principal[k]) return;
    if (BASE.includes(k) || SENSIBLES.includes(k)) return;
    if (principal[k] === '' || principal[k] == null) return;
    extra[k] = principal[k];
  });
  p.extra = extra;
  p.categorias = categoriasDeRol(principal.rol);
  p.vehiculoId = '';
  p.legacyIds = grupo.map(r => String(r.id));
  p.historial = grupo.filter(r => r !== principal).map(r => sinUndefined({
    legacyId: String(r.id), estado: txt(r.estado), fechaIngreso: txt(r.fechaIngreso),
    fechaBaja: txt(r.fechaBaja), motivoBaja: txt(r.motivoBaja), rol: txt(r.rol), turno: txt(r.turno)
  }));
  p.origen = 'import-nomina';
  p.creadoEn = new Date().toISOString();
  const s = {};
  SENSIBLES.forEach(k => { if (principal[k] !== '' && principal[k] != null) s[k] = principal[k]; });
  return { persona: sinUndefined(p), sensibles: s };
}

// Convierte toda la nómina actual. No modifica nada: devuelve el resultado.
function fusionarNomina(lista) {
  const grupos = new Map(), sinId = [], conflictos = [], cuilDudoso = [];
  lista.forEach(r => {
    const idf = identificar(r);
    if (!idf.id) { sinId.push({ legacyId: String(r.id), nombre: txt(r.nombre), estado: txt(r.estado) }); return; }
    if (idf.conflicto) conflictos.push({ id: idf.id, legacyId: String(r.id), nombre: txt(r.nombre), dni: idf.dniDeclarado, dniDelCuil: idf.dniDelCuil });
    if (idf.cuil && !cuilVerificadorOk(idf.cuil)) cuilDudoso.push({ id: idf.id, legacyId: String(r.id), nombre: txt(r.nombre) });
    if (!grupos.has(idf.id)) grupos.set(idf.id, { idf, regs: [] });
    grupos.get(idf.id).regs.push(r);
  });
  const personas = [];
  let fusionadas = 0;
  grupos.forEach(({ idf, regs }) => {
    // El principal es el registro Activo; si hay varios, el de ingreso más reciente.
    regs.sort((a, b) => (b.estado === 'Activo') - (a.estado === 'Activo') ||
      String(b.fechaIngreso || '').localeCompare(String(a.fechaIngreso || '')));
    if (regs.length > 1) fusionadas += regs.length - 1;
    personas.push(aPersona(regs[0], idf, regs));
  });
  personas.sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre, 'es'));
  return { personas, sinId, conflictos, cuilDudoso, fusionadas };
}

// ---------- vehículos ----------
function normPatente(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function patenteConFormato(s) {
  const p = normPatente(s);
  return /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p) || /^[A-Z]\d{3}[A-Z]{3}$/.test(p);
}

// ---------- talonarios de actas ----------
// t = { id, tipo:'secuestro'|'comprobacion', desde, hasta, largo?, dni, entregadoEn, estado, notas }
// "largo" (opcional) = cantidad de dígitos del número tal como se escribió
// (5, 7, 8…): hay talonarios de distintas series que se solapan en valor.
function nroActa(s) { const d = dg(s).replace(/^0+/, ''); return d && d.length <= 12 ? parseInt(d, 10) : null; }
// Las actas del portal sólo traen número de secuestro y de comprobación: de
// las de intimación no hay fuente, así que sus talonarios se llevan (rango,
// persona, fecha) pero no se calcula la última acta.
const TIPOS = { secuestro: 'Secuestro', comprobacion: 'Comprobación', intimacion: 'Intimación' };
function campoActa(t) { return t.tipo === 'comprobacion' ? 'actaComprobacion' : t.tipo === 'intimacion' ? null : 'actaSecuestro'; }

function estadisticasTalonario(t, actas, nombreAsignado) {
  const campo = campoActa(t);
  if (!campo) {
    const total = t.hasta - t.desde + 1;
    return { sinFuente: true, total, usadas: 0, restantes: total, pct: 0, ultimaNro: null, ultimaFecha: '', maxNro: null,
      saltadas: 0, repetidas: 0, ajenas: 0, ultimoDelTalonario: t.hasta, agotado: false };
  }
  const usados = new Map(); // nro -> { veces, fecha, inspector }
  let ultima = null;
  for (let i = 0; i < actas.length; i++) {
    const a = actas[i], raw = a[campo];
    if (!raw) continue;
    const n = nroActa(raw);
    if (n == null || n < t.desde || n > t.hasta) continue;
    if (t.largo && dg(raw).length !== Number(t.largo)) continue;
    const f = a.fecha ? String(a.fecha).slice(0, 10) : '';
    const u = usados.get(n);
    if (u) { u.veces++; if (f > u.fecha) { u.fecha = f; u.inspector = a.inspector; } }
    else usados.set(n, { veces: 1, fecha: f, inspector: a.inspector });
  }
  let maxNro = null, repetidas = 0, ajenas = 0;
  usados.forEach((u, n) => {
    if (maxNro == null || n > maxNro) maxNro = n;
    if (u.veces > 1) repetidas++;
    if (nombreAsignado && u.inspector && !nombreCoincide(nombreAsignado, u.inspector)) ajenas++;
    if (!ultima || u.fecha > ultima.fecha || (u.fecha === ultima.fecha && n > ultima.nro)) ultima = { nro: n, fecha: u.fecha };
  });
  const total = t.hasta - t.desde + 1;
  return {
    total, usadas: usados.size, restantes: total - usados.size,
    pct: total > 0 ? Math.round(1000 * usados.size / total) / 10 : 0,
    ultimaNro: ultima ? ultima.nro : null, ultimaFecha: ultima ? ultima.fecha : '',
    maxNro, saltadas: maxNro == null ? 0 : (maxNro - t.desde + 1 - usados.size),
    repetidas, ajenas, ultimoDelTalonario: t.hasta, agotado: usados.size >= total
  };
}
function diasEntre(desdeISO, hastaISO) {
  if (!desdeISO) return null;
  const a = Date.parse(desdeISO + 'T12:00:00Z'), b = Date.parse((hastaISO || hoyISO()) + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}
// Devuelve una lista de problemas (texto) de un talonario nuevo/editado.
function validarTalonario(t, otros) {
  const errores = [], avisos = [];
  if (!t.dni) errores.push('Falta la persona a la que se asigna.');
  if (!Number.isInteger(t.desde) || !Number.isInteger(t.hasta)) errores.push('El rango "desde / hasta" tiene que ser numérico.');
  else if (t.desde > t.hasta) errores.push('"Desde" es mayor que "hasta".');
  else {
    (otros || []).filter(o => o.id !== t.id && o.tipo === t.tipo && (o.largo || 0) === (t.largo || 0) && o.estado !== 'cerrado')
      .forEach(o => { if (t.desde <= o.hasta && t.hasta >= o.desde) avisos.push('Se superpone con el talonario ' + o.desde + '–' + o.hasta + ' (' + o.dni + ').'); });
  }
  return { errores, avisos };
}
// ---------- importación de la planilla "ACTAS 2026.xlsx" ----------
// Hojas "Actas secuestro", "Actas comprobacion" y "Actas Intimacion": una fila
// por persona (nombre, CUIT, turno) y desde la 4.ª columna grupos de tres
// (FECHA, INICIO, FINAL), uno por cada entrega de talonario. Las celdas traen
// de todo ("0009180 ", "31900 entregado a legales 24/11/2026", "NO TIENE
// ACTAS"): se toma el número del principio y el resto queda como nota.
const NOTA_CIERRE = /legales|extravi|robad|denuncia|devuelt|termin|baja|no trajo/i;

function celdaNumero(v) {
  if (v == null || v === '') return { n: null, nota: '' };
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? { n: Math.round(v), nota: '' } : { n: null, nota: '' };
  const s = String(v).trim();
  if (/^\d+(\.\d+)?E\d+$/i.test(s)) return { n: Math.round(Number(s)), nota: '' };
  const m = s.match(/^(\d{1,12})(?!\d)(.*)$/);
  if (!m) return { n: null, nota: s };
  return { n: parseInt(m[1], 10), nota: m[2].replace(/^[\s\-–:]+/, '').trim() };
}
// Fecha de una celda: serie de Excel o texto d/m/aaaa (también "d/m/aa"). Devuelve ISO o ''.
function celdaFecha(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10) : '';
  const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return '';
  const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  const d = new Date(Date.UTC(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
  return d.getUTCMonth() === parseInt(m[2], 10) - 1 ? d.toISOString().slice(0, 10) : '';
}
const cuitDeCelda = v => (typeof v === 'number' ? String(Math.round(v)) : dg(v));

// hojas = { secuestro: filas[][], comprobacion: filas[][], intimacion: filas[][] } (la fila 0 es el encabezado)
function parsearPlanillaActas(hojas, origen = 'planilla ACTAS') {
  const talonarios = [], ignoradas = [], sinCuit = [];
  const vistos = new Map();
  Object.keys(TIPOS).forEach(tipo => {
    (hojas[tipo] || []).slice(1).forEach((fila, i) => {
      if (!fila || fila[0] == null || fila[0] === '') return;
      const nombre = String(fila[0]).trim();
      const cuit = cuitDeCelda(fila[1]);
      const dni = dniDeCuil(cuit);
      const delPersona = [];
      for (let base = 3; base + 1 < fila.length; base += 3) {
        const fe = fila[base], ini = celdaNumero(fila[base + 1]), fin = celdaNumero(fila[base + 2]);
        if (ini.n == null && fin.n == null) {
          const t = [ini.nota, fin.nota].join(' ');
          if (t.trim() && !/NO TIENE|NO SE DA|PASE|SIN /i.test(t)) ignoradas.push({ tipo, fila: i + 2, nombre, motivo: 'sin números', texto: t.trim().slice(0, 80) });
          continue;
        }
        const ref = { tipo, fila: i + 2, nombre, texto: [fila[base + 1], fila[base + 2]].join(' → ').slice(0, 80) };
        if (ini.n == null || fin.n == null) { ignoradas.push({ ...ref, motivo: 'falta el inicio o el final' }); continue; }
        if (fin.n < ini.n) { ignoradas.push({ ...ref, motivo: 'el final es menor que el inicio' }); continue; }
        if (!dni) { sinCuit.push({ ...ref, cuit }); continue; }
        const fecha = celdaFecha(fe);
        const notas = [!fecha && fe != null && fe !== '' ? String(fe).trim() : '', ini.nota, fin.nota].filter(Boolean).join(' · ').slice(0, 200);
        const t = { id: `${tipo}-${ini.n}-${fin.n}`, tipo, desde: ini.n, hasta: fin.n, largo: 0, dni, entregadoEn: fecha,
          estado: 'activo', notas, origen };
        const previo = vistos.get(t.id);
        if (previo) { if (previo.dni !== dni) ignoradas.push({ ...ref, motivo: 'el mismo rango figura en dos personas' }); continue; }
        vistos.set(t.id, t); delPersona.push(t); talonarios.push(t);
      }
      // Sólo el último talonario de cada persona sigue activo (si no tiene una nota de cierre).
      delPersona.forEach((t, k) => { if (k < delPersona.length - 1 || NOTA_CIERRE.test(t.notas)) t.estado = 'cerrado'; });
    });
  });
  return { talonarios, ignoradas, sinCuit };
}

// Por persona: su última acta labrada entre todos sus talonarios activos.
function ultimaPorPersona(talonarios, statsPorId) {
  const out = {};
  talonarios.forEach(t => {
    const s = statsPorId[t.id];
    if (!s || !s.ultimaFecha) return;
    const o = out[t.dni];
    if (!o || s.ultimaFecha > o.fecha) out[t.dni] = { fecha: s.ultimaFecha, nro: s.ultimaNro, talonario: t.id };
  });
  return out;
}

export { dg, normDni, normCuil, dniDeCuil, cuilVerificadorOk, identificar, claveDeBusqueda, normNombre, nombreCoincide, buscarPersonas, SENSIBLES, BASE, CATEGORIAS, categoriasDeRol, fusionarNomina, aPersona, normPatente, patenteConFormato, nroActa, estadisticasTalonario, diasEntre, validarTalonario, ultimaPorPersona, TIPOS, celdaNumero, celdaFecha, parsearPlanillaActas };
