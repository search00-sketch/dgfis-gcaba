// ============================================================
//  DATOS — capa de Firestore/caché compartida por gestion_personal.html,
//  novedades_personal.html y asignacion_zonas.html.
//  Este archivo es un <script> clásico (no módulo): usa window._db y los
//  window._f* que expone el <script type="module"> de cada página (nunca
//  identificadores sueltos de Firestore), así no importa que este archivo
//  se cargue ANTES que ese script de módulo — sus funciones recién tocan
//  window._db/_f* cuando se LLAMAN, no cuando se definen.
// ============================================================

// -- CONSTANTES DE CACHÉ --------------------------------------------------
const CACHE = {
  nomina:     { key:'dgf_personal_nomina',  ts:'dgf_personal_nomina_ts',  ttl: 24*60*60*1000 },
  novedades:  { key:'dgf_personal_nov',     ts:'dgf_personal_nov_ts',     ttl: 24*60*60*1000 },
  zonas:      { key:'dgf_personal_zonas',   ts:'dgf_personal_zonas_ts',   ttl: 24*60*60*1000 },
  dist:       { key:'dgf_personal_dist_',   ts:'dgf_personal_dist_ts_',   ttl:  5*60*1000     },
  distTodas:  { key:'dgf_personal_dist_todas', ts:'dgf_personal_dist_todas_ts', ttl: 5*60*1000 },
};

function getCache(cfg, suffix='') {
  try {
    const ts = parseInt(sessionStorage.getItem(cfg.ts + suffix)||'0');
    const c  = sessionStorage.getItem(cfg.key + suffix);
    if (c && (Date.now()-ts) < cfg.ttl) return JSON.parse(c);
  } catch(e) {}
  return null;
}
function setCache(cfg, data, suffix='') {
  try {
    sessionStorage.setItem(cfg.key + suffix, JSON.stringify(data));
    sessionStorage.setItem(cfg.ts  + suffix, Date.now().toString());
  } catch(e) {}
}
function clearCache(cfg, suffix='') {
  sessionStorage.removeItem(cfg.key + suffix);
  sessionStorage.removeItem(cfg.ts  + suffix);
}

// -- LECTURA/ESCRITURA "CHUNKED": varios registros por documento -----------
// Antes: un documento por registro (mucho consumo de lecturas: 570 lecturas
// para traer toda la nómina). Antes de eso: chunks de 500 registros donde
// cada guardado reescribía el chunk COMPLETO, así que dos personas editando
// registros distintos del mismo chunk se pisaban entre sí. Ahora: chunks de
// hasta 500 registros con un mapa {id: {...datos}} adentro, pero cada
// alta/edición/baja usa updateDoc con notación de punto ("registros.<id>")
// para tocar sólo esa clave del mapa, sin leer ni pisar las demás — mismo
// ahorro de lecturas que los chunks viejos, sin el problema de concurrencia.
const CHUNK_SIZE = 500;

async function leerColeccionChunked(nombreCol, cacheConf) {
  const cached = getCache(cacheConf);
  if (cached) return cached;
  const metaSnap = await window._fGetDoc(window._fDoc(window._db, nombreCol+'_meta', 'index')).catch(()=>null);
  const numChunks = (metaSnap && metaSnap.exists()) ? (metaSnap.data().numChunks||0) : 0;
  const chunkSnaps = await Promise.all(
    Array.from({length: numChunks}, (_,i) => window._fGetDoc(window._fDoc(window._db, nombreCol+'_chunks', 'chunk_'+i)))
  );
  const recs = [];
  chunkSnaps.forEach((snap,i) => {
    if (!snap || !snap.exists()) return;
    const registros = snap.data().registros || {};
    Object.entries(registros).forEach(([id, datos]) => recs.push({ id, _chunk: i, ...datos }));
  });
  setCache(cacheConf, recs);
  return recs;
}

