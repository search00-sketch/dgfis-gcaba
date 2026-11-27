// Capa de datos del módulo Personas. Una sola fuente de verdad en memoria;
// las pestañas leen de acá y se redibujan con alCambiar().
//
//  personas_meta/index + personas_chunks/chunk_N   -> personas (clave: DNI)
//  personas_sensibles/{dni}                         -> CBU, IMEI, emergencia… (sólo admin)
//  personas_config/vehiculos                        -> {items:{id:{...}}} (lista corta)
//  personas_tal_meta + personas_tal_chunks          -> talonarios (cientos: van en chunks)
//  actas_chunks (EXISTENTE, sólo lectura)           -> para calcular la última acta
//  nomina_chunks (EXISTENTE, sólo lectura)          -> sólo para la importación inicial
import { db, fs } from './firebase.js';
import { ChunkedCollection, updateOrCrear } from './chunks.js';
import * as L from './logica.js';

const colPersonas = new ChunkedCollection({ fs, db }, 'personas', { size: 300 });
const colTal = new ChunkedCollection({ fs, db }, 'personas_tal', { size: 300 });
const colNominaVieja = new ChunkedCollection({ fs, db }, 'nomina', { size: 500 });

export const S = {
  personas: [], porDni: new Map(), vehiculos: {}, talonarios: {},
  actas: null, actasError: '', sensibles: new Map(), version: 0,
  usuario: null, admin: false, editar: false,
};
const oyentes = new Set();
export const alCambiar = fn => { oyentes.add(fn); return () => oyentes.delete(fn); };
const avisar = () => { S.version++; oyentes.forEach(f => f()); };

// Firestore no acepta undefined: clon JSON que los descarta.
const limpiar = o => JSON.parse(JSON.stringify(o));
const refCfg = n => fs.doc(db, 'personas_config', n);
function indexar() { S.porDni = new Map(S.personas.map(p => [p.dni, p])); }
const conId = items => Object.fromEntries(Object.entries(items || {}).map(([id, d]) => [id, { id, ...d }]));
export const lista = nombre => Object.values(S[nombre]);

export async function cargarBase() {
  const [recs, v, tals] = await Promise.all([colPersonas.cargar(), fs.getDoc(refCfg('vehiculos')), colTal.cargar()]);
  S.personas = recs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  indexar();
  S.vehiculos = conId(v.exists() ? v.data().items : {});
  S.talonarios = Object.fromEntries(tals.map(t => [t.id, t]));
  avisar();
}

// ---------- personas ----------
export async function guardarPersona(p) {
  const rec = limpiar({ ...p, id: p.dni });
  await colPersonas.guardar(rec);
  const i = S.personas.findIndex(x => x.dni === rec.dni);
  if (i >= 0) S.personas[i] = rec; else S.personas.push(rec);
  S.personas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  indexar(); avisar();
  return rec;
}
export async function getSensibles(dni) {
  if (S.sensibles.has(dni)) return S.sensibles.get(dni);
  const s = await fs.getDoc(fs.doc(db, 'personas_sensibles', dni));
  const d = s.exists() ? s.data() : {};
  S.sensibles.set(dni, d);
  return d;
}
export async function guardarSensibles(dni, datos) {
  const d = limpiar(datos);
  await fs.setDoc(fs.doc(db, 'personas_sensibles', dni), d);
  S.sensibles.set(dni, d);
}
export const vehiculoDe = dni => { const p = S.porDni.get(dni); return p && p.vehiculoId ? S.vehiculos[p.vehiculoId] || null : null; };
export const choferesDe = vehiculoId => S.personas.filter(p => p.vehiculoId === vehiculoId);

// ---------- talonarios (chunks; mantienen el chunk en que ya estaban) ----------
export async function guardarTalonarios(items) {
  const recs = items.map(t => { const r = limpiar(t); const previo = S.talonarios[r.id]; if (previo && previo._chunk !== undefined) r._chunk = previo._chunk; return r; });
  await colTal.guardarVarios(recs);
  recs.forEach(r => { S.talonarios[r.id] = r; });
  avisar();
}
export async function borrarTalonario(id) {
  const r = S.talonarios[id]; if (!r) return;
  await colTal.eliminar(r);
  delete S.talonarios[id];
  avisar();
}

