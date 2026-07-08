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
const NOV_CLASS    = {"Licencia":"bdg-nov-lic","Llegada tarde":"bdg-nov-tar","Retiro anticipado":"bdg-nov-ret","Ausencia":"bdg-nov-aus","Otro":"bdg-nov-otro","Presente":"bdg-nov-presente"};
const ESTADO_CLASS = {"Activo":"bdg-activo","Licencia":"bdg-licencia","Baja":"bdg-baja"};
const ZONAS_DEFAULT = ["ONCE","AVELLANEDA","LINIERS","CONSTITUCIÓN","RETIRO","FLORIDA","CAMINITO","CORRIENTES CULTURAL","BARRIO CHINO","SAN TELMO","BOULEVARD CERVIÑO","PLAZA FRANCIA","PARQUE TRES DE FEBRERO","PARQUE MATADEROS","PATRULLA I","PATRULLA II","PATRULLA III","PATRULLA IV","PATRULLA V"];

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

function getEstadoPersona(p, hoy) {
  if(p.estado==='Baja'){
    // Si la baja tiene fecha, sigue "Activo" para consultas de fechas anteriores
    // a esa baja (ej: ver/asignar zonas de un día previo a que se diera de baja).
    if(p.fechaBaja && hoy<p.fechaBaja) return 'Activo';
    return 'Baja';
  }
  const lics=window.novedades.filter(n=>n.personaId===p.id&&n.tipo==='Licencia'&&n.licIni&&n.licFin);
  if(lics.some(n=>hoy>=n.licIni&&hoy<=n.licFin)) return 'Licencia';
  return 'Activo';
}
function novedadesHoy() {
  const hoy=getFecha();
  return window.novedades.filter(n=>n.fecha===hoy||(n.tipo==='Licencia'&&n.licIni&&n.licFin&&hoy>=n.licIni&&hoy<=n.licFin));
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
  return (window.novedades||[]).some(n=>n.personaId===pid&&esNovedadAusencia(n.tipo)&&novedadCubreFecha(n,fecha));
}

function badgeTurno(t){return `<span class="badge ${TURNOS_BADGE[t]||'bdg-admin'}">${esc(t||'—')}</span>`;}
function badgeEstado(e){return `<span class="badge ${ESTADO_CLASS[e]||'bdg-activo'}">${esc(e)}</span>`;}
function badgeNov(tipo){return `<span class="badge ${NOV_CLASS[tipo]||'bdg-nov-otro'}">${esc(tipo)}</span>`;}

function esFeriado(fecha) {
  return (window.feriados||[]).includes(fecha);
}

// Qué turnos trabajan según el día de la semana y si es feriado
// Feriados = mismo tratamiento que sábado/domingo (SADOFE)
function turnosQueTrabajan(diaSemana, fecha) {
  // 0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab
  const esFinde    = diaSemana === 0 || diaSemana === 6;
  const esViernes  = diaSemana === 5;
  const esFeriadoD = fecha ? esFeriado(fecha) : false;
  const esNoLaboral = esFinde || esFeriadoD;

  const result = new Set();
  if (esNoLaboral) {
    // Sábado, domingo o feriado → SADOFE
    result.add('SADOFE Diurno');
    result.add('SADOFE Noche');
  } else {
    // Día hábil
    result.add('Turno Mañana');
    result.add('Turno Tarde');
    if (diaSemana >= 1 && diaSemana <= 4) result.add('Turno Noche'); // Lun-Jue
  }
  // SADOFE Noche también trabaja el viernes hábil (no feriado) por la noche
  if (esViernes && !esFeriadoD) result.add('SADOFE Noche');
  // Y siempre en finde/feriado ya está incluido arriba
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