// Sube numChunks al valor pedido SÓLO si es mayor al que ya hay en
// Firestore — nunca lo baja. Corre dentro de una transacción (lee el
// valor actual y escribe en la misma operación atómica) para que dos
// altas/imports que se superpongan no puedan pisarse: sin esto, un import
// que arrancó con una foto vieja de numChunks podía terminar escribiendo
// un valor MENOR al que otro import (u otra alta) ya había dejado,
// "escondiendo" chunks que sí existen en Firestore. Así se detectó y
// arregló un caso real en novedades: numChunks decía 8 con 26 chunks
// reales guardados (8663 registros invisibles para la app).
async function bumpNumChunksSiHaceFalta(nombreCol, numChunksNecesario) {
  const metaRef = window._fDoc(window._db, nombreCol+'_meta', 'index');
  await window._fRunTransaction(window._db, async (tx) => {
    const snap = await tx.get(metaRef);
    const actual = snap.exists() ? (snap.data().numChunks || 0) : 0;
    if (numChunksNecesario > actual) {
      tx.set(metaRef, { numChunks: numChunksNecesario }, { merge: true });
    }
  });
}

// Alta o edición de UN registro. Si ya tiene "_chunk" (venía de una lectura
// previa) actualiza sólo esa clave del chunk; si es nuevo, lo agrega al
// último chunk (o crea uno nuevo si el último está lleno).
async function guardarRegistroChunked(nombreCol, cacheConf, registro, coleccionActual) {
  const { id, _chunk, ...datos } = registro;
  let chunkIdx = _chunk;
  if (chunkIdx === undefined) {
    const metaSnap = await window._fGetDoc(window._fDoc(window._db, nombreCol+'_meta', 'index')).catch(()=>null);
    const numChunks = (metaSnap && metaSnap.exists()) ? (metaSnap.data().numChunks||0) : 0;
    chunkIdx = Math.min(Math.floor(coleccionActual.length / CHUNK_SIZE), numChunks);
    if (chunkIdx >= numChunks) {
      await bumpNumChunksSiHaceFalta(nombreCol, chunkIdx + 1);
    }
  }
  await window._fUpdateOrCrear(window._fDoc(window._db, nombreCol+'_chunks', 'chunk_'+chunkIdx), { ['registros.'+id]: datos });
  registro._chunk = chunkIdx;
  clearCache(cacheConf);
}

// Baja de UN registro (necesita saber en qué chunk está).
async function eliminarRegistroChunked(nombreCol, cacheConf, registro) {
  if (!registro || registro._chunk === undefined) { clearCache(cacheConf); return; }
  await window._fUpdateOrCrear(window._fDoc(window._db, nombreCol+'_chunks', 'chunk_'+registro._chunk), { ['registros.'+registro.id]: window._fDeleteField() });
  clearCache(cacheConf);
}

// Alta/edición masiva (import de Excel, o alta inicial). Agrupa los
// registros por chunk de destino y hace UNA escritura por chunk afectado
// en vez de una por registro.
async function guardarRegistrosBulkChunked(nombreCol, cacheConf, lista, coleccionActual) {
  const chunkExistente = {};
  coleccionActual.forEach(r => { if (r._chunk !== undefined) chunkExistente[r.id] = r._chunk; });

  const metaSnap = await window._fGetDoc(window._fDoc(window._db, nombreCol+'_meta', 'index')).catch(()=>null);
  let numChunks = (metaSnap && metaSnap.exists()) ? (metaSnap.data().numChunks||0) : 0;
  let totalActual = coleccionActual.length;

  const porChunk = {};
  lista.forEach(registro => {
    const { id, _chunk, ...datos } = registro;
    let chunkIdx = chunkExistente[id];
    if (chunkIdx === undefined) {
      chunkIdx = Math.min(Math.floor(totalActual / CHUNK_SIZE), numChunks);
      if (chunkIdx >= numChunks) numChunks = chunkIdx + 1;
      chunkExistente[id] = chunkIdx;
      totalActual++;
    }
    if (!porChunk[chunkIdx]) porChunk[chunkIdx] = {};
    porChunk[chunkIdx]['registros.'+id] = datos;
    registro._chunk = chunkIdx;
  });

  await bumpNumChunksSiHaceFalta(nombreCol, numChunks);
  await Promise.all(Object.entries(porChunk).map(([idx, campos]) =>
    window._fUpdateOrCrear(window._fDoc(window._db, nombreCol+'_chunks', 'chunk_'+idx), campos)
  ));
  clearCache(cacheConf);
}

