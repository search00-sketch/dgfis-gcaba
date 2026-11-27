// Ayudas de DOM compartidas por las pestañas. Sin dependencias.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function toast(msg, ms = 2600) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
export const abrir = id => $('#' + id).classList.add('open');
export const cerrar = id => $('#' + id).classList.remove('open');
export function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
export const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
export function hace(dias) {
  if (dias == null) return '';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return 'hace ' + dias + ' días';
}
// CSV listo para Excel (BOM + ; como separador, que es lo que abre bien en es-AR).
export function descargarCSV(nombre, filas) {
  const celda = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// SheetJS sólo se baja cuando hace falta (importar un Excel de vehículos).
export function cargarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => mal(new Error('No se pudo cargar la librería de Excel.'));
    document.head.appendChild(s);
  });
}

// personal-auth.js (login compartido) llama a estas dos globales.
window.toast = toast;
window.cerrarModal = cerrar;
