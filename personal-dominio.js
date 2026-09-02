// ============================================================
//  DOMINIO — constantes y lógica compartidas por gestion_personal.html,
//  novedades_personal.html y asignacion_zonas.html. Sin dependencia de
//  Firebase, sólo lee de window.nomina/window.novedades/window.zonas/
//  window.feriados (ya poblados por personal-datos.js).
// ============================================================
const TURNOS   = ["Turno Mañana","Turno Tarde","Turno Noche","SADOFE Diurno","SADOFE Noche","Administrativo","Gerencia"];
const ROLES    = ["Inspector","Coordinador Zonal","Coordinador General","Chofer","Administrativo"];
const HORARIOS = {"Turno Mañana":"Lun–Vie 07:00–14:00","Turno Tarde":"Lun–Vie 13:00–20:00","Turno Noche":"Lun–Jue 19:00–01:00","SADOFE Diurno":"Sáb–Dom–Feriados 07:00–19:00","SADOFE Noche":"Vie–Sáb–Dom 19:00–01:00","Administrativo":"Administrativo","Gerencia":"Gerencia"};
const TURNOS_BADGE = {"Turno Mañana":"bdg-turno-man","Turno Tarde":"bdg-turno-tar","Turno Noche":"bdg-turno-noc","SADOFE Diurno":"bdg-sadofe-d","SADOFE Noche":"bdg-sadofe-n","Administrativo":"bdg-admin","Gerencia":"bdg-ger"};
const NOV_CLASS    = {"Licencia":"bdg-nov-lic","Licencia Médica":"bdg-nov-lic","Licencia Ordinaria":"bdg-nov-lic","Llegada tarde":"bdg-nov-tar","Retiro anticipado":"bdg-nov-ret","Ausencia":"bdg-nov-aus","Otro":"bdg-nov-otro","Presente":"bdg-nov-presente"};
const ESTADO_CLASS = {"Activo":"bdg-activo","Licencia":"bdg-licencia","Baja":"bdg-baja"};
const ESTADO_LIC_CLASS = {"Pendiente":"bdg-admin","Aprobada":"bdg-activo","A la espera de más información":"bdg-nov-tar","Rechazada":"bdg-baja"};
const ZONAS_DEFAULT = ["ONCE","AVELLANEDA","LINIERS","CONSTITUCIÓN","RETIRO","FLORIDA","CAMINITO","CORRIENTES CULTURAL","BARRIO CHINO","SAN TELMO","BOULEVARD CERVIÑO","PLAZA FRANCIA","PARQUE TRES DE FEBRERO","PARQUE MATADEROS","PATRULLA I","PATRULLA II","PATRULLA III","PATRULLA IV","PATRULLA V"];

// Mapea el texto libre de "Jefatura" (como venía del Excel histórico, ya
// deprecado como campo propio) al Rol que le corresponde. Los títulos de
// jefatura/gerencia que no tienen un Rol fijo equivalente en el sistema
// (ej: "SUB GERENTE", "JEFE SECCION") se devuelven tal cual, para no perder
// esa información aunque no encajen en las 5 opciones de ROLES.
const JEFATURA_A_ROL = {
  "INSPECTOR/A":"Inspector","INSPECTOR":"Inspector",
  "COORDINADOR/A GENERAL":"Coordinador General",
  "COORDINADOR/A":"Coordinador Zonal","COORDINADOR":"Coordinador Zonal","COORDINADOR TT":"Coordinador Zonal",
  "ADMINISTRATIVO/A":"Administrativo","ADMINISTRATIVO":"Administrativo",
};
function rolDesdeJefatura(jefatura){
  const j=(jefatura||"").trim();
  if(!j) return null;
  return JEFATURA_A_ROL[j]||j;
}