// -- CARGA INICIAL --------------------------------------------------------
window._fsReady = false;

async function cargarTodo() {
  setSyncStatus('loading', 'Cargando…');
  try {
    // Todas las lecturas son independientes entre sí: se disparan en
    // paralelo (antes iban una detrás de otra, sumando varios segundos).
    const zonasCache = getCache(CACHE.zonas);
    const [nominaArr, novedadesArr, zSnap, tiposSnap, feriadosSnap] = await Promise.all([
      leerColeccionChunked('nomina', CACHE.nomina),
      leerColeccionChunked('novedades', CACHE.novedades),
      zonasCache ? Promise.resolve(null) : window._fGetDoc(window._fDoc(window._db,'personal_config','zonas')).catch(()=>null),
      window._fGetDoc(window._fDoc(window._db,'personal_config','tipos_novedad')).catch(()=>null),
      window._fGetDoc(window._fDoc(window._db,'personal_config','feriados')).catch(()=>null),
      window.cargarDistFecha(todayISO()),
    ]);

    // Nómina. Ya no hay auto-seed desde el cliente: la carga inicial se hace
    // por import de Excel desde Gestión de Personal (el seed hardcodeado
    // exponía datos personales en el HTML público).
    window.nomina = nominaArr;

    // Novedades
    window.novedades = novedadesArr;

    // Zonas
    if (zonasCache) {
      window.zonas = zonasCache;
    } else {
      window.zonas = (zSnap && zSnap.exists()) ? zSnap.data().lista : [...ZONAS_DEFAULT];
      setCache(CACHE.zonas, window.zonas);
    }

    // Tipos de novedad
    if (tiposSnap && tiposSnap.exists()) {
      window.tiposNovedad = tiposSnap.data().lista;
    }

    // Feriados
    if (feriadosSnap && feriadosSnap.exists()) {
      window.feriados      = feriadosSnap.data().lista || [];
      window.feriadosDesc  = feriadosSnap.data().desc  || {};
    }

    window._fsReady = true;
    setSyncStatus('ok', `✅ ${window.nomina.length} personas · ${window.novedades.length} novedades`);
    init();
  } catch(e) {
    setSyncStatus('err', '⚠️ Error: ' + e.message);
    console.error(e);
  }
}

// -- DISTRIBUCIÓN (por fecha, caché 5 min) --------------------------------
// Un solo documento por fecha (campo "asignaciones": {personaId: zona}) en vez
// de un documento por persona: 1 lectura por día consultado en lugar de una
// lectura por cada persona asignada.
window.cargarDistFecha = async function(fecha) {
  const cached = getCache(CACHE.dist, fecha);
  if (cached) { window.distribuciones[fecha] = cached; return; }

  const snap = await window._fGetDoc(window._fDoc(window._db,'distribuciones', fecha)).catch(()=>null);
  const data = (snap && snap.exists()) ? (snap.data().asignaciones || {}) : {};
  window.distribuciones[fecha] = data;
  setCache(CACHE.dist, data, fecha);
};

// Historial de zonas por persona (ficha "Ver" y su exportación en Gestión
// de Personal) necesita TODAS las fechas, no una sola — cargarDistFecha()
// sólo trae una fecha por vez (y sólo "hoy" se carga sola al arrancar), así
// que sin esto window.distribuciones queda casi siempre vacío para ese uso.
// Mismo patrón de lectura completa que usa exportarBackupCompleto() en
// index.html (getDocs de toda la colección "distribuciones"), acá
// cacheado 5 min como el resto de las lecturas por fecha.
window.cargarTodasLasDistribuciones = async function() {
  const cached = getCache(CACHE.distTodas);
  if (cached) { Object.assign(window.distribuciones, cached); return; }
  try {
    const snap = await window._fGetDocs(window._fCol(window._db, 'distribuciones'));
    const todas = {};
    snap.docs.forEach(d => { todas[d.id] = d.data().asignaciones || {}; });
    Object.assign(window.distribuciones, todas);
    setCache(CACHE.distTodas, todas);
  } catch (e) { console.error('Error cargando historial de distribuciones:', e); }
};

