// Pruebas de personas-logica.js.
//   node pruebas/personas/probar.mjs                       -> sólo casos armados
//   node pruebas/personas/probar.mjs ruta/al/backup.json   -> además mide contra datos reales
// Con el backup sólo imprime conteos (ningún nombre, DNI ni dato personal).
import assert from 'assert';
import fs from 'fs';
import * as P from '../../personas/logica.js';

// ---- identificación ----
assert.strictEqual(P.normDni('30.123.456'), '30123456');
assert.strictEqual(P.normDni('0012345678'), '12345678');
assert.strictEqual(P.normDni('123'), '');
assert.strictEqual(P.dniDeCuil('20-30123456-3'), '30123456');
assert.strictEqual(P.dniDeCuil('3012345'), '');
assert.deepStrictEqual(P.identificar({ dni: '', cuil: '20-30123456-3' }).id, '30123456');
assert.strictEqual(P.identificar({ dni: '30123456', cuil: '20-30123457-3' }).conflicto, true);
assert.strictEqual(P.claveDeBusqueda('27-12.345.678-0'), '12345678');
assert.strictEqual(P.claveDeBusqueda('12.345.678'), '12345678');
assert.ok(P.cuilVerificadorOk('20-30123456-3') === true || P.cuilVerificadorOk('20-30123456-3') === false);
assert.strictEqual(P.cuilVerificadorOk('20-11111111-2'), true); // 20-11111111-2 es un CUIL válido

// ---- nombres ----
assert.ok(P.nombreCoincide('PEREZ, Juan Carlos', 'Juan Perez'));
assert.ok(!P.nombreCoincide('PEREZ Juan', 'GOMEZ Juan'));
const lista = [{ dni: '111111', cuil: '', nombre: 'Ana Gómez' }, { dni: '30123456', cuil: '20301234563', nombre: 'Luis Pérez' }];
assert.strictEqual(P.buscarPersonas(lista, '30.123').length, 1);
assert.strictEqual(P.buscarPersonas(lista, 'perez luis').length, 1);

// ---- fusión: Activo + Baja del mismo DNI quedan en una sola persona ----
const nom = [
  { id: '1', nombre: 'A A', dni: '20000001', cuil: '', estado: 'Baja', fechaIngreso: '2020-01-01', fechaBaja: '2021-01-01', motivoBaja: 'x', cbu: '123' },
  { id: '2', nombre: 'A A', dni: '20000001', cuil: '20-20000001-6', estado: 'Activo', fechaIngreso: '2024-01-01', rol: 'Inspector', cbu: '999', talle: 'M' },
  { id: '3', nombre: 'B B', dni: '', cuil: '27-21000002-4', estado: 'Activo' },
  { id: '4', nombre: 'C C', dni: '', cuil: '', estado: 'Activo' },
  { id: '5', nombre: 'D D', dni: '22000003', cuil: '20-22000004-9', estado: 'Activo' },
];
const f = P.fusionarNomina(nom);
assert.strictEqual(f.personas.length, 3);          // A, B, D
assert.strictEqual(f.fusionadas, 1);
assert.strictEqual(f.sinId.length, 1);
assert.strictEqual(f.conflictos.length, 1);
const a = f.personas.find(x => x.persona.dni === '20000001');
assert.strictEqual(a.persona.estado, 'Activo');
assert.strictEqual(a.persona.historial.length, 1);
assert.deepStrictEqual(a.persona.legacyIds.sort(), ['1', '2']);
assert.deepStrictEqual(a.persona.categorias, ['Inspector']);
assert.strictEqual(a.sensibles.cbu, '999');        // el CBU va aparte
assert.ok(!('cbu' in a.persona));
assert.strictEqual(a.persona.extra.talle, 'M');
assert.ok(!JSON.stringify(a.persona).includes('undefined'));
const b = f.personas.find(x => x.persona.dni === '21000002');
assert.strictEqual(b.persona.cuil, '27210000024'); // DNI derivado del CUIL

