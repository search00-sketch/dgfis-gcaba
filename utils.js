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