// Fecha de HOY en el huso horario LOCAL del navegador (no UTC): usar
// new Date().toISOString() acá corre la fecha un día para adelante entre
// las 21:00 y la medianoche en Argentina (UTC-3), justo cuando
// toISOString() ya reporta el día siguiente en UTC. Antes de unificar
// esta función, gestion_personal.html y asignacion_zonas.html usaban la
// versión con toISOString() (con ese bug) mientras que novedades_personal
// ya usaba esta versión correcta — quedó una sola, la correcta.
function todayISO(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

// Suma `dias` (puede ser negativo) a la fecha de un <input type="date"> y
// dispara su evento "change" — así la página reacciona igual que si el
// usuario hubiera elegido la fecha a mano en el calendario (setear .value
// por JS solo no dispara "change").
function moverFecha(inputId, dias){
  const input=document.getElementById(inputId);
  if(!input) return;
  const d=new Date((input.value||todayISO())+"T12:00:00");
  d.setDate(d.getDate()+dias);
  input.value=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  input.dispatchEvent(new Event("change"));
}

function getEstadoPersona(p, hoy) {
  if(p.estado==='Baja'){
    // Si la baja tiene fecha, sigue "Activo" para consultas de fechas anteriores
    // a esa baja (ej: ver/asignar zonas de un día previo a que se diera de baja).
    if(p.fechaBaja && hoy<p.fechaBaja) return 'Activo';
    return 'Baja';
  }
  const lics=window.novedades.filter(n=>n.personaId===p.id&&n.tipo.toLowerCase().includes('licencia')&&n.licIni&&n.licFin&&n.estadoLic!=='Rechazada');
  if(lics.some(n=>hoy>=n.licIni&&hoy<=n.licFin)) return 'Licencia';
  return 'Activo';
}
function novedadesHoy() {
  const hoy=getFecha();
  return window.novedades.filter(n=>n.fecha===hoy||(n.tipo.toLowerCase().includes('licencia')&&n.licIni&&n.licFin&&hoy>=n.licIni&&hoy<=n.licFin));
}
function novsDePersonaHoy(pid){return novedadesHoy().filter(n=>n.personaId===pid);}
function allZonas(){return [...(window.zonas||[]),'EVENTO ESPECIAL','PARTIDO FÚTBOL'];}

// Novedad "puntual" (mismo día) o de rango (licencia con licIni/licFin) que cubre `fecha`
function novedadCubreFecha(n,fecha){return n.fecha===fecha||(n.licIni&&n.licFin&&fecha>=n.licIni&&fecha<=n.licFin);}
function novedadDePersonaEnFecha(pid,fecha){return (window.novedades||[]).find(n=>n.personaId===pid&&novedadCubreFecha(n,fecha));}

// Tipos de novedad que implican que la persona no está disponible ese día
// (licencia, ausencia, compensatorio, artículo, etc. — por nombre, ya que
// los tipos de novedad son configurables por el admin)
function esNovedadAusencia(tipo){
  const t=(tipo||'').toLowerCase();
  return t.includes('licencia')||t.includes('ausencia')||t.includes('compensatorio')||t.includes('articulo')||t.includes('artículo');
}
function personaAusenteEnFecha(pid,fecha){
  return (window.novedades||[]).some(n=>n.personaId===pid&&esNovedadAusencia(n.tipo)&&n.estadoLic!=='Rechazada'&&novedadCubreFecha(n,fecha));
}

function badgeTurno(t){return `<span class="badge ${TURNOS_BADGE[t]||'bdg-admin'}">${esc(t||'—')}</span>`;}
function badgeEstado(e){return `<span class="badge ${ESTADO_CLASS[e]||'bdg-activo'}">${esc(e)}</span>`;}
function badgeNov(tipo){return `<span class="badge ${NOV_CLASS[tipo]||'bdg-nov-otro'}">${esc(tipo)}</span>`;}
function badgeEstadoLic(e){return `<span class="badge ${ESTADO_LIC_CLASS[e]||'bdg-admin'}">${esc(e||'Pendiente')}</span>`;}

function esFeriado(fecha) {
  return (window.feriados||[]).includes(fecha);
}

// Qué turnos trabajan según el día de la semana y si es feriado.
// El feriado sólo afecta al turno DIURNO (entre semana se cubre como findes,
// con SADOFE Diurno en vez de Turno Mañana/Tarde). El turno NOCHE se define
// únicamente por el día de la semana y no cambia si es feriado: Lun-Jue de
// noche siempre es Turno Noche, Vie/Sáb/Dom de noche siempre es SADOFE Noche
// — SADOFE Noche no trabaja entre semana aunque ese día sea feriado.
function turnosQueTrabajan(diaSemana, fecha) {
  // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
  const esFinde     = diaSemana === 0 || diaSemana === 6;
  const esFeriadoD  = fecha ? esFeriado(fecha) : false;
  const esNoLaboral = esFinde || esFeriadoD;

  const result = new Set();
  if (esNoLaboral) {
    result.add('SADOFE Diurno');
  } else {
    result.add('Turno Mañana');
    result.add('Turno Tarde');
  }
  if (diaSemana >= 1 && diaSemana <= 4) {
    result.add('Turno Noche'); // Lun-Jue, sea o no feriado
  } else {
    result.add('SADOFE Noche'); // Vie-Sab-Dom, sea o no feriado
  }
  return result;
}

// Administrativo/Gerencia no entran en turnosQueTrabajan() (esa función sólo
// cubre los turnos de patrulla) — trabajan de lunes a viernes no feriado.
function trabajaHoy(persona, fecha) {
  const dia = new Date(fecha+'T12:00:00').getDay();
  if (persona.turno === 'Administrativo' || persona.turno === 'Gerencia') {
    return dia >= 1 && dia <= 5 && !esFeriado(fecha);
  }
  return turnosQueTrabajan(dia, fecha).has(persona.turno);
}

// ============================================================
//  ORDEN DE COLUMNAS (encabezados clicables con flecha ▲▼)
//  Compartido por las tablas-div de las 3 páginas de personal. Cada tabla
//  se identifica con un tablaId propio (ej: "nom", "dist", "hist") — el
//  estado de orden vive en memoria (se pierde al cambiar de pantalla, lo
//  cual está bien, no hace falta persistirlo).
// ============================================================
const _ordenTablas = {};
function ordenClick(tablaId, campo, renderFn){
  const st = _ordenTablas[tablaId] || (_ordenTablas[tablaId] = {campo:null, dir:'asc'});
  if (st.campo === campo) st.dir = (st.dir === 'asc' ? 'desc' : 'asc');
  else { st.campo = campo; st.dir = 'asc'; }
  if (typeof window[renderFn] === 'function') window[renderFn]();
}
function ordenEstado(tablaId){ return _ordenTablas[tablaId] || {campo:null, dir:'asc'}; }
// Encabezado clicable: label + flecha si es la columna activa
function thOrden(tablaId, campo, label, renderFn){
  const st = ordenEstado(tablaId);
  const flecha = st.campo === campo ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return '<span class="th-sort" onclick="ordenClick(\''+tablaId+'\',\''+campo+'\',\''+renderFn+'\')">'+esc(label)+flecha+'</span>';
}
// Ordena `lista` según el estado de orden de `tablaId`. Si no se clickeó
// ninguna columna todavía, usa el orden ya presente en `lista` tal cual
// (para no pisar un orden por defecto con lógica propia, ej: bajas al final).
// `getter(item, campo)` devuelve el valor comparable de esa fila para esa columna.
function ordenarLista(lista, tablaId, getter){
  const st = ordenEstado(tablaId);
  if (!st.campo) return lista;
  const factor = st.dir === 'desc' ? -1 : 1;
  return [...lista].sort((a,b)=>{
    let va = getter(a, st.campo), vb = getter(b, st.campo);
    va = (va===null||va===undefined) ? '' : va;
    vb = (vb===null||vb===undefined) ? '' : vb;
    if (typeof va === 'string' || typeof vb === 'string') {
      return factor * String(va).localeCompare(String(vb), 'es', {sensitivity:'base'});
    }
    return factor * (va > vb ? 1 : va < vb ? -1 : 0);
  });
}

// ============================================================
//  MOBILE — lista compacta (avatar/fecha + nombre + subtítulo + badge) y
//  panel de acciones secundarias "⋮". Compartido por gestion_personal.html
//  y novedades_personal.html.
// ============================================================
// Iniciales para el avatar de la lista compacta: primera letra del nombre
// + primera del apellido (si hay más de una palabra).
function inicialesNombre(nombre){
  const partes=(nombre||'').trim().split(/\s+/);
  if(!partes[0]) return '?';
  return (partes[0][0]+(partes[1]?partes[1][0]:'')).toUpperCase();
}

const MESES_CORTOS=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
// Fecha compacta para el bloque "fecha" de las listas de Novedades/
// Historial en mobile (reemplaza al avatar de iniciales, ya que estas
// listas son cronológicas). Espera "YYYY-MM-DD".
function fmtDateCorta(fecha){
  if(!fecha) return '—';
  const [, m, d]=fecha.split('-');
  return d+' '+MESES_CORTOS[parseInt(m,10)-1];
}

// Panel de acciones secundarias (el "⋮" de una fila en la lista compacta
// mobile). `acciones` = [{label, fn}, ...]. Requiere que la página host
// tenga el markup #mob-acciones-overlay (ver Task 1, Step 3/4) y las
// funciones cerrarModal()/esc() ya definidas (mismo patrón que el resto de
// los modales de estas páginas).
let _menuAccionesActuales=[];
function abrirMenuAcciones(titulo, acciones){
  _menuAccionesActuales=acciones;
  document.getElementById('mob-acciones-title').textContent=titulo;
  document.getElementById('mob-acciones-botones').innerHTML=acciones.map((a,i)=>
    `<button class="btn btn-gris" onclick="_ejecutarAccionMenu(${i})">${esc(a.label)}</button>`
  ).join('');
  document.getElementById('mob-acciones-overlay').classList.add('open');
}
function _ejecutarAccionMenu(i){
  cerrarModal('mob-acciones-overlay');
  _menuAccionesActuales[i].fn();
}
