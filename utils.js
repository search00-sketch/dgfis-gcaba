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
