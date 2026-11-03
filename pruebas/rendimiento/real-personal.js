// Prueba con el Firestore REAL de Asignación, Novedades, Gestión y
// Estadísticas, versión anterior vs. nueva. SÓLO LECTURA:
//  - el usuario de prueba debe tener esos módulos en "Sólo ver" (las reglas
//    de Firestore rechazan sus escrituras), y además
//  - real.js bloquea a nivel de red toda escritura a Firestore.
// Credenciales: variables de entorno DGF_TEST_USER / DGF_TEST_PASS (nunca
// se imprimen). Uso: node real-personal.js <dir_version_vieja> <dir_version_nueva>
const { chromium } = require('playwright');
const { nuevoCtx, abrir } = require('./real.js');
const USER = process.env.DGF_TEST_USER, PASS = process.env.DGF_TEST_PASS;
if (!USER || !PASS) { console.error('Faltan DGF_TEST_USER / DGF_TEST_PASS en el entorno.'); process.exit(2); }

// Firestore no garantiza el orden de los registros dentro de cada chunk, así
// que dos cargas de la misma versión pueden listar en otro orden. Para poder
// comparar el HTML viejo vs nuevo, se ordenan por id antes de medir.
const ordenar = (page) => page.evaluate(() => { const c = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); window.nomina.sort(c); window.novedades.sort(c); });
const listo = async (page) => { await page.waitForFunction(() => window._fsReady === true && /✅/.test(document.getElementById('syncTxt')?.textContent || '') && window.nomina.length > 0, null, { timeout: 120000 }); await ordenar(page); };
async function login(page) {
  await page.waitForSelector('#lUser', { state: 'visible', timeout: 60000 });
  await page.fill('#lUser', USER); await page.fill('#lPass', PASS);
  await page.evaluate(() => doLogin());
  await page.waitForFunction(() => window.usuarioActual && usuarioActual(), null, { timeout: 60000 })
    .catch(async () => { throw new Error('Login fallido: ' + await page.evaluate(() => document.getElementById('loginErr')?.textContent)); });
}
const FR = `const fr = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const med = async (fn, n = 1) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await fn(); await fr(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return +t[Math.floor(t.length / 2)].toFixed(0); };`;

