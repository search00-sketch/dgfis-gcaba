# PWA: botón "Instalar app" para el portal

**Fecha:** 2026-09-02
**Páginas afectadas:** `index.html` (única página que suma código nuevo),
`firebase.json`. Nuevos archivos: `manifest.json`, `sw.js`,
`icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`,
`scripts/generate-pwa-icons.js`.
**Depende de:** todo el trabajo de mobile-responsive ya hecho (specs
`2026-09-01-mobile-*`) — se hace al final a propósito, según lo acordado
con el usuario, para no ofrecer instalar como app algo que todavía no se
veía bien en pantallas chicas.

## Contexto

Último pedido pendiente del hilo original de este proyecto: "me gustaria
aregar la opcion de un boton de convertir en aplicacion para celular".
Con las 7 páginas ya adaptadas a mobile, este es el sub-proyecto final.

El sitio es un portal de Firebase Hosting (estático, sin build step) con 7
páginas HTML independientes bajo un mismo origen, respaldadas por datos
Firestore que cambian todo el tiempo (nómina, actas, permisos,
relevamientos). Este contexto — datos vivos, no un sitio de contenido
estático — condiciona la decisión más importante del diseño: qué tan lejos
llega el service worker.

Este entorno de trabajo no tiene herramientas de renderizado de imágenes
(sin ImageMagick, sin navegador headless, sin librerías canvas/sharp de
Node) — se investigó y confirmó antes de este diseño. Por eso el ícono se
resuelve con un cuadrado de color sólido generado a mano (ver más abajo),
en vez de un logo real.

## Objetivo

Que cualquiera de los 7 usuarios pueda instalar el portal como app desde
Chrome/Edge/Android (botón explícito) o desde iOS Safari (flujo nativo
"Agregar a inicio", una vez que exista un manifest + íconos válidos) —
sin agregar cacheo de páginas o datos que pueda mostrar información vieja
después de un deploy.

## Alcance

- Un manifest único para todo el sitio (un solo origen, una sola "app").
- Un service worker mínimo, sólo para cumplir el requisito de
  instalabilidad de Chrome — sin estrategia de cacheo real.
- Botón "📲 Instalar app" en `index.html` únicamente (la puerta de
  entrada del portal).
- Íconos: un cuadrado de color sólido (navy `#1a3a5c`, el mismo
  `--c-brand` del sitio) en 3 tamaños.
- Ajuste a `firebase.json` para que `sw.js` nunca quede cacheado de forma
  agresiva.

## Fuera de alcance

- Soporte offline real (páginas o datos cacheados) — riesgo real de
  mostrar información vieja en un sitio con datos Firestore que cambian
  todo el tiempo; no fue pedido explícitamente, así que no se construye.
- Notificaciones push, sync en segundo plano, o cualquier otra capacidad
  de service worker más allá de la instalabilidad.
- Ícono con logo real — el usuario puede pasar un PNG propio (escudo de
  GCABA/DGFIS) más adelante para reemplazar el cuadrado de color sólido;
  no bloquea este sub-proyecto.
- Botón de instalar en las otras 6 páginas — `index.html` es la única
  entrada; una vez instalada, la app abre siempre ahí (`start_url`) y el
  resto de la navegación ya funciona igual que hoy dentro de la ventana
  standalone.

## Diseño

### manifest.json

Un solo archivo en la raíz del sitio, enlazado sólo desde `index.html`:

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

`background_color` usa `--c-bg` (el fondo real del sitio) para que la
pantalla de carga no "salte" de color al terminar de cargar. El ícono de
512px se reutiliza también como `maskable`: al ser un color sólido sin
ningún detalle, cualquier recorte (círculo, squircle, etc.) que apliquen
Android/el launcher lo deja igual de bien, no hace falta un archivo aparte
con relleno de seguridad.

### Íconos: generación sin librerías de imagen

`scripts/generate-pwa-icons.js` (Node, sin dependencias externas) arma a
mano un PNG válido — firma PNG + chunks IHDR/IDAT/IEND, con la data cruda
de píxeles comprimida vía `zlib.deflateSync` (built-in de Node, no hace
falta ninguna librería externa). Para un color sólido sin ningún detalle
esto es explícitamente viable a mano: cada fila es un byte de filtro (0)
más N píxeles del mismo RGB.

