// ============================================================
//  UTILS COMPARTIDOS — cargado por las 6 páginas del portal.
//  Antes cada página definía su propia copia de esc() (5 versiones,
//  algunas sin escapar la comilla simple: un nombre como D'ANGELO
//  podía romper un atributo onclick). Ahora hay UNA sola.
// ============================================================

// Escape HTML: para texto que va dentro del HTML (contenido de tags o
// atributos entre comillas dobles). Evita XSS al mostrar datos de Firestore.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Para insertar texto como argumento de string dentro de un onclick="fn('...')":
// escapar con entidades HTML no alcanza (el navegador las decodifica ANTES de
// ejecutar el atributo como JS), así que hay que escapar la comilla a nivel JS.
function escJsAttr(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ¿"texto" contiene TODAS las palabras de "query" (separadas por espacios),
// en cualquier orden? Ambos deben venir ya normalizados de la misma forma
// (minúsculas, con o sin acentos según la página) antes de llamarla. Permite
// buscar "PEREZ CARLOS" y encontrar "PEREZ JUAN CARLOS" (salteando el
// nombre del medio, sin importar el orden) en vez de exigir que lo tipeado
// aparezca como substring contigua.
function coincideTexto(texto, query) {
  const q = (query||'').trim();
  if (!q) return true;
  const t = texto||'';
  return q.split(/\s+/).every(tok => t.includes(tok));
}

// El <header> (título/fecha/usuario) quedó fijo (position:sticky) en las 6
// páginas. Mide su alto real y lo expone en --sticky-offset para que otros
// elementos sticky de la página (columna de pestañas del trío, mapa de
// Buscador de Permisos) arranquen debajo de él en vez de quedar tapados.
function actualizarStickyOffset() {
  const header = document.querySelector('header');
  document.documentElement.style.setProperty('--sticky-offset', (header ? header.offsetHeight : 0) + 'px');
}
document.addEventListener('DOMContentLoaded', actualizarStickyOffset);
window.addEventListener('resize', actualizarStickyOffset);

// Panel de filtros colapsable (mobile): un botón "⚙️ Filtros (N)" abre el
// mismo contenedor de filtros de escritorio como panel de pantalla completa
// (CSS .mob-filter-panel en estilo-comun.css) — no se clona ni se mueve
// ningún <select>/<input> a otro lado del DOM, así que sus ids y sus
// onchange existentes siguen funcionando igual, con o sin el panel.
function toggleFiltrosPanel(panelId, forceClose) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (forceClose === true) { panel.classList.remove('open'); return; }
  panel.classList.toggle('open');
}

// Cuenta los <select>/<input> con un valor no vacío dentro del panel y
// actualiza el label del botón que lo abre. Se llama desde la misma función
// aplicarFiltros()/equivalente de cada página, así queda siempre al día.
function actualizarBadgeFiltros(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!panel || !btn) return;
  const activos = [...panel.querySelectorAll('select,input')]
    .filter(el => (el.value || '').trim() !== '').length;
  btn.textContent = activos ? `⚙️ Filtros (${activos})` : '⚙️ Filtros';
}

// Categoría de una incidencia de Urbetrack para el Informe Venta Ilegal, a
// partir de su "Grupo". Replica la columna "GRUPO NORMALIZADO" del Excel
// del informe (PUNTO CRONICO, HOJA DE RUTA, PARTIDO FUTBOL, etc.), pero
// sin distinguir tildes ni "DE": el Excel dejaba afuera "PARTIDO DE
// FUTBOL", "AGRESION" (sin tilde) y "CONSULTA FISCALIA" (sin tilde).
// Compartida por urbetrack_venta.html (totales al subir) e
// informe_venta_ilegal.html.
function categoriaUrbetrack(grupo) {
  const s = String(grupo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const j = s.replace(/ /g, '');
  if (!j) return 'SIN GRUPO';
  if (j.includes('PUNTOCRONICO')) return 'PUNTO CRONICO';
  if (j.includes('PARTIDOFUTBOL') || j.includes('PARTIDODEFUTBOL')) return 'PARTIDO FUTBOL';
  if (j.includes('CONSULTAFISCALIA')) return 'CONSULTA FISCALIA';
  if (j.includes('HOJADERUTA')) return 'HOJA DE RUTA';
  if (j.includes('FUERADEOPERATORIA')) return 'FUERA DE OPERATORIA';
  if (j.includes('MANIFESTACIONES')) return 'MANIFESTACIONES Y EVENTOS';
  if (j.startsWith('AGRESION')) return 'AGRESION';
  return s;
}

// Buscadores: antes cada tecla redibujaba la tabla entera (oninput=
// "renderX()"); con diferir('renderX') se dibuja una sola vez cuando se deja
// de tipear (200 ms). Recibe el NOMBRE de la función global, no la función,
// para poder usarse directo en el atributo oninput del HTML.
const _diferirTimers = {};
function diferir(nombreFn, ms) {
  clearTimeout(_diferirTimers[nombreFn]);
  _diferirTimers[nombreFn] = setTimeout(() => {
    const f = window[nombreFn];
    if (typeof f === 'function') f();
  }, ms == null ? 200 : ms);
}

// -- MEDICIÓN DE RENDIMIENTO (opcional, apagada por defecto) ---------------
// Abrir cualquier página con ?perf=1 la activa (queda recordado en este
// navegador hasta abrir una con ?perf=0). Con eso, perfInstrumentar([...])
// envuelve las funciones globales listadas y escribe en la consola del
// navegador (F12) cuánto tardó cada llamada. Las async se miden hasta que
// terminan (incluye la espera de red de Firestore). Apagada no hace nada.
const DGF_PERF = (() => {
  try {
    const q = new URLSearchParams(location.search).get('perf');
    if (q !== null) { if (q === '1') localStorage.setItem('dgf_perf', '1'); else localStorage.removeItem('dgf_perf'); }
    return localStorage.getItem('dgf_perf') === '1';
  } catch (e) { return false; }
})();
function perfInstrumentar(nombres) {
  if (!DGF_PERF) return;
  const log = (nombre, t0, async) => {
    const ms = performance.now() - t0;
    console.log('%c⏱ ' + nombre + ': ' + ms.toFixed(1) + ' ms' + (async ? ' (async, con red)' : ''),
      'color:' + (ms > 200 ? '#c0392b' : ms > 50 ? '#e67e22' : '#2e7d32'));
  };
  nombres.forEach(nombre => {
    const fn = window[nombre];
    if (typeof fn !== 'function' || fn._perf) return;
    const envuelta = function (...args) {
      const t0 = performance.now();
      const r = fn.apply(this, args);
      if (r && typeof r.then === 'function') r.then(() => log(nombre, t0, true), () => log(nombre, t0, true));
      else log(nombre, t0, false);
      return r;
    };
    envuelta._perf = true;
    window[nombre] = envuelta;
  });
  console.log('⏱ Medición de rendimiento activa (?perf=0 para apagarla):', nombres.join(', '));
}

// Fecha "AAAA-MM-DD" de un Date en el huso horario LOCAL del navegador.
// No usar d.toISOString().slice(0,10) para esto: toISOString() está en UTC,
// y en Argentina (UTC-3) entre las 21:00 y la medianoche ya da el día
// siguiente (ej: "mañana" calculado a las 22hs salía pasado mañana).
function fechaLocalISO(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
