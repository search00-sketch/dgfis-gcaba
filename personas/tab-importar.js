// Pestaña Importar (sólo administradores): copia UNA VEZ la nómina actual a
// Personas, con el DNI/CUIL como clave. La nómina actual sólo se LEE: no se
// modifica ni se borra nada. Se puede repetir sin riesgo: sólo agrega a quien
// todavía no está en Personas.
import { S, leerNominaActual, importarPersonas } from './store.js';
import * as L from './logica.js';
import { $, esc, toast, descargarCSV, fmtNum } from './dom.js';

let el, analisis = null;

export function mount(raiz) {
  el = raiz;
  el.innerHTML = `
    <div class="gestion-zonas">
      <div class="gz-title">📥 Traer la nómina actual a Personas</div>
      <p class="nota">Lee la nómina que ya existe (sin modificarla), arma una ficha por DNI y muestra el resultado antes de guardar nada.
        Quien tiene dos registros con el mismo DNI (por ejemplo un alta y una baja anteriores) queda en una sola ficha con su historial.
        Los datos bancarios y de emergencia van a una colección aparte que sólo ven los administradores.</p>
      <button class="btn btn-azul" id="iana">🔎 Analizar la nómina actual</button>
      <div id="ires"></div>
    </div>`;
  $('#iana', el).addEventListener('click', analizar);
}
export function render() { if (analisis) pintar(); }

async function analizar() {
  const b = $('#iana', el), res = $('#ires', el);
  b.disabled = true; res.innerHTML = '<div class="aviso">Leyendo la nómina…</div>';
  try {
    const nomina = await leerNominaActual();
    analisis = { nomina: nomina.length, ...L.fusionarNomina(nomina) };
    pintar();
  } catch (e) {
    res.innerHTML = `<div class="aviso aviso-mal">No se pudo leer la nómina: ${esc(e.message)}</div>`;
  } finally { b.disabled = false; }
}

function pintar() {
  const a = analisis, res = $('#ires', el);
  const nuevas = a.personas.filter(x => !S.porDni.has(x.persona.dni)).length;
  res.innerHTML = `
    <div class="kpis">
      ${[['Registros en la nómina', fmtNum(a.nomina)], ['Personas con DNI/CUIL', fmtNum(a.personas.length)], ['Duplicados fusionados', fmtNum(a.fusionadas)],
        ['Sin DNI ni CUIL', fmtNum(a.sinId.length)], ['DNI ≠ CUIL', fmtNum(a.conflictos.length)], ['Ya están en Personas', fmtNum(a.personas.length - nuevas)]]
        .map(([k, v]) => `<div class="kpi"><div class="kpi-n">${v}</div><div class="kpi-l">${k}</div></div>`).join('')}
    </div>
    <p>${nuevas ? `Se van a agregar <b>${nuevas}</b> personas.` : 'No hay nadie nuevo para agregar.'}
      ${a.sinId.length ? `Las <b>${a.sinId.length}</b> personas sin DNI ni CUIL <b>no se importan</b>: descargá la lista, completá el DNI y cargalas con "Nueva persona".` : ''}</p>
    <div class="modal-actions" style="justify-content:flex-start">
      <button class="btn btn-verde" id="iok" ${nuevas ? '' : 'disabled'}>✅ Importar ${nuevas} personas</button>
      <button class="btn btn-gris" id="isin" ${a.sinId.length ? '' : 'hidden'}>⬇ Lista sin DNI/CUIL</button>
      <button class="btn btn-gris" id="idud" ${a.conflictos.length || a.cuilDudoso.length ? '' : 'hidden'}>⬇ Lista de dudosos</button>
    </div>
    <div id="iprog" class="nota"></div>`;
  $('#iok', el).addEventListener('click', async () => {
    const b = $('#iok', el); b.disabled = true;
    try {
      const r = await importarPersonas(a.personas, m => { $('#iprog', el).textContent = m; });
      toast('✅ Importadas ' + r.agregadas + ' personas'); $('#iprog', el).textContent = 'Listo: ' + r.agregadas + ' agregadas, ' + r.sensibles + ' con datos sensibles aparte.';
      pintar();
    } catch (e) { $('#iprog', el).textContent = 'Falló la importación: ' + e.message + ' (podés volver a intentarlo: no duplica).'; b.disabled = false; }
  });
  if (a.sinId.length) $('#isin', el).addEventListener('click', () => descargarCSV('sin-dni-ni-cuil.csv',
    [['Id en la nómina actual', 'Nombre', 'Estado'], ...a.sinId.map(x => [x.legacyId, x.nombre, x.estado])]));
  if (a.conflictos.length || a.cuilDudoso.length) $('#idud', el).addEventListener('click', () => descargarCSV('dni-cuil-dudosos.csv',
    [['Motivo', 'Id en la nómina actual', 'Nombre', 'DNI', 'DNI según CUIL'],
     ...a.conflictos.map(x => ['DNI distinto del CUIL', x.legacyId, x.nombre, x.dni, x.dniDelCuil]),
     ...a.cuilDudoso.map(x => ['CUIL con dígito verificador dudoso', x.legacyId, x.nombre, x.id, ''])]));
}
