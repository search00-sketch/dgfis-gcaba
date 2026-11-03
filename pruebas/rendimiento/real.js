// Pruebas en Chromium contra el Firestore REAL. Sólo lectura: toda escritura
// a Firestore se bloquea a nivel de red (y se cuenta, para reportarla).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const LIBS = path.join(__dirname, '.libs');
const LIBMAP = {
  'xlsx.full.min.js': 'xlsx-0.18.5/package/dist/xlsx.full.min.js', 'leaflet.js': 'leaflet-1.9.4/package/dist/leaflet.js', 'leaflet.css': 'leaflet-1.9.4/package/dist/leaflet.css',
  'leaflet-heat.js': 'leaflet.heat-0.2.0/package/dist/leaflet-heat.js', 'chart.umd.min.js': 'chart.js-4.4.0/package/dist/chart.umd.js',
  'leaflet.markercluster.js': 'leaflet.markercluster-1.5.3/package/dist/leaflet.markercluster.js', 'jszip.min.js': 'jszip-3.10.1/package/dist/jszip.min.js',
};
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const ORIGEN = 'dgfis-gcaba.web.app';
const ESCRITURA = /google\.firestore\.v1\.Firestore\/(Write|Commit|BatchWrite)|:commit|:batchWrite/;
async function nuevoCtx(browser, dir) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Argentina/Buenos_Aires' });
  ctx._bloqueadas = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (ESCRITURA.test(req.url())) { ctx._bloqueadas.push(req.url().slice(0, 120)); return route.abort(); }
    if (u.host === ORIGEN) {
      const f = path.join(dir, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'cache-control': 'no-store' } });
      return route.fulfill({ status: 404, body: '' });
    }
    // App Check: reCAPTCHA está bloqueado en este contenedor y Firestore se
    // quedaría esperando el token. La base no lo exige, así que sólo para la
    // prueba se reemplaza por un módulo vacío (único desvío de producción).
    if (u.host === 'www.gstatic.com' && u.pathname.endsWith('/firebase-app-check.js'))
      return route.fulfill({ body: 'export function initializeAppCheck(){} export class ReCaptchaV3Provider{}', contentType: 'application/javascript' });
    if (u.host === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/10.12.0/')) {
      const f = path.join(LIBS, 'firebase/package', path.basename(u.pathname));
      if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' });
    }
    const base = path.basename(u.pathname);
    if (LIBMAP[base] && /cdnjs|unpkg|jsdelivr/.test(u.host)) return route.fulfill({ body: fs.readFileSync(path.join(LIBS, LIBMAP[base])), contentType: MIME[path.extname(base)] });
    if (/googleapis\.com$/.test(u.host)) return route.continue(); // Firestore / Auth reales
    return route.abort(); // tiles, reCAPTCHA, etc.
  });
  return ctx;
}
async function abrir(ctx, pagina) {
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|AppCheck|appCheck|recaptcha/i.test(m.text())) errores.push('console: ' + m.text().slice(0, 200)); });
  await page.goto('https://' + ORIGEN + '/' + pagina);
  return { page, errores };
}
module.exports = { nuevoCtx, abrir, ESCRITURA };
if (require.main === module) (async () => {
  const [oldDir, newDir] = process.argv.slice(2);
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const res = {};
  for (const [n, dir] of [['viejo', oldDir], ['nuevo', newDir]]) {
    const ctx = await nuevoCtx(browser, dir);
    const { page, errores } = await abrir(ctx, 'buscador_permisos.html');
    const t0 = Date.now();
    await page.waitForFunction(() => (window.DB || []).length > 0, null, { timeout: 60000 });
    const carga = Date.now() - t0;
    const r = await page.evaluate(async () => {
      const fr = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      const out = { registros: window.DB.length, status: document.getElementById('dbStatus')?.textContent || document.querySelector('.dpill')?.textContent };
      // Búsquedas reales: primeras letras de un nombre/DNI que existan en la base
      const r0 = window.DB[Math.floor(window.DB.length / 2)];
      const casos = [['qN', (r0.nombre || '').split(' ')[0].slice(0, 4)], ['qD', String(r0.dni || '').slice(0, 4)], ['qL', (r0.locacion || r0.barrio || '').slice(0, 5)]];
      out.busquedas = [];
      for (const [id, q] of casos) {
        ['qN', 'qD', 'qL', 'qE'].forEach(i => document.getElementById(i).value = '');
        document.getElementById(id).value = q;
        const t0 = performance.now(); doSearch(); await fr();
        out.busquedas.push({ campo: id, largo: q.length, ms: +(performance.now() - t0).toFixed(1), resultados: curRes.length });
      }
      return out;
    });
    res[n] = { carga, ...r, errores, bloqueadas: ctx._bloqueadas.length };
    await ctx.close();
  }
  await browser.close();
  for (const [n, r] of Object.entries(res)) console.log(n.padEnd(6), JSON.stringify(r));
  const mismos = JSON.stringify(res.viejo.busquedas.map(b => b.resultados)) === JSON.stringify(res.nuevo.busquedas.map(b => b.resultados));
  console.log('mismos resultados de búsqueda viejo/nuevo:', mismos);
})().catch(e => { console.error(e); process.exit(1); });
