# PWA Instalable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working "Instalar app" (PWA) flow to the portal: installable manifest, install-only service worker, solid-color icons, and an install button on `index.html`.

**Architecture:** Static PWA on top of the existing Firebase Hosting site — one `manifest.json` + one `sw.js` at the repo root (both served for the whole origin), three hand-generated solid-color PNG icons, and install-button wiring added only to `index.html`. No build step, no new dependencies — icon generation uses a small Node script that hand-encodes PNG bytes via the built-in `zlib` module only.

**Tech Stack:** Vanilla JS, Node (icon-generation script only, run once and committed), Firebase Hosting config.

## Global Constraints

- No new npm dependencies — the icon script must use only Node built-ins (`fs`, `path`, `zlib`).
- Service worker must NOT cache any page or Firestore data — `fetch` listener must not call `event.respondWith()`. This app runs on live Firestore data; a caching service worker risks showing stale content after a deploy.
- Icon fill color is `#1a3a5c` (the site's `--c-brand` token) — exact value, do not substitute.
- `manifest.json` `background_color` is `#f5f5f2` (the site's `--c-bg` token) — exact value.
- Install button and all new `<head>` links/meta go in `index.html` only — no other page changes in this plan.
- No automated test suite exists in this repo. Verification is `node --check` on new/changed JS, manual byte-level checks on generated PNGs, and (where possible) Chrome DevTools Application-tab inspection — this plan calls out explicitly which checks the agent can run itself vs. which need the user on a real device.

---

### Task 1: Icon generation script + generated PNGs

**Files:**
- Create: `scripts/generate-pwa-icons.js`
- Create (generated, not hand-written): `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`

**Interfaces:**
- Produces: three PNG files at `icons/icon-192.png` (192×192), `icons/icon-512.png` (512×512), `icons/apple-touch-icon.png` (180×180), each a flat `#1a3a5c` square, RGB color type, no alpha. Task 2 and Task 3 reference these exact paths.

- [ ] **Step 1: Write the icon generator script**

Create `scripts/generate-pwa-icons.js`:

```js
// Genera los íconos PWA como PNG de color sólido, sin depender de ninguna
// librería de imágenes (no hay ImageMagick/canvas/sharp disponibles en
// este entorno) — arma el PNG a mano: firma + chunks IHDR/IDAT/IEND, con
// la data de píxeles comprimida vía zlib.deflateSync (built-in de Node).
// Se corre una sola vez; los PNG resultantes se comitean al repo. Volver
// a correr este script si hace falta cambiar el color o el tamaño.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function solidColorPng(size, [r, g, b]) {
  const width = size, height = size;
  const bytesPerPixel = 3; // color type 2 = truecolor RGB, sin alpha
  const rowBytes = 1 + width * bytesPerPixel; // 1 byte de filtro + píxeles
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filtro "None"
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * bytesPerPixel;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idatData = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // profundidad de bit
  ihdr[9] = 2;  // tipo de color: RGB
  ihdr[10] = 0; // método de compresión
  ihdr[11] = 0; // método de filtro
  ihdr[12] = 0; // entrelazado

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BRAND_COLOR = [0x1a, 0x3a, 0x5c]; // --c-brand del sitio
const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  const png = solidColorPng(size, BRAND_COLOR);
  fs.writeFileSync(path.join(outDir, file), png);
  console.log('wrote', file, png.length, 'bytes');
}
```

- [ ] **Step 2: Verify the script's syntax**

Run: `node --check scripts/generate-pwa-icons.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Run the generator**

Run: `node scripts/generate-pwa-icons.js`
Expected output:
```
wrote icon-192.png 439 bytes
wrote icon-512.png 439 bytes
wrote apple-touch-icon.png 439 bytes
```
(Exact byte counts may differ slightly — a solid color compresses to nearly the same size regardless of square dimensions, since deflate collapses the repeated rows almost entirely. What matters: three files listed, non-zero byte counts, no errors.)

- [ ] **Step 4: Verify each PNG's signature and declared dimensions**

Run this one-off check (no need to keep it as a file):

```bash
node -e "
const fs = require('fs');
for (const [file, expectSize] of [['icons/icon-192.png',192],['icons/icon-512.png',512],['icons/apple-touch-icon.png',180]]) {
  const buf = fs.readFileSync(file);
  const sig = buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  console.log(file, 'signature ok:', sig, 'size:', width+'x'+height, 'expected:', expectSize+'x'+expectSize);
  if (!sig || width !== expectSize || height !== expectSize) throw new Error('bad PNG: ' + file);
}
console.log('all icons valid');
"
```
Expected: `signature ok: true` for all three, sizes matching, and a final `all icons valid` line. This is a real structural verification (PNG signature + IHDR width/height), not just "the file exists" — it's the closest this environment can get to confirming the icons are well-formed without being able to visually render them.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-pwa-icons.js icons/icon-192.png icons/icon-512.png icons/apple-touch-icon.png
git commit -m "PWA: generar íconos de color sólido (sin librerías de imagen)"
```

---

### Task 2: manifest.json, sw.js, firebase.json

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: `icons/icon-192.png`, `icons/icon-512.png` from Task 1 (referenced by path in `manifest.json`).
- Produces: `/manifest.json` and `/sw.js` at the site root, referenced by `index.html` in Task 3.

- [ ] **Step 1: Create manifest.json**

Create `manifest.json` at the repo root:

```json
{
  "name": "DGFIS-GCABA",
  "short_name": "DGFIS-GCABA",
  "description": "Portal de herramientas internas — DGFIS-GCABA",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f5f5f2",
  "theme_color": "#1a3a5c",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Verify manifest.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 3: Create sw.js**

Create `sw.js` at the repo root:

```js
// Service worker mínimo: existe únicamente para cumplir el requisito de
// instalabilidad de Chrome (manifest válido + service worker con un
// listener de "fetch" registrado). El listener no llama a
// event.respondWith(), así que el navegador sigue haciendo la petición de
// red normal sin ninguna intervención — a propósito no cachea nada: el
// sitio corre sobre datos Firestore en vivo (nómina, actas, permisos), y
// un caché mal invalidado podría mostrar una versión vieja de la página
// después de un deploy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
```

- [ ] **Step 4: Verify sw.js syntax**

Run: `node --check sw.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Add a no-cache header rule for sw.js in firebase.json**

Read the current `firebase.json` first — it already has one `headers` entry (for `estilo-comun.css`/`utils.js`/etc. with a 1-hour cache). Add a second entry to the same `headers` array, immediately after the existing one, so `hosting.headers` becomes:

```json
    "headers": [
      {
        "source": "/{estilo-comun.css,utils.js,personal-nav.js,personal-auth.js,personal-dominio.js,personal-datos.js}",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=3600" }
        ]
      },
      {
        "source": "/sw.js",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      }
    ]
```

Do not change anything else in `firebase.json` — `hosting.ignore` already allows root-level files through (it only excludes dotfiles, `docs/**`, `migration-scripts/**`, and a short named list), so `manifest.json`, `sw.js`, and `icons/**` deploy automatically without any change there.

- [ ] **Step 6: Verify firebase.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 7: Commit**

```bash
git add manifest.json sw.js firebase.json
git commit -m "PWA: manifest.json, service worker mínimo, header no-cache para sw.js"
```

---

### Task 3: Wire the install button into index.html

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `/manifest.json` and `/sw.js` from Task 2; `/icons/apple-touch-icon.png` from Task 1.

- [ ] **Step 1: Add manifest/icon/meta links to `<head>`**

In `index.html`, find this line near the top of `<head>` (currently the last line before `<style>`):

```html
<link rel="stylesheet" href="estilo-comun.css?v=14">
```

Add these lines immediately after it (before `<style>`):

```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#1a3a5c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="DGFIS-GCABA">
```

- [ ] **Step 2: Add the install button inside `.welcome`**

Find this block:

```html
  <!-- Bienvenida -->
  <div class="welcome">
    <h2 id="welcomeTitle">Bienvenido</h2>
    <p id="welcomeSub">Seleccioná un módulo para comenzar.</p>
  </div>
```

Replace it with:

```html
  <!-- Bienvenida -->
  <div class="welcome">
    <h2 id="welcomeTitle">Bienvenido</h2>
    <p id="welcomeSub">Seleccioná un módulo para comenzar.</p>
    <button id="pwaInstallBtn" class="btn btn-azul" style="display:none;margin-top:10px" onclick="instalarPWA()">📲 Instalar app</button>
  </div>
```

- [ ] **Step 3: Add the install/service-worker JS**

Find the `<script type="module">` block in `index.html` (it starts with the Firebase imports). Immediately BEFORE that `<script type="module">` tag, add a new plain (non-module) script block:

```html
<script>
// Botón de instalar como app (PWA). beforeinstallprompt sólo existe en
// Chrome/Edge/Android — en iOS Safari y Firefox de escritorio el botón
// simplemente no aparece nunca (no es un bug: esas plataformas no
// permiten disparar el flujo de instalación por código). En iOS, una vez
// que el manifest + apple-touch-icon están enlazados, el usuario puede
// instalar igual a mano desde Compartir → "Agregar a inicio".
let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'inline-flex';
});

async function instalarPWA() {
  if (!deferredPwaPrompt) return;
  deferredPwaPrompt.prompt();
  await deferredPwaPrompt.userChoice;
  deferredPwaPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
}

window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
</script>
```

- [ ] **Step 4: Verify index.html's scripts still parse**

Run (from the repo root, using the existing scratchpad extraction helper used throughout this project's mobile work — or equivalent): extract each `<script>`/`<script type="module">` block from `index.html` into temp files and run `node --check` on each. Expected: every block passes with no syntax errors, including the new plain `<script>` block added in Step 3.

If no extraction helper is available in the environment, a minimal inline equivalent:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const re = /<script(?:\s+type=\"module\")?>([\s\S]*?)<\/script>/g;
let m, i = 0, failed = false;
while ((m = re.exec(html))) {
  i++;
  const code = m[1];
  if (!code.trim()) continue;
  fs.writeFileSync('/tmp/_idx_chk' + i + '.js', code);
}
console.log('extracted', i, 'blocks');
"
for f in /tmp/_idx_chk*.js; do node --check "$f" && echo "OK: $f"; done
rm -f /tmp/_idx_chk*.js
```

(On Windows/Git Bash, use the project's existing scratchpad temp directory instead of `/tmp` if `/tmp` is not writable.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "PWA: botón de instalar app en index.html"
```

---

## Manual verification (after all tasks, cannot be done from this environment)

After deploying, ask the user to check on a real Android phone with Chrome:
1. Open the portal, log in, confirm the "📲 Instalar app" button appears under "Bienvenido".
2. Tap it, confirm the native install prompt appears and installing works.
3. Confirm the installed app icon is a solid navy square, opens in standalone mode (no browser address bar), and normal navigation between modules still works from inside it.

On iOS, confirm that Compartir → "Agregar a inicio" produces a reasonable icon (the navy square) rather than a broken/blank one.