// -- GUARDADO A FIREBASE ----------------------------------------------------
window._guardarPersona = async function(persona) {
  await guardarRegistroChunked('nomina', CACHE.nomina, persona, window.nomina);
};
// Recibe el registro completo (no sólo el id): ver comentario en
// _eliminarNovedad más abajo.
window._eliminarPersona = async function(registro) {
  await eliminarRegistroChunked('nomina', CACHE.nomina, registro);
};
// Sólo para altas masivas (import de Excel) — agrega/actualiza únicamente
// los registros de la lista dada, no toca los de otras personas.
window._guardarNominaCompleta = async function(lista) {
  await guardarRegistrosBulkChunked('nomina', CACHE.nomina, lista, window.nomina);
};

window._guardarNovedad = async function(nov) {
  await guardarRegistroChunked('novedades', CACHE.novedades, nov, window.novedades);
};
// Recibe el registro completo (no sólo el id): eliminarRegistroChunked
// necesita su "_chunk" para saber qué documento tocar, y para cuando se
// llama esto el array local ya puede haber sido filtrado.
window._eliminarNovedad = async function(registro) {
  await eliminarRegistroChunked('novedades', CACHE.novedades, registro);
};
// Alta masiva (import de asistencia desde Excel): agrupa por chunk y hace
// una escritura por chunk en vez de una por novedad.
window._guardarNovedadesBulk = async function(lista) {
  await guardarRegistrosBulkChunked('novedades', CACHE.novedades, lista, window.novedades);
};

window._guardarZonas = async function() {
  await window._fSetDoc(window._fDoc(window._db,'personal_config','zonas'), { lista: window.zonas, ts: new Date().toISOString() });
  clearCache(CACHE.zonas);
};

window._guardarTiposNovedad = async function() {
  await window._fSetDoc(window._fDoc(window._db,'personal_config','tipos_novedad'), { lista: window.tiposNovedad, ts: new Date().toISOString() });
};

window._guardarFeriados = async function(lista, desc) {
  await window._fSetDoc(window._fDoc(window._db,'personal_config','feriados'), {
    lista: lista || window.feriados || [],
    desc:  desc  || window.feriadosDesc || {},
    ts: new Date().toISOString()
  });
};

// Guarda la asignación de UNA persona para UNA fecha usando notación de punto
// ("asignaciones.<personaId>"): el merge sólo toca esa clave del mapa, sin
// leer ni pisar las asignaciones de las demás personas.
window._guardarAsignacion = async function(fecha, personaId, zona) {
  const campo = 'asignaciones.' + personaId;
  await window._fUpdateOrCrear(window._fDoc(window._db,'distribuciones',fecha), { [campo]: zona ? zona : window._fDeleteField() });
  window._refrescarCacheDist(fecha);
};
// CACHE/clearCache/setCache son privados a este archivo; esto le da al
// resto de cada página una forma de refrescar el caché tras un batch.
window._refrescarCacheDist = function(fecha) {
  clearCache(CACHE.dist, fecha);
  setCache(CACHE.dist, window.distribuciones[fecha] || {}, fecha);
};

window._guardarEventos = async function() {
  await window._fSetDoc(window._fDoc(window._db,'personal_config','eventos'), { lista: window.eventos, ts: new Date().toISOString() });
};

window.forzarRecarga = function() {
  ['nomina','novedades','zonas'].forEach(k => {
    clearCache(CACHE[k]);
  });
  // limpiar cache de distribuciones
  Object.keys(sessionStorage).filter(k=>k.startsWith('dgf_personal_dist_')).forEach(k=>sessionStorage.removeItem(k));
  cargarTodo();
};

function setSyncStatus(type, msg) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTxt');
  if (!dot) return;
  dot.className = 'sync-dot sync-' + type;
  txt.textContent = msg;
}
