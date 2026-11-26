// Arranque del módulo Personas: sesión, carga de datos y pestañas.
// Cada pestaña es un módulo aparte que se baja recién cuando se abre.
import './firebase.js';
import { S, cargarBase, alCambiar, lista } from './store.js';
import { $, $$ } from './dom.js';

const PESTANAS = {
  personas: () => import('./tab-personas.js'),
  talonarios: () => import('./tab-talonarios.js'),
  vehiculos: () => import('./tab-vehiculos.js'),
  importar: () => import('./tab-importar.js'),
};
const montadas = {};
let activa = null;

function estado(tipo, msg) {
  $('#syncDot').className = 'sync-dot sync-' + tipo;
  $('#syncTxt').textContent = msg;
}

async function mostrar(id) {
  if (!PESTANAS[id]) id = 'personas';
  if (id === 'importar' && !S.admin) id = 'personas';
  activa = id;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  if (!S.personas.length && !S.version) return; // todavía sin datos: se muestra al terminar de cargar
  try {
    if (!montadas[id]) {
      const m = await PESTANAS[id]();
      m.mount($('#panel-' + id));
      montadas[id] = m;
    }
    montadas[id].render();
  } catch (e) { console.error(e); estado('err', '⚠️ ' + e.message); }
}

async function cargarDatos() {
  if (!window.usuarioActual || !window.usuarioActual()) { estado('loading', 'Iniciá sesión para cargar los datos'); return; }
  estado('loading', 'Cargando…');
  try {
    await cargarBase();
    estado('ok', `✅ ${S.personas.length} personas · ${lista('vehiculos').length} vehículos · ${lista('talonarios').length} talonarios`);
    await mostrar(location.hash.slice(1) || activa || 'personas');
  } catch (e) {
    console.error(e);
    estado('err', '⚠️ ' + (e.code === 'permission-denied' ? 'Sin permiso: pedí que te habiliten el módulo "personas".' : e.message));
  }
}
window.cargarDatos = cargarDatos; // personal-auth.js lo vuelve a llamar después de un login

// Los datos cambian (guardados propios): se redibuja sólo la pestaña visible.
alCambiar(() => {
  if (activa && montadas[activa]) montadas[activa].render();
  if (S.version) estado('ok', `✅ ${S.personas.length} personas · ${lista('vehiculos').length} vehículos · ${lista('talonarios').length} talonarios`);
});

window._onLogin = u => {
  S.usuario = u;
  S.admin = u.role === 'admin';
  S.editar = window.puedeEditar();
  $('#tab-importar').hidden = !S.admin;
};

$$('.tab').forEach(t => t.addEventListener('click', () => { location.hash = t.dataset.tab; }));
window.addEventListener('hashchange', () => mostrar(location.hash.slice(1)));
$('#btnRefresh').addEventListener('click', cargarDatos);

window.restaurarSesion().then(cargarDatos);
