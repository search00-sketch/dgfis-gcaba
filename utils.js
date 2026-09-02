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