async function version(browser, dir) {
  const ctx = await nuevoCtx(browser, dir);
  const out = { errores: [] };
  // Login en una pestaña descartable: la sesión queda guardada para el resto.
  // No se mide en esa pestaña porque, si la página arranca sin sesión, la
  // lectura previa al login falla y deja la nómina vacía en sessionStorage
  // (24 h), así que esa pestaña mostraría 0 personas aunque después se loguee.
  let { page, errores } = await abrir(ctx, 'asignacion_zonas.html');
  await login(page); await page.close();
  // Asignación
  ({ page, errores } = await abrir(ctx, 'asignacion_zonas.html'));
  let t0 = Date.now(); await listo(page);
  await page.waitForFunction(() => window.distribuciones[getFechaAsig()], null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  out.asignacion = await page.evaluate(`(async () => { ${FR}
    const r = { personas: window.nomina.length, novedades: window.novedades.length, soloLectura: window._soloLectura };
    r.renderDist_mediana = await med(() => renderDist(), 7); // lo que corre en cada cambio de zona
    r.html = document.getElementById('dist-body').innerHTML + document.getElementById('dist-stats').innerHTML;
    return r; })()`);
  out.errores.push(...errores); await page.close();
  // Novedades
  ({ page, errores } = await abrir(ctx, 'novedades_personal.html'));
  t0 = Date.now(); await listo(page); out.cargaNovedades = Date.now() - t0;
  await page.waitForTimeout(1000);
  out.novedades = await page.evaluate(`(async () => { ${FR}
    const r = {};
    r.renderAll = await med(() => renderAll(), 3);           // lo que corre después de guardar una novedad
    r.renderCargaDiaria = await med(() => renderCargaDiaria(), 3);
    r.renderHistorial = await med(() => renderHistorial(), 3);
    r.renderCompensatorios = await med(() => renderCompensatorios(), 3);
    r.renderRanking = await med(() => renderRanking(), 3);
    r.html = ['nov-hoy-list','carga-body','nom-body','hist-body','comp-body','rank-body'].map(id => document.getElementById(id).innerHTML).join('\\n');
    return r; })()`);
  out.errores.push(...errores); await page.close();
  // Gestión
  ({ page, errores } = await abrir(ctx, 'gestion_personal.html'));
  t0 = Date.now(); await listo(page); out.cargaGestion = Date.now() - t0;
  await page.waitForFunction(() => window.distribuciones[getFechaAsig()], null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  out.gestion = await page.evaluate(`(async () => { ${FR}
    const r = { renderAll: await med(() => renderAll(), 3) };
    r.html = ['dist-body','nom-body','nov-body'].map(id => document.getElementById(id)?.innerHTML || '').join('\\n');
    return r; })()`);
  out.errores.push(...errores); await page.close();
  // Estadísticas
  ({ page, errores } = await abrir(ctx, 'estadisticas_actas.html'));
  t0 = Date.now();
  await page.waitForFunction(() => (window.ACTAS || []).length > 0, null, { timeout: 120000 }).catch(() => {});
  out.cargaEstadisticas = Date.now() - t0;
  out.estadisticas = await page.evaluate(`(async () => { ${FR}
    const r = { actas: (window.ACTAS || []).length };
    if (!r.actas) return r;
    r.aplicarFiltros = await med(() => aplicarFiltros(), 3);
    const b = [...document.querySelectorAll('.tab')].find(b => /switchTab\\('mapa'/.test(b.getAttribute('onclick') || ''));
    r.abrirMapa = await med(() => switchTab('mapa', b), 1);
    r.redibujarMapa = await med(() => renderMapa(), 3);
    r.kpiTotal = document.getElementById('kTotal').textContent;
    return r; })()`);
  out.errores.push(...errores); await page.close();
  out.escriturasBloqueadas = ctx._bloqueadas.length;
  await ctx.close();
  return out;
}
(async () => {
  const [viejo, nuevo] = process.argv.slice(2);
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const R = { viejo: await version(browser, viejo), nuevo: await version(browser, nuevo) };
  await browser.close();
  const a = R.viejo.asignacion;
  console.log(`Datos reales: ${a.personas} personas, ${a.novedades} novedades, ${R.viejo.estadisticas.actas} actas · usuario sólo lectura: ${a.soloLectura}`);
  const filas = [
    ['Asignación: redibujo al cambiar zona', r => r.asignacion.renderDist_mediana],
    ['Novedades: carga de la página', r => r.cargaNovedades],
    ['Novedades: redibujo tras guardar (renderAll)', r => r.novedades.renderAll],
    ['Novedades: carga diaria', r => r.novedades.renderCargaDiaria],
    ['Novedades: historial', r => r.novedades.renderHistorial],
    ['Novedades: compensatorios', r => r.novedades.renderCompensatorios],
    ['Novedades: ranking', r => r.novedades.renderRanking],
    ['Gestión: carga de la página', r => r.cargaGestion],
    ['Gestión: renderAll', r => r.gestion.renderAll],
    ['Estadísticas: carga de la página', r => r.cargaEstadisticas],
    ['Estadísticas: aplicar filtros', r => r.estadisticas.aplicarFiltros],
    ['Estadísticas: abrir mapa', r => r.estadisticas.abrirMapa],
    ['Estadísticas: redibujar mapa', r => r.estadisticas.redibujarMapa],
  ];
  console.log('\n| Medición (ms) | Antes | Ahora |\n|---|---|---|');
  for (const [n, f] of filas) console.log(`| ${n} | ${f(R.viejo) ?? '—'} | ${f(R.nuevo) ?? '—'} |`);
  if (process.env.HTML_DIR) { const fs = require('fs'); for (const v of ['viejo', 'nuevo']) for (const k of ['asignacion', 'novedades', 'gestion']) fs.writeFileSync(`${process.env.HTML_DIR}/${k}-${v}.html`, R[v][k].html); fs.writeFileSync(`${process.env.HTML_DIR}/resumen.json`, JSON.stringify({ viejo: R.viejo.asignacion, nuevo: R.nuevo.asignacion }, (k, v) => k === 'html' ? undefined : v)); }
  const eq = (f) => f(R.viejo) === f(R.nuevo) ? 'idéntico' : 'DISTINTO';
  console.log('\nHTML viejo vs nuevo — Asignación:', eq(r => r.asignacion.html), '· Novedades:', eq(r => r.novedades.html), '· Gestión:', eq(r => r.gestion.html), '· KPI total actas:', eq(r => r.estadisticas.kpiTotal));
  for (const v of ['viejo', 'nuevo']) console.log(`${v}: errores ${JSON.stringify(R[v].errores)} · escrituras bloqueadas ${R[v].escriturasBloqueadas}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