// ---- talonarios ----
const actas = [
  { actaSecuestro: '100', fecha: '2026-11-01', inspector: 'Pérez Juan' },
  { actaSecuestro: '00101', fecha: '2026-11-02', inspector: 'Pérez Juan' },
  { actaSecuestro: '103', fecha: '2026-11-05', inspector: 'Pérez Juan' },
  { actaSecuestro: '103', fecha: '2026-11-06', inspector: 'Pérez Juan' },      // repetida
  { actaSecuestro: '104', fecha: '2026-11-04', inspector: 'Gómez Ana María' }, // de otra persona
  { actaSecuestro: '250', fecha: '2026-11-07', inspector: 'Pérez Juan' },      // fuera del rango
  { actaSecuestro: '1000102', fecha: '2026-11-08', inspector: 'Pérez Juan' },  // otra serie (7 dígitos)
  { actaComprobacion: '102', fecha: '2026-11-09', inspector: 'Pérez Juan' },   // otro tipo
];
const t = { id: 't1', tipo: 'secuestro', desde: 100, hasta: 149, dni: '20000001', estado: 'activo' };
const s = P.estadisticasTalonario(t, actas, 'Juan Pérez');
assert.strictEqual(s.total, 50);
assert.strictEqual(s.usadas, 4);                   // 100,101,103,104 (y 102 7 dígitos no cuenta aquí... ver largo)
assert.strictEqual(s.ultimaNro, 103);              // la más reciente por fecha
assert.strictEqual(s.ultimaFecha, '2026-11-06');
assert.strictEqual(s.repetidas, 1);
assert.strictEqual(s.ajenas, 1);
assert.strictEqual(s.saltadas, 1);                 // falta la 102
assert.strictEqual(s.ultimoDelTalonario, 149);
const sl = P.estadisticasTalonario({ ...t, desde: 1000100, hasta: 1000149, largo: 7 }, actas, 'Juan Pérez');
assert.strictEqual(sl.usadas, 1);
const sc = P.estadisticasTalonario({ ...t, tipo: 'comprobacion' }, actas, 'Juan Pérez');
assert.strictEqual(sc.usadas, 1);
const v = P.validarTalonario({ id: 't2', tipo: 'secuestro', desde: 120, hasta: 160, dni: '1' }, [t]);
assert.strictEqual(v.errores.length, 0);
assert.strictEqual(v.avisos.length, 1);            // se superpone con t1
assert.ok(P.validarTalonario({ id: 'x', tipo: 'secuestro', desde: 9, hasta: 3, dni: '1' }, []).errores.length);

// ---- patentes ----
assert.strictEqual(P.normPatente('ab 123-cd'), 'AB123CD');
assert.ok(P.patenteConFormato('AB123CD') && P.patenteConFormato('ABC123') && !P.patenteConFormato('12'));
// ---- planilla ACTAS 2026 ----
assert.deepStrictEqual(P.celdaNumero('0009180 '), { n: 9180, nota: '' });
assert.deepStrictEqual(P.celdaNumero('31900 entregado a legales 24/11/2026'), { n: 31900, nota: 'entregado a legales 24/11/2026' });
assert.deepStrictEqual(P.celdaNumero('16550 - termino talonario '), { n: 16550, nota: 'termino talonario' });
assert.strictEqual(P.celdaNumero('NO TIENE ACTAS DE SECUESTRO').n, null);
assert.strictEqual(P.celdaNumero('4.0079105E8').n, 400791050);
assert.strictEqual(P.celdaNumero(400874652).n, 400874652);
assert.strictEqual(P.celdaFecha(46091), '2026-03-10');
assert.strictEqual(P.celdaFecha('16/07/2026'), '2026-07-16');
assert.strictEqual(P.celdaFecha('6/7/26'), '2026-07-06');
assert.strictEqual(P.celdaFecha('PASE A OTRA AREA'), '');
assert.strictEqual(P.celdaFecha('31/02/2026'), '');
const hdr = ['APELLIDOS Y NOMBRE', 'CUIT', 'TURNO'];
const pl = P.parsearPlanillaActas({
  secuestro: [hdr,
    ['A A', 20300000014, 'TARDE', 46091, '100', '149', '16/07/2026', 150, 199],             // 2 entregas: la 1.ª se cierra
    ['B B', '27-21000002-4', 'TARDE', '', '0003643', '0003650 entregado a legales 06/07/2026'], // nota de cierre
    ['C C', 20300000014, 'TARDE', '', 120, 130],                                              // mismo CUIT, rango que pisa: distinto id
    ['D D', '', 'TARDE', '', 300, 349],                                                       // sin CUIT
    ['E E', 20400000011, 'TARDE', '', 'NO TIENE ACTAS DE SECUESTRO', 'NO TIENE ACTAS DE SECUESTRO'],
    ['F F', 20400000011, 'TARDE', '', 500, 450]],                                             // final < inicio
  intimacion: [hdr, ['A A', 20300000014, 'TARDE', '', 7851, 7900]],
}, 'test');
assert.strictEqual(pl.talonarios.filter(t => t.dni === '30000001').length, 4); // A (2 sec) + C (1) + A (1 intim)... ver abajo
const a1 = pl.talonarios.find(t => t.id === 'secuestro-100-149');
assert.strictEqual(a1.estado, 'cerrado'); assert.strictEqual(a1.entregadoEn, '2026-03-10');
assert.strictEqual(pl.talonarios.find(t => t.id === 'secuestro-150-199').estado, 'activo');
assert.strictEqual(pl.talonarios.find(t => t.id === 'secuestro-3643-3650').estado, 'cerrado'); // "entregado a legales"
assert.strictEqual(pl.sinCuit.length, 1);
assert.ok(pl.ignoradas.some(x => x.motivo === 'el final es menor que el inicio'));
assert.ok(!pl.ignoradas.some(x => /NO TIENE/i.test(x.texto || '')));
assert.strictEqual(pl.talonarios.find(t => t.tipo === 'intimacion').dni, '30000001');
const si = P.estadisticasTalonario({ tipo: 'intimacion', desde: 7851, hasta: 7900, dni: '1' }, actas, '');
assert.strictEqual(si.sinFuente, true); assert.strictEqual(si.total, 50);
console.log('casos armados: OK');