// ---------- vehículos (un documento, mapa "items") ----------
export async function guardarItems(nombre, items) {
  const campos = {};
  items.forEach(it => { const { id, ...d } = limpiar(it); campos['items.' + id] = d; });
  await updateOrCrear(fs, refCfg(nombre), campos);
  items.forEach(it => { S[nombre][it.id] = limpiar(it); });
  avisar();
}
export async function borrarItem(nombre, id) {
  await updateOrCrear(fs, refCfg(nombre), { ['items.' + id]: fs.deleteField() });
  delete S[nombre][id];
  avisar();
}
export const nuevoId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// ---------- actas (lectura de la colección existente) ----------
const AK = 'dgf_pers_actas', AT = 'dgf_pers_actas_ts', TTL = 30 * 60 * 1000;
export async function cargarActas(forzar = false) {
  if (S.actas && !forzar) return S.actas;
  try {
    const ts = parseInt(sessionStorage.getItem(AT) || '0', 10), c = sessionStorage.getItem(AK);
    if (!forzar && c && Date.now() - ts < TTL) { S.actas = JSON.parse(c); S.actasError = ''; avisar(); return S.actas; }
  } catch (e) { /* sin caché */ }
  try {
    const meta = await fs.getDoc(fs.doc(db, 'actas_meta', 'index'));
    const n = meta.exists() ? (meta.data().totalChunks || 0) : 0;
    const snaps = await Promise.all(Array.from({ length: n }, (_, i) => fs.getDoc(fs.doc(db, 'actas_chunks', 'chunk_' + i))));
    const out = [];
    snaps.forEach(s => (s.exists() ? s.data().registros || [] : []).forEach(a => {
      if (!a.actaSecuestro && !a.actaComprobacion) return;
      out.push({ fecha: String(a.fecha || '').slice(0, 10), inspector: a.inspector || '', actaSecuestro: a.actaSecuestro || '', actaComprobacion: a.actaComprobacion || '' });
    }));
    S.actas = out; S.actasError = '';
    try { sessionStorage.setItem(AK, JSON.stringify(out)); sessionStorage.setItem(AT, String(Date.now())); } catch (e) { /* muy grande: sigue sin caché */ }
    avisar();
    return out;
  } catch (e) {
    S.actas = null;
    S.actasError = e && e.code === 'permission-denied'
      ? 'Tu usuario no tiene habilitado el módulo Estadísticas, que es el que permite leer las actas.'
      : 'No se pudieron leer las actas: ' + (e && e.message);
    avisar();
    throw e;
  }
}
let memo = { k: '', v: {} };
export function statsTalonarios() {
  if (!S.actas) return null;
  const ts = lista('talonarios');
  const k = S.actas.length + '|' + S.personas.length + '|' + JSON.stringify(ts);
  if (memo.k === k) return memo.v;
  const v = {};
  ts.forEach(t => { const p = S.porDni.get(t.dni); v[t.id] = L.estadisticasTalonario(t, S.actas, p ? p.nombre : ''); });
  memo = { k, v };
  return v;
}

// ---------- importación inicial desde la nómina actual (sólo lee la nómina) ----------
export const leerNominaActual = () => colNominaVieja.cargar();
export async function importarPersonas(items, progreso = () => {}) {
  const nuevos = items.filter(x => !S.porDni.has(x.persona.dni));
  const recs = nuevos.map(x => limpiar({ ...x.persona, id: x.persona.dni }));
  progreso('Guardando ' + recs.length + ' personas…');
  await colPersonas.guardarVarios(recs);
  const conSens = nuevos.filter(x => Object.keys(x.sensibles).length);
  for (let i = 0; i < conSens.length; i += 400) {
    progreso('Guardando datos sensibles (' + Math.min(i + 400, conSens.length) + ' de ' + conSens.length + ')…');
    const b = fs.writeBatch(db);
    conSens.slice(i, i + 400).forEach(x => b.set(fs.doc(db, 'personas_sensibles', x.persona.dni), limpiar(x.sensibles)));
    await b.commit();
  }
  S.personas = [...S.personas, ...recs].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  indexar(); avisar();
  return { agregadas: recs.length, yaExistian: items.length - recs.length, sensibles: conSens.length };
}
