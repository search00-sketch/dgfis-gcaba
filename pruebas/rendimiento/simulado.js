const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = __dirname, LIBS = path.join(S, '.libs');
const DATA = require('child_process').execFileSync(process.execPath, [path.join(S, 'gen-data.js')], { maxBuffer: 1 << 28 }).toString();
const STUB = fs.readFileSync(path.join(S, 'fb-stub.js'), 'utf8');
const LIBMAP = {
  'xlsx.full.min.js': 'xlsx-0.18.5/package/dist/xlsx.full.min.js',
  'leaflet.js': 'leaflet-1.9.4/package/dist/leaflet.js', 'leaflet.css': 'leaflet-1.9.4/package/dist/leaflet.css',
  'leaflet-heat.js': 'leaflet.heat-0.2.0/package/dist/leaflet-heat.js',
  'chart.umd.min.js': 'chart.js-4.4.0/package/dist/chart.umd.js',
  'leaflet.markercluster.js': 'leaflet.markercluster-1.5.3/package/dist/leaflet.markercluster.js',
  'jszip.min.js': 'jszip-3.10.1/package/dist/jszip.min.js',
};
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
async function abrir(browser, dir, pagina, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(`window.__STUB_DATA=${DATA};window.__STUB_LAT=40;`);
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'test.local') {
      const f = path.join(dir, decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
      return route.fulfill({ status: 404, body: '' });
    }
    if (u.host === 'www.gstatic.com' && u.pathname.includes('firebasejs')) return route.fulfill({ body: STUB, contentType: 'application/javascript' });
    const base = path.basename(u.pathname);
    if (LIBMAP[base]) return route.fulfill({ body: fs.readFileSync(path.join(LIBS, LIBMAP[base])), contentType: MIME[path.extname(base)] });
    return route.abort();
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
  const t0 = Date.now();
  await page.goto('http://test.local/' + pagina + query);
  return { ctx, page, errores, t0 };
}
const esperarPersonal = (page) => page.waitForFunction(() => window._fsReady === true && /✅/.test(document.getElementById('syncTxt')?.textContent || ''), null, { timeout: 60000 });
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function asignacion(browser, dir) {
  const { ctx, page, errores, t0 } = await abrir(browser, dir, 'asignacion_zonas.html');
  await esperarPersonal(page); const carga = Date.now() - t0;
  await page.waitForFunction(() => window.distribuciones[getFechaAsig()], null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const zonasVisiblesSinTocar = await page.evaluate(() => document.querySelectorAll('#dist-body select.zona-select.asignada').length);
  await page.evaluate(() => renderDist());
  const html = await page.evaluate(() => ({ dist: document.getElementById('dist-body').innerHTML, stats: document.getElementById('dist-stats').innerHTML }));
  const tiempos = await page.evaluate(async () => {
    const fr = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const out = [];
    for (let i = 0; i < 6; i++) {
      const s = document.querySelectorAll('#dist-body select.zona-select')[i * 7];
      const t0 = performance.now();
      s.value = s.options[(s.selectedIndex + 1) % s.options.length].value;
      s.dispatchEvent(new Event('change'));
      const t1 = performance.now(); await fr();
      out.push({ js: t1 - t0, total: performance.now() - t0 });
    }
    return out;
  });
  await ctx.close();
  return { carga, html, tiempos, errores, zonasVisiblesSinTocar };
}
async function novedades(browser, dir) {
  const { ctx, page, errores, t0 } = await abrir(browser, dir, 'novedades_personal.html');
  await esperarPersonal(page); const carga = Date.now() - t0;
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const fr = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const med = async (fn) => { const t0 = performance.now(); await fn(); await fr(); return performance.now() - t0; };
    const t = {};
    t.renderAll = await med(() => renderAll());
    t.renderHistorial = await med(() => renderHistorial());
    t.renderCompensatorios = await med(() => renderCompensatorios());
    t.renderRanking = await med(() => renderRanking());
    const html = {}; ['nov-hoy-list', 'carga-body', 'nom-body', 'hist-body', 'comp-body', 'rank-body'].forEach(id => html[id] = document.getElementById(id).innerHTML);
    // Flujo completo de "guardar novedad" (como el botón Confirmar del modal)
    _editNovId = null;
    _novPendiente = { id: 'test_nov_1', personaId: 'p5', fecha: todayISO(), tipo: 'Ausencia', detalle: 'prueba' };
    const ops0 = { ...window.__STUB_OPS };
    t.guardarNovedad = await med(() => confirmarGuardarNovedad());
    t.lecturasGuardado = window.__STUB_OPS.reads - ops0.reads; t.escriturasGuardado = window.__STUB_OPS.writes - ops0.writes;
    t.guardada = window.novedades.some(n => n.id === 'test_nov_1') && !!window.__STUB_STORE.get('novedades_chunks/chunk_' + window.novedades.find(n => n.id === 'test_nov_1')._chunk)?.registros?.test_nov_1;
    const p5 = window.nomina.find(p => p.id === 'p5');
    t.apareceEnNovedadesDelDia = document.getElementById('nov-hoy-list').innerHTML.includes(p5.nombre);
    return { t, html };
  });
  await ctx.close();
  return { carga, ...r, errores };
}
async function gestion(browser, dir) {
  const { ctx, page, errores, t0 } = await abrir(browser, dir, 'gestion_personal.html', '?perf=1');
  const perfLogs = []; page.on('console', m => { if (m.text().includes('⏱')) perfLogs.push(m.text()); });
  await esperarPersonal(page); const carga = Date.now() - t0;
  await page.waitForFunction(() => window.distribuciones[getFechaAsig()], null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const fr = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const t0 = performance.now(); renderAll(); await fr();
    const html = {}; ['dist-body', 'nom-body', 'nov-body'].forEach(id => { const e = document.getElementById(id); if (e) html[id] = e.innerHTML; });
    return { renderAll: performance.now() - t0, html };
  });
  await ctx.close();
  return { carga, ...r, errores, perfLogs };
}
async function humo(browser, dir, pagina, esperar) {
  const { ctx, page, errores } = await abrir(browser, dir, pagina);
  let extra = '';
  try { extra = await esperar(page); } catch (e) { errores.push('espera: ' + e.message.split('\n')[0]); }
  await page.waitForTimeout(500);
  await ctx.close();
  return { extra, errores };
}
(async () => {
  const [oldDir, newDir] = process.argv.slice(2);
  const browser = await chromium.launch();
  const res = {};
  for (const [nombre, dir] of [['viejo', oldDir], ['nuevo', newDir]]) {
    res[nombre] = { asignacion: await asignacion(browser, dir), novedades: await novedades(browser, dir), gestion: await gestion(browser, dir) };
    res[nombre].humo = {};
    res[nombre].humo.index = await humo(browser, dir, 'index.html', p => p.waitForTimeout(800));
    res[nombre].humo.buscador = await humo(browser, dir, 'buscador_permisos.html', async p => {
      await p.waitForFunction(() => (window.DB || []).length > 0, null, { timeout: 30000 });
      await p.fill('#qN', 'titular 12 ñandu'); await p.waitForTimeout(400);
      return 'resultados=' + await p.evaluate(() => (typeof curRes !== 'undefined' ? curRes.length : -1));
    });
    res[nombre].humo.estadisticas = await humo(browser, dir, 'estadisticas_actas.html', async p => {
      await p.waitForFunction(() => /actas/.test(document.getElementById('dbTxt')?.textContent || '') && (window.ACTAS || []).length > 0, null, { timeout: 30000 });
      await p.evaluate(() => { const b = [...document.querySelectorAll('.tab')].find(b => /switchTab\('mapa'/.test(b.getAttribute('onclick') || '')); switchTab('mapa', b); const pb = [...document.querySelectorAll('.mctl')].find(b => /puntos/.test(b.getAttribute('onclick') || '')); if (pb) setMapMode('puntos', pb); else renderMapa(); });
      await p.waitForTimeout(800);
      return await p.evaluate(() => 'kTotal=' + document.getElementById('kTotal').textContent + ' canvasMapa=' + document.querySelectorAll('#map canvas').length + ' svgMapa=' + document.querySelectorAll('#map svg path').length + ' charts=' + document.querySelectorAll('canvas').length);
    });
    for (const pg of ['informe_venta_ilegal.html', 'relevamientos_operativos.html', 'urbetrack_venta.html']) res[nombre].humo[pg] = await humo(browser, dir, pg, p => p.waitForTimeout(1500));
  }
  await browser.close();
  // --- Reporte
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)].toFixed(0); };
  for (const v of ['viejo', 'nuevo']) {
    const r = res[v];
    console.log(`\n=== ${v.toUpperCase()}`);
    console.log(`Asignación: carga ${r.asignacion.carga} ms · cambio de zona: JS mediana ${med(r.asignacion.tiempos.map(x => x.js))} ms, hasta pintar ${med(r.asignacion.tiempos.map(x => x.total))} ms`);
    const t = r.novedades.t;
    console.log(`Novedades: carga ${r.novedades.carga} ms · renderAll ${t.renderAll.toFixed(0)} · historial ${t.renderHistorial.toFixed(0)} · compensatorios ${t.renderCompensatorios.toFixed(0)} · ranking ${t.renderRanking.toFixed(0)} ms`);
    console.log(`  guardar novedad (con ~40 ms de red simulada por operación): ${t.guardarNovedad.toFixed(0)} ms · ${t.lecturasGuardado} lecturas, ${t.escriturasGuardado} escrituras · guardada=${t.guardada} · visible=${t.apareceEnNovedadesDelDia}`);
    console.log(`Gestión: carga ${r.gestion.carga} ms · renderAll ${r.gestion.renderAll.toFixed(0)} ms · logs ?perf=1: ${r.gestion.perfLogs.length}${r.gestion.perfLogs.length ? ' (ej: ' + r.gestion.perfLogs.slice(0, 3).join(' | ') + ')' : ''}`);
    console.log(`Asignación: filas mostrando zona sin tocar nada tras cargar: ${r.asignacion.zonasVisiblesSinTocar}`);
    for (const [k, h] of Object.entries(r.humo)) console.log(`  humo ${k}: ${h.extra || ''} ${h.errores.length ? 'ERRORES ' + JSON.stringify(h.errores) : 'sin errores'}`);
    const errs = [...r.asignacion.errores, ...r.novedades.errores, ...r.gestion.errores];
    console.log('  errores en páginas de personal:', errs.length ? JSON.stringify(errs) : 'ninguno');
  }
  console.log('\n=== MISMO HTML GENERADO (viejo vs nuevo)');
  const cmp = (n, a, b) => console.log(`  ${n}: ${a === b ? 'idéntico' : 'DISTINTO'} (${a.length} chars)`);
  cmp('asignación dist-body', res.viejo.asignacion.html.dist, res.nuevo.asignacion.html.dist);
  cmp('asignación dist-stats', res.viejo.asignacion.html.stats, res.nuevo.asignacion.html.stats);
  for (const id of Object.keys(res.viejo.novedades.html)) cmp('novedades ' + id, res.viejo.novedades.html[id], res.nuevo.novedades.html[id]);
  for (const id of Object.keys(res.viejo.gestion.html)) cmp('gestión ' + id, res.viejo.gestion.html[id], res.nuevo.gestion.html[id]);
})().catch(e => { console.error(e); process.exit(1); });