// ---- contra el backup real (sólo conteos) ----
const ruta = process.argv[2];
if (ruta) {
  const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const r = P.fusionarNomina(d.nomina);
  const conSens = r.personas.filter(x => Object.keys(x.sensibles).length).length;
  const bytes = r.personas.reduce((n, x) => n + JSON.stringify(x.persona).length, 0);
  console.log('nómina actual:', d.nomina.length, 'registros');
  console.log('personas con ID único:', r.personas.length, '| duplicados fusionados:', r.fusionadas);
  console.log('sin DNI ni CUIL (hay que completar a mano):', r.sinId.length, '| DNI distinto del CUIL:', r.conflictos.length, '| CUIL con verificador dudoso:', r.cuilDudoso.length);
  console.log('con datos sensibles (irían a la colección aparte):', conSens, '| tamaño de las fichas:', Math.round(bytes / 1024), 'KB');
  console.log('con alguna categoría desde el rol:', r.personas.filter(x => x.persona.categorias.length).length);
  console.log('ids repetidos tras fusionar:', r.personas.length - new Set(r.personas.map(x => x.persona.dni)).size);

  // talonario de prueba sobre actas reales: un bloque de 100 números alrededor de la mediana de un inspector
  const actasR = d.actas;
  const t0 = Date.now();
  const nums = actasR.map(x => P.nroActa(x.actaSecuestro)).filter(n => n && String(n).length === 5).sort((a, b) => a - b);
  const centro = nums[Math.floor(nums.length / 2)];
  const sr = P.estadisticasTalonario({ id: 'p', tipo: 'secuestro', desde: centro, hasta: centro + 99, largo: 5, dni: '1' }, actasR, null);
  console.log('talonario de prueba (100 números de 5 dígitos) sobre', actasR.length, 'actas:', { usadas: sr.usadas, restantes: sr.restantes, repetidas: sr.repetidas, saltadas: sr.saltadas, ultimaFecha: sr.ultimaFecha }, '|', Date.now() - t0, 'ms');
}

// ---- planilla real (sólo conteos): node probar.mjs backup.json planilla.json ----
// planilla.json = {secuestro, comprobacion, intimacion}: filas de cada hoja como arrays.
if (process.argv[2] && process.argv[3]) {
  const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const hojas = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const r = P.parsearPlanillaActas(hojas, 'prueba');
  const personas = new Set(P.fusionarNomina(d.nomina).personas.map(x => x.persona.dni));
  const por = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  console.log('planilla -> talonarios:', r.talonarios.length, por(r.talonarios, t => t.tipo), '| estado', por(r.talonarios, t => t.estado));
  console.log('ignoradas:', r.ignoradas.length, por(r.ignoradas, x => x.motivo), '| sin CUIT válido:', r.sinCuit.length);
  console.log('talonarios cuya persona existe en Personas:', r.talonarios.filter(t => personas.has(t.dni)).length, 'de', r.talonarios.length);
  console.log('id repetidos:', r.talonarios.length - new Set(r.talonarios.map(t => t.id)).size, '| con fecha:', r.talonarios.filter(t => t.entregadoEn).length);
  // ¿Los rangos de la planilla coinciden con lo que realmente se labró? (sólo secuestro y comprobación, activos)
  const nombres = new Map(P.fusionarNomina(d.nomina).personas.map(x => [x.persona.dni, x.persona.nombre]));
  let conActas = 0, total = 0, ajenasAlta = 0, ultimas = [];
  r.talonarios.filter(t => t.tipo !== 'intimacion' && t.estado === 'activo').forEach(t => {
    total++;
    const s = P.estadisticasTalonario(t, d.actas, nombres.get(t.dni) || '');
    if (s.usadas > 0) conActas++;
    if (s.usadas > 0 && s.ajenas / s.usadas > 0.5) ajenasAlta++;
    if (s.ultimaFecha) ultimas.push(P.diasEntre(s.ultimaFecha, '2026-11-26'));
  });
  ultimas.sort((a, b) => a - b);
  console.log('talonarios activos (secuestro+comprobación):', total, '| con al menos 1 acta ya labrada en el sistema:', conActas,
    '| con más de la mitad de sus actas a nombre de otra persona:', ajenasAlta);
  console.log('días desde la última acta (mediana / p90):', ultimas[Math.floor(ultimas.length / 2)], '/', ultimas[Math.floor(ultimas.length * 0.9)]);
}
