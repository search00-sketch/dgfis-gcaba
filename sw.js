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