Se corre una vez para generar los 3 archivos (192, 512, y 180 para
`apple-touch-icon`) y se comitean los PNG resultantes — el script queda en
el repo por si más adelante hace falta regenerar con otro color, no se
ejecuta en cada deploy.

### Service worker: sólo instalabilidad, sin cacheo

`sw.js` en la raíz:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
```

El listener de `fetch` no llama a `event.respondWith()` — el navegador
sigue haciendo la petición de red normal, sin ninguna intervención. Existe
únicamente porque Chrome exige un service worker con un listener de
`fetch` registrado como parte de sus criterios de instalabilidad; no cachea
nada a propósito. Esto es deliberado dado el contexto: un caché mal
invalidado en un sitio con datos Firestore en vivo (nómina, nuevas actas,
permisos actualizados) podría mostrarle a alguien una versión vieja de la
página después de un deploy — un riesgo peor que no tener soporte offline.

Registro (agregado al script existente de `index.html`):

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
```

### Botón "Instalar app"

Sólo en `index.html`. Va dentro de `.welcome` (la sección "Bienvenido /
Seleccioná un módulo para comenzar"), justo debajo de `#welcomeSub` y
antes de `.mgrid` — visible para cualquiera apenas entra al portal, sin
competir con los botones funcionales del header (que ya está bastante
ocupado en mobile: usuario, cambiar contraseña, salir). Oculto por
defecto:

```html
<div class="welcome">
  <h2 id="welcomeTitle">Bienvenido</h2>
  <p id="welcomeSub">Seleccioná un módulo para comenzar.</p>
  <button id="pwaInstallBtn" class="btn btn-azul" style="display:none;margin-top:10px" onclick="instalarPWA()">📲 Instalar app</button>
</div>
```

JS:

```js
let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  document.getElementById('pwaInstallBtn').style.display = 'inline-flex';
});

async function instalarPWA() {
  if (!deferredPwaPrompt) return;
  deferredPwaPrompt.prompt();
  await deferredPwaPrompt.userChoice;
  deferredPwaPrompt = null;
  document.getElementById('pwaInstallBtn').style.display = 'none';
}

window.addEventListener('appinstalled', () => {
  document.getElementById('pwaInstallBtn').style.display = 'none';
});
```

`beforeinstallprompt` no existe en iOS Safari ni en Firefox de escritorio
— en esos navegadores el botón simplemente nunca aparece (no es un bug,
es la limitación real de esas plataformas). En iOS, una vez que el
manifest + `apple-touch-icon` están enlazados, el usuario igual puede
instalar la app a mano desde Compartir → "Agregar a inicio" — no hay forma
de ofrecer un botón equivalente ahí, ninguna web app puede disparar ese
flujo por código en iOS.

`<head>` de `index.html` suma:

```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#1a3a5c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="DGFIS-GCABA">
```

### firebase.json

Se agrega una regla de headers para que `sw.js` nunca quede cacheado por
un proxy/CDN intermedio (los navegadores ya tienen su propia lógica de
re-chequeo de service workers, pero esto evita que algo en el medio lo
retenga):

```json
{
  "source": "/sw.js",
  "headers": [
    { "key": "Cache-Control", "value": "no-cache" }
  ]
}
```

## Testing

No hay suite de tests automatizados en este repo. Verificación:
- `node --check` sobre `sw.js` y `scripts/generate-pwa-icons.js`.
- Correr el generador de íconos y confirmar que los 3 PNG son válidos
  (abrir con una herramienta que los pueda leer, o al menos validar la
  firma/dimensiones vía un script de verificación corto).
- Chrome DevTools → pestaña Application → Manifest: sin errores, los 3
  criterios de instalabilidad en verde.
- Verificación manual del usuario en un celular real: aparece el botón en
  Chrome/Android, se puede instalar, el ícono se ve como un cuadrado navy
  en la pantalla de inicio, y la app abre en modo standalone (sin barra de
  navegador). No es posible probar esto desde este entorno.
