# Migración de login a Firebase Authentication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el login casero (SHA-256 sin sal, verificado en el navegador contra `usuarios/{username}` legible por cualquiera) por Firebase Authentication, y cerrar `firestore.rules` para que cada colección exija estar logueado y tener el módulo/rol correspondiente — manteniendo la experiencia de "usuario + contraseña" y sin agregar Cloud Functions ni pasar a plan pago.

**Architecture:** Un módulo compartido (`personal-auth.js`, classic script) implementa el login contra Firebase Authentication y lo usan las 6 páginas. El "usuario" que la gente tipea se resuelve a un email real vía una colección pública mínima `login_lookup/{username}→{email}` antes de llamar a `signInWithEmailAndPassword`. El perfil (rol/módulos/permisos) vive en `usuarios/{uid}` (antes `usuarios/{username}`). Las reglas de Firestore nuevas usan `get()`/`exists()` sobre ese documento para autorizar cada colección — sin Cloud Functions, sin custom claims. Un script Admin SDK de un solo uso migra las cuentas existentes preservando su contraseña (hash SHA-256 importado tal cual).

**Tech Stack:** HTML/JS estático (sin build), Firebase Hosting + Firestore + Authentication (Email/Password) en plan Spark, Firebase Admin SDK (Node.js, sólo para el script de migración, no se despliega).

## Global Constraints

- No se agregan Cloud Functions ni se pasa al plan Blaze (decisión explícita del spec).
- No se toca el contenido de nómina, novedades, actas, permisos, relevamientos, ni sus esquemas de datos.
- No se cambia el modelo `role` (`'admin'|'viewer'`) / `modulos` (array de ids) / `permisos` (`{moduloId:'viewer'|'editor'}`).
- `permisos_chunks`/`permisos_meta` deben seguir siendo de lectura pública sin login (comportamiento actual e intencional del buscador — ver Task 6): sólo la carga (escritura) pasa a exigir admin logueado.
- Cada publicación a Firebase Hosting o a `firestore.rules` (Tasks 9, 11, 12) se confirma con el usuario antes de ejecutarse — no se hace sin avisar primero.
- Spec de referencia: `docs/superpowers/specs/2026-08-26-firebase-auth-migration-design.md`.

---

## Task 1: Reglas de Firestore nuevas

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: colecciones `login_lookup/{username}` (`{email}`) y `usuarios/{uid}` (`{username, nombre, email, role, modulos, permisos}`) — el resto de las tareas asumen este esquema al leer/escribir perfiles.

No hay tests automatizados en este repo (sitio estático sin build ni framework de test); la verificación de reglas se hace manualmente contra el Simulador de Reglas de la consola de Firebase en la Task 11, después de correr la migración real — desplegar esto ahora no tiene efecto porque `firebase deploy --only firestore:rules` no se ejecuta hasta esa tarea.

- [ ] **Step 1: Reemplazar el contenido completo de `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---- Helpers de identidad ------------------------------------------
    function logueado() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/usuarios/$(request.auth.uid));
    }
    function perfil() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
    }
    function esAdmin() {
      return logueado() && perfil().role == 'admin';
    }
    function tieneModulo(modulo) {
      return esAdmin() ||
        (logueado() && ('modulos' in perfil()) && modulo in perfil().modulos);
    }
    function puedeEditar(modulo) {
      return esAdmin() ||
        (tieneModulo(modulo) &&
         (!('permisos' in perfil()) || !(modulo in perfil().permisos) ||
          perfil().permisos[modulo] != 'viewer'));
    }
    // Acceso de lectura compartido por Gestión de Personal, Novedades y
    // Asignación de Zonas: las tres leen nómina/novedades/distribuciones/
    // personal_config aunque sólo una sea "su" módulo (mismo comportamiento
    // que hoy tiene el cliente, ver cargarTodo() en personal-datos.js).
    function tieneAlgunModuloPersonal() {
      return tieneModulo('personal') || tieneModulo('novedades') || tieneModulo('asignacion');
    }

    // ---- Login: usuario -> email, antes de autenticarse -----------------
    // Sólo expone un email por nombre de usuario, nada más (no nombre, no
    // rol, no contraseña). Hace falta que sea pública para poder resolver
    // "usuario" a un email real antes de llamar a signInWithEmailAndPassword.
    match /login_lookup/{username} {
      allow read: if true;
      allow write: if esAdmin();
    }

    // ---- Perfiles de usuario ---------------------------------------------
    // Cada quien puede leer su propio perfil (para validar su sesión al
    // entrar); el admin puede leer y escribir cualquiera. Nadie más que el
    // admin puede escribir (ni siquiera el dueño del perfil: cambiar el
    // rol/módulos propios pasa siempre por el panel admin).
    match /usuarios/{uid} {
      allow read: if logueado() && (request.auth.uid == uid || esAdmin());
      allow write: if esAdmin();
    }

    // ---- Permisos: lectura pública (buscador interno, diseño original
    // del proyecto: cualquiera puede buscar, sólo admin puede cargar) -----
    match /permisos_chunks/{doc} { allow read: if true; allow write: if esAdmin(); }
    match /permisos_meta/{doc}   { allow read: if true; allow write: if esAdmin(); }

    // ---- Estadísticas de actas --------------------------------------------
    match /actas_chunks/{doc} { allow read: if tieneModulo('estadisticas'); allow write: if puedeEditar('estadisticas'); }
    match /actas_meta/{doc}   { allow read: if tieneModulo('estadisticas'); allow write: if puedeEditar('estadisticas'); }

    // ---- Config compartida por personal/novedades/asignación ------------
    match /personal_config/{doc} {
      allow read:  if tieneAlgunModuloPersonal();
      allow write: if puedeEditar('asignacion') || puedeEditar('novedades');
    }

    // ---- Relevamientos operativos ------------------------------------------
    match /relevamientos_chunks/{doc} { allow read: if tieneModulo('relevamientos'); allow write: if puedeEditar('relevamientos'); }
    match /relevamientos_meta/{doc}   { allow read: if tieneModulo('relevamientos'); allow write: if puedeEditar('relevamientos'); }
    match /relevamientos_config/{doc} { allow read: if tieneModulo('relevamientos'); allow write: if puedeEditar('relevamientos'); }

    // ---- Nómina (Gestión de Personal edita; Novedades/Asignación leen) --
    match /nomina_chunks/{doc} { allow read: if tieneAlgunModuloPersonal(); allow write: if puedeEditar('personal'); }
    match /nomina_meta/{doc}   { allow read: if tieneAlgunModuloPersonal(); allow write: if puedeEditar('personal'); }

    // ---- Novedades (Novedades de Personal edita; Personal/Asignación leen)
    match /novedades_chunks/{doc} { allow read: if tieneAlgunModuloPersonal(); allow write: if puedeEditar('novedades'); }
    match /novedades_meta/{doc}   { allow read: if tieneAlgunModuloPersonal(); allow write: if puedeEditar('novedades'); }

    // ---- Distribución diaria por zona (Asignación edita) -----------------
    match /distribuciones/{fecha} {
      allow read:  if tieneAlgunModuloPersonal();
      allow write: if puedeEditar('asignacion');
      match /asignaciones/{personaId} {
        allow read:  if tieneAlgunModuloPersonal();
        allow write: if puedeEditar('asignacion');
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "Reglas de Firestore: RBAC por perfil logueado (no se despliega todavía)"
```

---

## Task 2: Script de migración de usuarios (Admin SDK, un solo uso)

**Files:**
- Create: `migration-scripts/package.json`
- Create: `migration-scripts/migrar-usuarios.js`
- Modify: `.gitignore`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: colección vieja `usuarios/{username}` (`{nombre, role, passHash, modulos, permisos}`), archivo local `migration-scripts/usuarios-email.json` (`{ "username": "email@real.com", ... }`, no se commitea).
- Produces: cuentas en Firebase Authentication + `usuarios/{uid}` + `login_lookup/{username}` — mismo esquema que consume Task 1.

- [ ] **Step 1: Excluir del deploy de Hosting y de git lo que no debe publicarse ni commitearse**

En `.gitignore`, agregar al final:

```
# Migración de usuarios a Firebase Auth (script de un solo uso)
migration-scripts/service-account-key.json
migration-scripts/usuarios-email.json
migration-scripts/node_modules
```

En `firebase.json`, agregar `"migration-scripts/**"` al array `hosting.ignore` (junto a `"docs/**"`):

```json
    "ignore": [
      "firebase.json",
      "firestore.rules",
      ".env",
      ".env.example",
      "generate-config.js",
      "README.md",
      ".gitignore",
      "node_modules",
      "**/.*",
      "**/.*/**",
      "docs/**",
      "migration-scripts/**"
    ],
```

- [ ] **Step 2: Crear `migration-scripts/package.json`**

```json
{
  "name": "dgfis-gcaba-migracion-usuarios",
  "private": true,
  "version": "1.0.0",
  "description": "Script de un solo uso para migrar usuarios de Firestore a Firebase Authentication. No se despliega (ver firebase.json hosting.ignore).",
  "dependencies": {
    "firebase-admin": "^12.0.0"
  }
}
```

- [ ] **Step 3: Crear `migration-scripts/migrar-usuarios.js`**

```js
#!/usr/bin/env node
// migration-scripts/migrar-usuarios.js
//
// Script de un solo uso: migra las cuentas de la colección Firestore vieja
// "usuarios" (doc id = username, con passHash SHA-256 sin sal) a Firebase
// Authentication, preservando la contraseña actual, y escribe el esquema
// nuevo: usuarios/{uid} (perfil) + login_lookup/{username} (email, para
// poder resolver "usuario" -> email antes de loguearse). No modifica ni
// borra ningún documento de la colección vieja.
//
// Uso:
//   1. Poner la clave de cuenta de servicio en
//      migration-scripts/service-account-key.json (Firebase Console ->
//      Project Settings -> Service Accounts -> Generate new private key).
//   2. Completar migration-scripts/usuarios-email.json:
//      { "srepetto": "sofia.repetto@ejemplo.gob.ar", ... }
//      con TODOS los usuarios que existen hoy en el panel admin.
//   3. cd migration-scripts && npm install
//   4. Probar con un solo usuario de prueba primero:
//        node migrar-usuarios.js --solo=usuario_de_prueba
//   5. Migración real, todos los usuarios:
//        node migrar-usuarios.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
const emailsPath = path.join(__dirname, 'usuarios-email.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Falta migration-scripts/service-account-key.json (clave de cuenta de servicio).');
  process.exit(1);
}
if (!fs.existsSync(emailsPath)) {
  console.error('Falta migration-scripts/usuarios-email.json con el mapeo usuario -> email real.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
const emails = JSON.parse(fs.readFileSync(emailsPath, 'utf8'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const soloArg = process.argv.find(a => a.startsWith('--solo='));
const soloUsuario = soloArg ? soloArg.split('=')[1] : null;

async function migrarUsuario(username, datos) {
  const email = emails[username];
  if (!email) {
    console.error(`⚠️  ${username}: no tiene email en usuarios-email.json — se salteó.`);
    return;
  }
  if (!datos.passHash || typeof datos.passHash !== 'string') {
    console.error(`⚠️  ${username}: no tiene passHash válido — se salteó.`);
    return;
  }

  let uid;
  try {
    const existente = await auth.getUserByEmail(email);
    uid = existente.uid;
    console.log(`↷ ${username}: ya existe en Authentication (uid=${uid}); no se reimporta el hash.`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    uid = crypto.randomUUID();
    const resultado = await auth.importUsers([{
      uid,
      email,
      passwordHash: Buffer.from(datos.passHash, 'hex'),
      displayName: datos.nombre || username,
    }], {
      // SHA256 de una sola pasada, sin sal: exactamente como sha256() lo
      // calcula hoy en el navegador (utils.js / personal-auth.js). Si
      // Firebase rechaza este algoritmo/config al correr esto, hay que
      // ajustar acá antes de tocar cuentas reales — por eso el paso 4 del
      // encabezado pide probar primero con un usuario de prueba.
      hash: { algorithm: 'SHA256', rounds: 1 },
    });
    if (resultado.failureCount > 0) {
      console.error(`❌ ${username}: falló la importación:`, JSON.stringify(resultado.errors));
      return;
    }
    console.log(`✅ ${username}: importado a Authentication (uid=${uid}).`);
  }

  await db.collection('usuarios').doc(uid).set({
    username,
    nombre: datos.nombre || username,
    email,
    role: datos.role || 'viewer',
    modulos: datos.modulos || [],
    permisos: datos.permisos || {},
  }, { merge: true });

  await db.collection('login_lookup').doc(username).set({ email }, { merge: true });

  console.log(`   → perfil escrito en usuarios/${uid} y login_lookup/${username}.`);
}

async function main() {
  const snap = await db.collection('usuarios').get();
  console.log(`Encontrados ${snap.size} documentos en la colección vieja "usuarios".`);
  for (const d of snap.docs) {
    const username = d.id;
    if (soloUsuario && username !== soloUsuario) continue;
    const datos = d.data();
    // Heurística para no reprocesar por error un doc que ya es del esquema
    // nuevo si este script se corre más de una vez: los docs viejos siempre
    // tienen passHash, los nuevos (doc id = uid) no.
    if (!datos.passHash) { console.log(`↷ ${username}: sin passHash (¿ya migrado?) — se salteó.`); continue; }
    await migrarUsuario(username, datos);
  }
  console.log('Listo.');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Commit (sin la clave de servicio ni el archivo de emails — están gitignoreados)**

```bash
git add migration-scripts/package.json migration-scripts/migrar-usuarios.js .gitignore firebase.json
git status
```

Verificar en la salida de `git status` que `migration-scripts/service-account-key.json` y `migration-scripts/usuarios-email.json` NO aparecen como "Changes to be committed" (deben estar ignorados). Recién entonces:

```bash
git commit -m "Agregar script de migración de usuarios a Firebase Authentication"
```

---

## Task 3: Reescribir `personal-auth.js` para usar Firebase Authentication

**Files:**
- Modify: `personal-auth.js`

**Interfaces:**
- Consumes (expuesto por el `<script type="module">` de cada página, ver Tasks 4-7): `window._auth`, `window._fOnAuthStateChanged(auth, cb)`, `window._fSignIn(auth, email, pass)`, `window._fSignOut(auth)`, `window._fEmailAuthProvider` (objeto con `.credential(email, pass)`), `window._fReauthenticate(user, cred)`, `window._fUpdatePassword(user, newPass)`; además de los ya existentes `window._db`, `window._fDoc`, `window._fGetDoc`.
- Consumes (seteado por cada página antes de cargar este script): `window.MODULO_ID` (string o `undefined`/`null`), `window.LOGIN_REQUERIDO` (`false` sólo en `buscador_permisos.html`; cualquier otro valor o `undefined` = `true`).
- Produces (igual que la versión vieja, sin cambios de firma): `usuarioActual()`, `puedeEditar()`, `actualizarPermisoUI()`, `togglePass()`, `restaurarSesion()` (devuelve una Promise), `doLogin()`, `doLogout()`, `abrirModalCambiarPass()`, `guardarCambioPassPropia()`. Nuevo: llama a `window._onLogin(loggedUser)` igual que antes, y además, si existe, a `window.cargarTodo` / `window.initRelevamientos` / `window.cargarDatos` cuando un login ocurre DESPUÉS de la carga inicial de la página (ver Step 1).

No hay test runner en el repo — la verificación de este archivo es manual y ocurre en Tasks 4-8 (cada página que lo usa) y en la Task 9 (prueba end-to-end contra Firebase real).

- [ ] **Step 1: Reemplazar el contenido completo de `personal-auth.js`**

```js
// ============================================================
//  AUTH — compartido por las 6 páginas del portal.
//  Usa Firebase Authentication (Email/Password) por debajo, pero la UI
//  sigue pidiendo "usuario" + "contraseña": antes de loguearse, resuelve el
//  usuario a su email real vía la colección pública login_lookup.
//
//  Cada página debe, ANTES de cargar este archivo:
//    - setear window.MODULO_ID ('personal'/'novedades'/'asignacion'/
//      'relevamientos'/'estadisticas'), o no setearlo si la página no
//      exige un módulo específico (index.html — el portal).
//    - opcionalmente setear window.LOGIN_REQUERIDO = false si la página
//      debe poder verse SIN loguearse (hoy sólo buscador_permisos.html: la
//      búsqueda es pública, sólo la carga exige admin logueado).
//  Y, DESPUÉS de que su <script type="module"> exponga window._db/_auth/
//  _f*, debe llamar a window.restaurarSesion() (opcionalmente encadenando
//  .then(...) con su función de carga de datos para la carga inicial).
//  Firebase Authentication persiste la sesión solo — no hace falta ningún
//  cacheo manual en localStorage como en la versión vieja.
// ============================================================
const MODULO_ID = window.MODULO_ID || null;
const LOGIN_REQUERIDO = window.LOGIN_REQUERIDO !== false;
let loggedUser = null;
window._soloLectura = false;

function usuarioActual(){
  return loggedUser ? {username:loggedUser.username, nombre:loggedUser.nombre} : null;
}
function puedeEditar(){
  return !!loggedUser && (loggedUser.role==="admin" || !(loggedUser.permisos&&loggedUser.permisos[MODULO_ID]==="viewer"));
}
function actualizarPermisoUI(){
  window._soloLectura = !puedeEditar();
  const badge=document.getElementById("userBadge");
  if(badge && window._soloLectura && !/sólo lectura/.test(badge.textContent)) badge.textContent += " (🔒 sólo lectura)";
}
function togglePass(){const i=document.getElementById("lPass");if(i)i.type=i.type==="password"?"text":"password";}

// Vuelve a disparar la carga de datos de la página después de un login
// interactivo (no hace falta en la carga inicial: eso ya lo maneja el
// .then(...) que cada página encadena a restaurarSesion()). Bajo las reglas
// de Firestore nuevas, antes de loguearse no hay permiso de lectura, así
// que si alguien abre la página sin sesión y recién después se loguea desde
// el overlay, hay que recargar los datos — antes esto no hacía falta porque
// las reglas viejas eran públicas y ya se habían leído igual.
function _recargarDatosPagina(){
  if (typeof window.cargarTodo === 'function') window.cargarTodo();
  else if (typeof window.initRelevamientos === 'function') window.initRelevamientos();
  else if (typeof window.cargarDatos === 'function') window.cargarDatos();
}

function mostrarSesionUI(perfil, uid){
  loggedUser = {
    uid,
    username: perfil.username,
    nombre: perfil.nombre,
    role: perfil.role,
    modulos: perfil.modulos||[],
    permisos: perfil.permisos||{},
  };
  const overlay=document.getElementById("loginOverlay");
  if(overlay) overlay.style.display="none";
  const badge=document.getElementById("userBadge");
  if(badge){ badge.style.display="inline"; badge.textContent=loggedUser.nombre; }
  actualizarPermisoUI();
  if (typeof window._onLogin === "function") window._onLogin(loggedUser);
}

function mostrarLogin(msg){
  loggedUser = null;
  if (LOGIN_REQUERIDO) {
    const overlay=document.getElementById("loginOverlay");
    if(overlay) overlay.style.display="flex";
  }
  const badge=document.getElementById("userBadge");
  if(badge) badge.style.display="none";
  if (msg) {
    const err=document.getElementById("loginErr");
    if(err){ err.textContent=msg; err.style.display="block"; }
  }
}

// Se llama una vez desde el <script type="module"> de cada página, apenas
// window._auth/_db/_f* están listos. Devuelve una Promise que se resuelve
// la PRIMERA vez que Firebase informa el estado de sesión (haya o no
// sesión). De ahí en más, onAuthStateChanged() sigue escuchando solo y
// actualiza loggedUser/la UI ante futuros logins/logouts — no hace falta
// volver a llamar restaurarSesion().
function restaurarSesion(){
  let resuelto = false;
  return new Promise((resolve) => {
    window._fOnAuthStateChanged(window._auth, async (user) => {
      const primeraVez = !resuelto;
      if (!user) {
        mostrarLogin();
        if (primeraVez) { resuelto = true; resolve(); }
        return;
      }
      try {
        const snap = await window._fGetDoc(window._fDoc(window._db, "usuarios", user.uid));
        if (!snap.exists()) throw new Error("tu usuario ya no existe en el sistema");
        const perfil = snap.data();
        if (MODULO_ID && perfil.role!=="admin" && !(perfil.modulos&&perfil.modulos.includes(MODULO_ID))) {
          throw new Error('no tenés el módulo "'+MODULO_ID+'" habilitado');
        }
        mostrarSesionUI(perfil, user.uid);
        if (!primeraVez) _recargarDatosPagina();
      } catch(e) {
        console.error("restaurarSesion() falló:", e);
        await window._fSignOut(window._auth).catch(()=>{});
        mostrarLogin("⚠️ Se cerró tu sesión: " + e.message);
      }
      if (primeraVez) { resuelto = true; resolve(); }
    });
  });
}

async function doLogin(){
  const u=document.getElementById("lUser").value.trim().toLowerCase();
  const p=document.getElementById("lPass").value;
  const err=document.getElementById("loginErr"); if(err) err.style.display="none";
  if(!u||!p){showLoginErr("Completá usuario y contraseña.");return;}
  const btn=document.getElementById("loginBtn");
  if(btn){btn.disabled=true;btn.textContent="Verificando…";}
  try{
    const lookupSnap = await window._fGetDoc(window._fDoc(window._db, "login_lookup", u));
    if(!lookupSnap.exists()) { showLoginErr("Usuario o contraseña incorrectos."); return; }
    const { email } = lookupSnap.data();
    await window._fSignIn(window._auth, email, p);
    // onAuthStateChanged (activado por restaurarSesion) actualiza
    // loggedUser y la UI solo — acá no hace falta nada más en el caso de
    // éxito.
  }catch(e){
    showLoginErr("Usuario o contraseña incorrectos.");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Ingresar";}
  }
}
function showLoginErr(m){
  const e=document.getElementById("loginErr");
  if(e){e.textContent=m;e.style.display="block";}
  const p=document.getElementById("lPass");
  if(p)p.value="";
}

function doLogout(){
  window._fSignOut(window._auth).finally(()=>location.reload());
}

// -- CAMBIAR CONTRASEÑA PROPIA -----------------------------------
// Requiere que la página host tenga el modal (#modal-cambiar-pass-overlay
// con #cp-actual/#cp-nueva/#cp-nueva2/#cp-err/#cp-guardar-btn) y las
// funciones toast()/cerrarModal() ya definidas (mismo patrón que el resto
// de los modales de estas páginas).
function abrirModalCambiarPass(){
  document.getElementById("cp-actual").value="";
  document.getElementById("cp-nueva").value="";
  document.getElementById("cp-nueva2").value="";
  document.getElementById("cp-err").style.display="none";
  document.getElementById("modal-cambiar-pass-overlay").classList.add("open");
}
async function guardarCambioPassPropia(){
  const err=document.getElementById("cp-err");
  err.style.display="none";
  const actual=document.getElementById("cp-actual").value;
  const nueva=document.getElementById("cp-nueva").value;
  const nueva2=document.getElementById("cp-nueva2").value;
  if(!actual||!nueva||!nueva2){err.textContent="Completá todos los campos.";err.style.display="block";return;}
  if(nueva.length<6){err.textContent="La nueva contraseña debe tener al menos 6 caracteres.";err.style.display="block";return;}
  if(nueva!==nueva2){err.textContent="Las contraseñas nuevas no coinciden.";err.style.display="block";return;}
  const btn=document.getElementById("cp-guardar-btn");
  btn.disabled=true;btn.textContent="Guardando…";
  try{
    const cred = window._fEmailAuthProvider.credential(window._auth.currentUser.email, actual);
    await window._fReauthenticate(window._auth.currentUser, cred);
    await window._fUpdatePassword(window._auth.currentUser, nueva);
    cerrarModal("modal-cambiar-pass-overlay");
    toast("✅ Contraseña actualizada.");
  }catch(e){
    err.textContent = (e.code==="auth/invalid-credential"||e.code==="auth/wrong-password")
      ? "La contraseña actual no es correcta." : ("Error: "+e.message);
    err.style.display="block";
  }finally{
    btn.disabled=false;btn.textContent="Guardar";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-auth.js
git commit -m "personal-auth.js: migrar login a Firebase Authentication"
```

---

## Task 4: Conectar Firebase Auth en las 4 páginas que ya usan `personal-auth.js`

**Files:**
- Modify: `gestion_personal.html:216,221-224,238-244`
- Modify: `novedades_personal.html:450,456-458,472-477`
- Modify: `asignacion_zonas.html:254,260-262,276-286`
- Modify: `relevamientos_operativos.html:293,296-298,310-314`

**Interfaces:**
- Consumes: `window._auth`, `window._fOnAuthStateChanged`, `window._fSignIn`, `window._fSignOut`, `window._fEmailAuthProvider`, `window._fReauthenticate`, `window._fUpdatePassword` (definidos por `personal-auth.js` de la Task 3).
- Produces: expone esas mismas siete claves en `window` para que `personal-auth.js` las use — ningún otro archivo depende de esto directamente.

Estas 4 páginas ya cargan `personal-auth.js` con `window.MODULO_ID` seteado y ya llaman a `window.restaurarSesion().then(...)` al final de su `<script type="module">` — **no hace falta tocar esa línea final**, sólo agregar los imports/bindings de Auth y bumpear el cache-busting de `personal-auth.js?v=6` a `?v=7` (cambió su contenido en la Task 3).

- [ ] **Step 1: `gestion_personal.html` — bump de versión del script**

Reemplazar (línea 216):
```html
<script src="personal-auth.js?v=6"></script>
```
por:
```html
<script src="personal-auth.js?v=7"></script>
```

- [ ] **Step 2: `gestion_personal.html` — agregar el import de Auth**

Reemplazar (líneas 222-224):
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
```
por:
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
```

- [ ] **Step 3: `gestion_personal.html` — exponer los bindings de Auth**

Reemplazar (líneas 236-244):
```js
const db  = getFirestore(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fGetDocs= getDocs;
window._fSetDoc = setDoc;
window._fDeleteField = deleteField;
```
por:
```js
const db   = getFirestore(app);
const auth = getAuth(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fGetDocs= getDocs;
window._fSetDoc = setDoc;
window._fDeleteField = deleteField;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;
```

- [ ] **Step 4: repetir los Steps 1-3 en `novedades_personal.html`**

Mismo reemplazo de `personal-auth.js?v=6` → `?v=7` (línea 450).

El bloque de imports (líneas 456-458) es idéntico al de `gestion_personal.html` — aplicar el mismo reemplazo del Step 2.

El bloque de exposición (líneas 470-477) es:
```js
const db  = getFirestore(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fSetDoc = setDoc;
window._fDeleteField = deleteField;
```
Reemplazar por (nota: esta página no importa `getDocs`, a diferencia de `gestion_personal.html`):
```js
const db   = getFirestore(app);
const auth = getAuth(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fSetDoc = setDoc;
window._fDeleteField = deleteField;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;
```

- [ ] **Step 5: repetir en `asignacion_zonas.html`**

Bump de versión (línea 254): `personal-auth.js?v=6` → `?v=7`.

Imports (líneas 260-262) — agregar la misma línea de `firebase-auth.js` del Step 2 después de la línea de `firebase-firestore.js` (el import de Firestore de esta página trae más funciones que las otras: `doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, collection, collectionGroup, writeBatch` — no tocar esa lista, sólo agregar la línea de Auth debajo).

Bloque de exposición (líneas 274-286):
```js
const db  = getFirestore(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fGetDocs= getDocs;
window._fSetDoc = setDoc;
window._fDelDoc = deleteDoc;
window._fCol    = collection;
window._fColGroup = collectionGroup;
window._fBatch  = writeBatch;
window._fDeleteField = deleteField;
window._fUpdateDoc = updateDoc;
```
Reemplazar por:
```js
const db   = getFirestore(app);
const auth = getAuth(app);

// Exponer para el script global
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fGetDocs= getDocs;
window._fSetDoc = setDoc;
window._fDelDoc = deleteDoc;
window._fCol    = collection;
window._fColGroup = collectionGroup;
window._fBatch  = writeBatch;
window._fDeleteField = deleteField;
window._fUpdateDoc = updateDoc;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;
```

- [ ] **Step 6: repetir en `relevamientos_operativos.html`**

Bump de versión (línea 293): `personal-auth.js?v=6` → `?v=7`.

Imports (líneas 296-298) — mismo agregado del Step 2 (esta página importa `doc, getDoc, setDoc, updateDoc, deleteField`, igual lista base que `gestion_personal.html`/`novedades_personal.html`).

Bloque de exposición (líneas 308-314):
```js
const db = getFirestore(app);

// Exponer para el script clásico de abajo (mismo patrón que el resto del portal)
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fSetDoc = setDoc;
```
Reemplazar por:
```js
const db   = getFirestore(app);
const auth = getAuth(app);

// Exponer para el script clásico de abajo (mismo patrón que el resto del portal)
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._fSetDoc = setDoc;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;
```
(`window._fDeleteField = deleteField;` sigue un poco más abajo en esta página, sin tocar.)

- [ ] **Step 7: Verificación manual (con las reglas de Firestore VIEJAS todavía desplegadas, así que esto no puede romper nada)**

Abrir cada una de las 4 páginas en el navegador (`file://` o sirviendo la carpeta con cualquier servidor estático) y confirmar en la consola del navegador que NO aparece ningún error de `ReferenceError`/`is not a function` relacionado con `_fSignIn`, `_fOnAuthStateChanged`, etc. — el login en sí todavía va a fallar (no hay usuarios migrados aún, eso es la Task 9), pero el overlay tiene que aparecer sin errores de JS en consola.

- [ ] **Step 8: Commit**

```bash
git add gestion_personal.html novedades_personal.html asignacion_zonas.html relevamientos_operativos.html
git commit -m "Conectar Firebase Auth en las 4 páginas que usan personal-auth.js"
```

---

## Task 5: Migrar `buscador_permisos.html` al login compartido (búsqueda sigue pública)

**Files:**
- Modify: `buscador_permisos.html:9-10,14-32,407-513`

**Interfaces:**
- Consumes: `personal-auth.js` (Task 3) con `window.MODULO_ID='permisos'` y `window.LOGIN_REQUERIDO=false`.
- Produces: nada nuevo — esta página sigue siendo la única con `LOGIN_REQUERIDO=false`.

Este archivo tiene su PROPIA implementación de login (no usa `personal-auth.js` hoy), y su comportamiento es distinto al resto: la búsqueda es pública (nadie tiene que loguearse para buscar), sólo la pestaña "Carga" exige haber iniciado sesión como admin. Ese comportamiento se preserva tal cual — sólo cambia CÓMO se verifica la contraseña (Firebase Auth en vez de comparar un hash a mano) y de dónde sale `loggedUser` (de `personal-auth.js`, no de una variable local).

- [ ] **Step 1: Cargar `personal-auth.js` con `MODULO_ID='permisos'` y `LOGIN_REQUERIDO=false`**

Reemplazar (líneas 9-10):
```html
<script src="config.js"></script>
<script src="utils.js?v=3"></script>
```
por:
```html
<script src="config.js"></script>
<script src="utils.js?v=3"></script>
<script>window.MODULO_ID='permisos'; window.LOGIN_REQUERIDO=false;</script>
<script src="personal-auth.js?v=7"></script>
```

- [ ] **Step 2: Agregar el import y los bindings de Auth en el `<script type="module">`**

Reemplazar (líneas 14-32):
```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
  import { getFirestore, collection, getDocs, writeBatch, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  if (typeof FIREBASE_CONFIG === 'undefined') {
    alert('Error: no se encontró config.js. Ejecutá generate-config.js primero.');
  }
  const app = initializeApp(FIREBASE_CONFIG);
  // App Check: si config.js todavía no tiene la clave (no configurada), se
  // sigue funcionando igual — App Check queda simplemente sin inicializar.
  if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  const db  = getFirestore(app);
  window._db     = db;
  window._fs     = { collection, getDocs, writeBatch, doc };
  window._getDoc = getDoc;
  window._setDoc = setDoc;
  window._doc    = doc;
```
por:
```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
  import { getFirestore, collection, getDocs, writeBatch, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  if (typeof FIREBASE_CONFIG === 'undefined') {
    alert('Error: no se encontró config.js. Ejecutá generate-config.js primero.');
  }
  const app = initializeApp(FIREBASE_CONFIG);
  // App Check: si config.js todavía no tiene la clave (no configurada), se
  // sigue funcionando igual — App Check queda simplemente sin inicializar.
  if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  const db   = getFirestore(app);
  const auth = getAuth(app);
  window._db     = db;
  window._fs     = { collection, getDocs, writeBatch, doc };
  window._getDoc = getDoc;
  window._setDoc = setDoc;
  window._doc    = doc;
  // Alias con el mismo nombre que usa personal-auth.js (el resto de las
  // páginas ya expone _fDoc/_fGetDoc; acá conviven con los alias viejos
  // _doc/_getDoc que ya usa el resto de este archivo, para no reescribir
  // todo el archivo).
  window._fDoc    = doc;
  window._fGetDoc = getDoc;
  window._auth = auth;
  window._fOnAuthStateChanged = onAuthStateChanged;
  window._fSignIn  = signInWithEmailAndPassword;
  window._fSignOut = signOut;
  window._fEmailAuthProvider = EmailAuthProvider;
  window._fReauthenticate = reauthenticateWithCredential;
  window._fUpdatePassword = updatePassword;
  window.restaurarSesion();
```

- [ ] **Step 3: Quitar la implementación de login vieja y conectar el badge/pestaña propios de esta página al hook `_onLogin`**

Reemplazar el bloque completo (líneas 407-469 — desde el comentario `// AUTH` hasta el cierre de `doLogout()`):
```js
// AUTH — usa Firestore (mismos usuarios que el portal)
var loggedUser = null;
// Restaurar sesión del portal (evita pedir contraseña al volver)
(function() {
  try {
    var saved = localStorage.getItem('dgf_session');
    if (saved) {
      var s = JSON.parse(saved);
      if (s && s.role === 'admin') {
        loggedUser = s.username;
        document.getElementById('ubadge').style.display = 'inline-flex';
        document.getElementById('ubadgeN').textContent = s.nombre || s.username;
        document.getElementById('tabUpload').style.display = '';
      }
    }
  } catch(e) {}
})();
function switchTab(name, btn) {
  document.querySelectorAll('.tpanel').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.tbtn').forEach(function(b){b.classList.remove('active');});
  document.getElementById('panel-'+name).classList.add('active');
  btn.classList.add('active');
  if (name==='upload' && !loggedUser) openLogin();
  if (name==='search') setTimeout(function(){if(_map)_map.invalidateSize();},120);
}
function openLogin() {
  var errEl=document.getElementById('loginErr');
  errEl.textContent='Usuario o contraseña incorrectos.';
  errEl.style.display='none';
  document.getElementById('lUser').value='';
  document.getElementById('lPass').value='';
  document.getElementById('loginOverlay').classList.add('show');
  setTimeout(function(){document.getElementById('lUser').focus();},100);
}
async function sha256Local(text) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
async function doLogin() {
  var u = document.getElementById('lUser').value.trim().toLowerCase();
  var p = document.getElementById('lPass').value;
  var errEl = document.getElementById('loginErr');
  errEl.textContent='Usuario o contraseña incorrectos.';
  errEl.style.display='none';
  if (!u || !p) { errEl.style.display='block'; return; }
  try {
    var fDoc = window._doc, fGet = window._getDoc, db = window._db;
    var snap = await fGet(fDoc(db, 'usuarios', u));
    if (!snap.exists()) { errEl.style.display='block'; document.getElementById('lPass').value=''; return; }
    var hash = await sha256Local(p);
    if (snap.data().passHash !== hash) { errEl.style.display='block'; document.getElementById('lPass').value=''; return; }
    // Solo admin puede cargar datos
    if (snap.data().role !== 'admin') { errEl.textContent='Sin permiso de carga.'; errEl.style.display='block'; return; }
    loggedUser = u;
    document.getElementById('loginOverlay').classList.remove('show');
    document.getElementById('ubadge').style.display='inline-flex';
    document.getElementById('ubadgeN').textContent=snap.data().nombre||u;
    // Sólo llega hasta acá si ya pasó el chequeo de admin de arriba.
    document.getElementById('tabUpload').style.display = '';
  } catch(e) {
    errEl.textContent='Error de conexión.'; errEl.style.display='block';
  }
}
function doLogout() {
  loggedUser=null;
  document.getElementById('ubadge').style.display='none';
  document.querySelectorAll('.tbtn')[0].click();
}
```
por:
```js
// AUTH — delegado a personal-auth.js (Firebase Authentication). loggedUser
// vive ahí; acá sólo se reacciona al login/logout para esta página en
// particular, porque a diferencia del resto del portal, acá la búsqueda es
// pública y sólo la pestaña "Carga" exige haber iniciado sesión como admin.
window._onLogin = function(u) {
  document.getElementById('ubadge').style.display = 'inline-flex';
  document.getElementById('ubadgeN').textContent = u.nombre || u.username;
  if (u.role === 'admin') document.getElementById('tabUpload').style.display = '';
};
function switchTab(name, btn) {
  document.querySelectorAll('.tpanel').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.tbtn').forEach(function(b){b.classList.remove('active');});
  document.getElementById('panel-'+name).classList.add('active');
  btn.classList.add('active');
  if (name==='upload' && (!window.usuarioActual || !usuarioActual())) openLogin();
  if (name==='search') setTimeout(function(){if(_map)_map.invalidateSize();},120);
}
function openLogin() {
  var errEl=document.getElementById('loginErr');
  errEl.style.display='none';
  document.getElementById('lUser').value='';
  document.getElementById('lPass').value='';
  document.getElementById('loginOverlay').classList.add('show');
  document.getElementById('loginOverlay').style.display='flex';
  setTimeout(function(){document.getElementById('lUser').focus();},100);
}
```

Nota: `doLogin()`/`doLogout()`/`sha256Local()` ya no se definen acá — vienen de `personal-auth.js` (Task 3), que ya usan el `onclick="doLogin()"` del botón existente y el `onclick="togglePass()"` del ojito, sin tocar el HTML del overlay (los ids `#lUser`/`#lPass`/`#loginErr`/`#loginBtn`/`#loginOverlay` ya coinciden). Si esta página tiene algún botón de "cerrar sesión" propio (buscar `onclick="doLogout()"` en el archivo), ya apunta a la versión compartida sin cambios.

- [ ] **Step 4: Verificación manual del `switchTab` restante**

Revisar que no quede ninguna otra referencia a la variable local `loggedUser` en el resto del archivo (buscar `loggedUser` en todo `buscador_permisos.html`) — si aparece en algún otro lado (por ejemplo, para mostrar "cargado por X"), reemplazarla por `usuarioActual()?.nombre` o `usuarioActual()?.username` según corresponda (función expuesta por `personal-auth.js`).

- [ ] **Step 5: Commit**

```bash
git add buscador_permisos.html
git commit -m "buscador_permisos.html: migrar login a Firebase Auth, búsqueda sigue pública"
```

---

## Task 6: Agregar login a `estadisticas_actas.html` (hoy no tiene ninguno)

**Files:**
- Modify: `estadisticas_actas.html:8-9,21,127-142,337-358,369-382`

**Interfaces:**
- Consumes: `personal-auth.js` (Task 3) con `window.MODULO_ID='estadisticas'` (login obligatorio, `LOGIN_REQUERIDO` no se setea → `true` por defecto).

- [ ] **Step 1: Cargar `personal-auth.js`**

Reemplazar (líneas 8-9):
```html
<script src="config.js"></script>
<script src="utils.js?v=3"></script>
```
por:
```html
<script src="config.js"></script>
<script src="utils.js?v=3"></script>
<script>window.MODULO_ID='estadisticas';</script>
<script src="personal-auth.js?v=7"></script>
<script src="personal-nav.js?v=2"></script>
```

- [ ] **Step 2: Agregar el overlay de login, el modal de cambiar contraseña y el badge de usuario**

Reemplazar (línea 125-127, justo después de `<body>`):
```html
<body>

<header>
```
por (markup adaptado del mismo patrón que usan `gestion_personal.html`/`novedades_personal.html`/`asignacion_zonas.html`):
```html
<body>

<!-- CAMBIAR CONTRASEÑA -->
<div class="overlay" id="modal-cambiar-pass-overlay">
  <div class="modal" style="max-width:380px">
    <div class="modal-title">Cambiar contraseña</div>
    <div id="cp-err" style="display:none;background:#fee2e2;color:#b91c1c;padding:8px;margin-bottom:10px;font-size:.82rem"></div>
    <div class="form-field full" style="margin-bottom:12px">
      <label class="fl">Contraseña actual</label>
      <input class="form-input" type="password" id="cp-actual" autocomplete="current-password">
    </div>
    <div class="form-field full" style="margin-bottom:12px">
      <label class="fl">Nueva contraseña</label>
      <input class="form-input" type="password" id="cp-nueva" autocomplete="new-password">
    </div>
    <div class="form-field full" style="margin-bottom:16px">
      <label class="fl">Repetir nueva contraseña</label>
      <input class="form-input" type="password" id="cp-nueva2" autocomplete="new-password">
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="cerrarModal('modal-cambiar-pass-overlay')">Cancelar</button>
      <button class="btn btn-azul" id="cp-guardar-btn" onclick="guardarCambioPassPropia()">Guardar</button>
    </div>
  </div>
</div>

<!-- LOGIN OVERLAY -->
<div class="overlay open" id="loginOverlay" style="z-index:3000">
  <div class="modal" style="max-width:360px;text-align:center">
    <div style="font-size:2rem;margin-bottom:8px">🏛️</div>
    <div class="modal-title" style="text-align:center">Estadísticas — Actas</div>
    <p style="font-size:.79rem;color:#888;margin-bottom:18px">DGFIS-GCABA — Acceso restringido</p>
    <div class="lerr" id="loginErr" style="display:none;background:#fee2e2;color:#b91c1c;border-radius:0;padding:8px;margin-bottom:10px;font-size:.82rem"></div>
    <div class="form-field full" style="margin-bottom:12px;text-align:left">
      <label class="fl">Usuario</label>
      <input class="form-input" type="text" id="lUser" placeholder="usuario" autocomplete="username" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div class="form-field full" style="margin-bottom:16px;text-align:left">
      <label class="fl">Contraseña</label>
      <div style="position:relative">
        <input class="form-input" type="password" id="lPass" placeholder="••••••" style="padding-right:36px" onkeydown="if(event.key==='Enter')doLogin()">
        <button type="button" onclick="togglePass()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;color:#888">👁️</button>
      </div>
    </div>
    <button class="btn btn-azul" style="width:100%;padding:11px" id="loginBtn" onclick="doLogin()">Ingresar</button>
    <p style="margin-top:12px;font-size:.74rem"><a href="index.html" style="color:var(--pli)">← Volver al portal</a></p>
  </div>
</div>
<script>
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o&&o.id!=='loginOverlay')o.classList.remove('open');}));
</script>

<header>
```

- [ ] **Step 3: Agregar el badge de usuario y los botones de cambiar contraseña / salir al header**

Reemplazar (líneas 138-141):
```html
  <div class="hright">
    <div class="pill loading" id="dbPill"><span class="dot"></span><span id="dbTxt">Cargando…</span></div>
    <button class="hbtn" onclick="forzarRecarga()">⟳ Actualizar</button>
  </div>
```
por:
```html
  <div class="hright">
    <div class="pill loading" id="dbPill"><span class="dot"></span><span id="dbTxt">Cargando…</span></div>
    <button class="hbtn" onclick="forzarRecarga()">⟳ Actualizar</button>
    <span id="userBadge" style="display:none;background:rgba(255,255,255,.15);border-radius:0;padding:4px 12px;font-size:12px"></span>
    <button class="hbtn" onclick="abrirModalCambiarPass()" title="Cambiar contraseña">🔑</button>
    <button class="hbtn" onclick="doLogout()">Salir</button>
  </div>
```

- [ ] **Step 4: Agregar el bindings de Auth al `<script type="module">` y llamar a `restaurarSesion()`**

Reemplazar (líneas 337-358, hasta la línea `window._getDocs    = getDocs;`):
```js
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

if (typeof FIREBASE_CONFIG === 'undefined') {
  alert('Error: falta config.js'); throw new Error();
}
const app = initializeApp(FIREBASE_CONFIG);
// App Check: si config.js todavía no tiene la clave (no configurada), se
// sigue funcionando igual — App Check queda simplemente sin inicializar.
if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const db  = getFirestore(app);
window._db     = db;
window._setDoc = setDoc;
window._getDoc = getDoc;
window._deleteDoc = deleteDoc;
window._doc    = doc;
window._collection = collection;
window._getDocs    = getDocs;
```
por:
```js
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

if (typeof FIREBASE_CONFIG === 'undefined') {
  alert('Error: falta config.js'); throw new Error();
}
const app = initializeApp(FIREBASE_CONFIG);
// App Check: si config.js todavía no tiene la clave (no configurada), se
// sigue funcionando igual — App Check queda simplemente sin inicializar.
if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const db   = getFirestore(app);
const auth = getAuth(app);
window._db     = db;
window._setDoc = setDoc;
window._getDoc = getDoc;
window._deleteDoc = deleteDoc;
window._doc    = doc;
window._collection = collection;
window._getDocs    = getDocs;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;
// cargarDatos() se define más abajo, en el <script> clásico de esta misma
// página — para cuando este bloque type="module" corre (defer implícito de
// los módulos), ya está definida. Mismo patrón que .then(window.cargarTodo)
// en el resto del portal; _recargarDatosPagina() de personal-auth.js
// también la vuelve a llamar sola si el login ocurre después de esta carga
// inicial (ver Task 3).
window.restaurarSesion().then(() => { if (window.cargarDatos) window.cargarDatos(); });
```

- [ ] **Step 5: Gatear la carga de datos y la pestaña "Carga" detrás del login**

Reemplazar (líneas 369-382):
```js
function mostrarTabCargaSegunRol() {
  try {
    const s = localStorage.getItem('dgf_session');
    if (s) {
      const sess = JSON.parse(s);
      if (sess && sess.role === 'admin') {
        document.getElementById('tabCarga').style.display = '';
      }
    }
  } catch(e) {}
}

// Mostrar tab apenas carga la página, sin esperar a Firestore
mostrarTabCargaSegunRol();

async function cargarDatos() {
```
por:
```js
// Antes leía localStorage directo; ahora loggedUser (con .role real,
// revalidado contra Firestore) lo entrega personal-auth.js vía _onLogin.
window._onLogin = function(u) {
  if (u.role === 'admin') document.getElementById('tabCarga').style.display = '';
};

async function cargarDatos() {
```

Y, un poco más abajo en el mismo bloque (dentro de la función, ver lectura previa de líneas 384-408 de este archivo), reemplazar las dos llamadas a `mostrarTabCargaSegunRol();` que quedan dentro de `cargarDatos()` por nada (eliminarlas) — ya no hace falta, `_onLogin` la reemplaza.

- [ ] **Step 6: Verificación manual**

Abrir `estadisticas_actas.html` directo por URL sin haber iniciado sesión en ningún otro lado del portal y confirmar que ahora pide usuario/contraseña (con las reglas viejas todavía desplegadas, el login en sí va a fallar hasta la Task 9 — lo que hay que confirmar acá es que el overlay bloquea la página, cosa que hoy NO pasa).

- [ ] **Step 7: Commit**

```bash
git add estadisticas_actas.html
git commit -m "estadisticas_actas.html: agregar login (antes no tenía ninguno)"
```

---

## Task 7: Reescribir el login y el panel admin de `index.html`

**Files:**
- Modify: `index.html:1-93,165-183,253-268,332-411,413-574,576-606`

**Interfaces:**
- Consumes: `personal-auth.js` (Task 3) con `window.MODULO_ID` sin setear (portal, sin restricción de módulo) y `LOGIN_REQUERIDO` sin setear (`true` por defecto).
- Produces: `usuarios/{uid}` con el esquema nuevo al crear/editar cuentas — ver Task 1/2.

`index.html` es el más grande de reescribir: además del login (que pasa a delegarse en `personal-auth.js`, igual que las otras páginas), tiene el panel de administración de usuarios, que necesita cambios reales de comportamiento (ver spec, sección "Panel de administración").

- [ ] **Step 1: Cargar `personal-auth.js`**

Reemplazar (línea 9, justo debajo de `<script src="config.js">` — revisar el archivo real para la línea exacta de `utils.js` si difiere):
```html
<script src="config.js"></script>
```
por (agregar después de la línea de `utils.js`, si existe; si `index.html` no carga `utils.js` hoy, agregarla también — hace falta para `esc()`/`escJsAttr()`, ya usadas por `loadUserTable()`):
```html
<script src="config.js"></script>
<script src="utils.js?v=3"></script>
<script src="personal-auth.js?v=7"></script>
<script src="personal-nav.js?v=2"></script>
```

- [ ] **Step 2: Quitar el bootstrap de sesión cacheada en localStorage**

Reemplazar (líneas 76-93):
```html
<script>
// Oculta el overlay de login al instante si hay una sesión guardada en
// localStorage, sin esperar a que cargue Firebase ni a la revalidación
// contra Firestore que hace el script de más abajo — evita el "parpadeo"
// del popup de usuario/contraseña en cada visita a esta página. Es un
// <script> clásico (no depende de red salvo el propio archivo, mismo
// origen) que corre apenas se parsea, antes de que el <script
// type="module"> de abajo siquiera empiece a bajar el SDK de Firebase del
// CDN. Si la revalidación de ese script falla, vuelve a mostrar el overlay.
(function(){
  try {
    var s = localStorage.getItem('dgf_session');
    if (s && JSON.parse(s).username) {
      document.getElementById('loginOverlay').style.display = 'none';
    }
  } catch(e) {}
})();
</script>
```
por: (nada — se elimina el bloque completo. Firebase Authentication persiste su propia sesión y `onAuthStateChanged` la entrega apenas está lista; ya no hace falta ningún cacheo manual en `localStorage`, así que tampoco hay "parpadeo" que evitar de esta forma — el `loginOverlay` arranca oculto/visible según el CSS que ya tenga, y `personal-auth.js` lo controla desde `restaurarSesion()`.)

- [ ] **Step 3: Reemplazar el `<script type="module">` completo**

Reemplazar TODO el contenido desde `<script type="module">` (línea 165) hasta `</script>` (línea 606) por:

```html
<script type="module">
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// -- INIT FIREBASE ----------------------------------------------
if (typeof FIREBASE_CONFIG === 'undefined') {
  alert('Error: falta config.js. Ejecutá generate-config.js.');
  throw new Error('FIREBASE_CONFIG no definido');
}
const app = initializeApp(FIREBASE_CONFIG);
// App Check: si config.js todavía no tiene la clave (no configurada), se
// sigue funcionando igual — App Check queda simplemente sin inicializar.
if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const db   = getFirestore(app);
const auth = getAuth(app);
window._db      = db;
window._fDoc    = doc;
window._fGetDoc = getDoc;
window._auth = auth;
window._fOnAuthStateChanged = onAuthStateChanged;
window._fSignIn  = signInWithEmailAndPassword;
window._fSignOut = signOut;
window._fEmailAuthProvider = EmailAuthProvider;
window._fReauthenticate = reauthenticateWithCredential;
window._fUpdatePassword = updatePassword;

// -- MÓDULOS DEL PORTAL ----------------------------------------
// Para agregar uno nuevo, solo sumá un objeto acá.
const MODULES = [
  {
    id: 'permisos', icon: '🔍', title: 'Buscador de Permisos',
    desc: 'Consultá permisos de alimentos por nombre, DNI, expediente o ubicación.',
    tag: 'Activo', roles: ['admin','permisos'], url: 'buscador_permisos.html',
  },
  {
    id: 'estadisticas', icon: '📊', title: 'Estadísticas — Actas',
    desc: 'Mapa de calor, gráficos por zona, fecha, tipo de operativo y categorías de artículos.',
    tag: 'Activo', roles: ['admin','estadisticas'], url: 'estadisticas_actas.html',
  },
  {
    id: 'novedades', icon: '📋', title: 'Novedades de Personal',
    desc: 'Carga de licencias, novedades, nómina y bajas del personal.',
    tag: 'Activo', roles: ['admin','novedades'], url: 'novedades_personal.html',
  },
  {
    id: 'asignacion', icon: '📍', title: 'Asignación de Zonas',
    desc: 'Distribución diaria por zona, resumen y configuración de feriados.',
    tag: 'Activo', roles: ['admin','asignacion'], url: 'asignacion_zonas.html',
  },
  {
    id: 'personal', icon: '👥', title: 'Gestión de Personal',
    desc: 'Alta, edición y baja de personal, nómina y carga desde Excel.',
    tag: 'Activo', roles: ['admin','personal'], url: 'gestion_personal.html',
  },
  {
    id: 'relevamientos', icon: '🗂️', title: 'Relevamientos Operativos',
    desc: 'Carga y consulta de relevamientos de campo para preparar operativos.',
    tag: 'Activo', roles: ['admin','relevamientos'], url: 'relevamientos_operativos.html',
  },
  {
    id: 'expedientes', icon: '📋', title: 'Gestión de Expedientes',
    desc: 'Alta, baja y seguimiento de expedientes.',
    tag: 'Próximamente', roles: [], url: null,
  },
];

// -- toast()/cerrarModal() genéricos ------------------------------------
// personal-auth.js los necesita para guardarCambioPassPropia() (mismo
// patrón que ya usan gestion_personal.html/novedades_personal.html/
// asignacion_zonas.html/relevamientos_operativos.html); index.html no los
// tenía porque su login viejo era otra implementación.
function cerrarModal(id){ document.getElementById(id).classList.remove('open'); }
function toast(msg){
  let t = document.getElementById('_toastGlobal');
  if(!t){
    t=document.createElement('div'); t.id='_toastGlobal';
    t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 18px;border-radius:0;font-size:.85rem;z-index:5000;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.display='block';
  clearTimeout(window._toastGlobalTimer);
  window._toastGlobalTimer = setTimeout(()=>{ t.style.display='none'; }, 3000);
}
window.cerrarModal = cerrarModal;
window.toast = toast;

// -- POST-LOGIN: personal-auth.js llama a esto con el perfil ya validado -
let loggedUser = null;
window._onLogin = function(u) {
  loggedUser = u;
  document.getElementById('userBadge').style.display = 'flex';
  document.getElementById('userBadgeName').textContent = loggedUser.nombre;
  document.getElementById('cpBtn').style.display = 'inline';
  document.getElementById('logoutBtn').style.display = 'inline';
  document.getElementById('welcomeTitle').textContent = '👋 Hola, ' + loggedUser.nombre;
  document.getElementById('welcomeSub').textContent =
    loggedUser.role === 'admin'
      ? 'Acceso completo — Panel de administración habilitado.'
      : 'Seleccioná un módulo para comenzar.';
  if (loggedUser.role === 'admin') {
    document.getElementById('adminPanel').style.display = 'block';
    loadUserTable();
  } else {
    document.getElementById('adminPanel').style.display = 'none';
  }
  renderModules();
};

// -- MÓDULOS ----------------------------------------------------
function renderModules() {
  const grid = document.getElementById('moduleGrid');
  grid.innerHTML = '';
  MODULES.forEach(mod => {
    const canAccess = loggedUser.role === 'admin' ||
      mod.roles.includes(loggedUser.role) ||
      (loggedUser.modulos && mod.roles.some(r => (loggedUser.modulos||[]).includes(r)));
    const locked = !canAccess || !mod.url;
    const el = document.createElement(locked ? 'div' : 'a');
    if (!locked) el.href = mod.url;
    el.className = 'mcard' + (locked ? ' locked' : '');
    el.innerHTML = `
      <div class="micon">${mod.icon}</div>
      <div class="mtitle">${mod.title}</div>
      <div class="mdesc">${mod.desc}</div>
      <span class="mtag${locked ? ' lock' : ''}">${mod.tag}</span>
    `;
    grid.appendChild(el);
  });
}

// -- TABLA DE USUARIOS (admin) -----------------------------------
// El id de cada fila/documento ahora es el uid de Firebase Auth, no el
// nombre de usuario — el nombre de usuario vive en el campo "username".
const MODULOS_DISPONIBLES = ['permisos','estadisticas','novedades','asignacion','personal','relevamientos'];
async function loadUserTable() {
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--c-ink-mut)">Cargando…</td></tr>';
  try {
    const snap = await getDocs(collection(db, 'usuarios'));
    tbody.innerHTML = '';
    snap.forEach(d => {
      const { username, nombre, role, modulos, permisos } = d.data();
      const modsActuales = modulos || [];
      const permisosActuales = permisos || {};
      const tr = document.createElement('tr');
      tr.id = 'urow_' + d.id;
      tr.innerHTML = `
        <td><strong>${esc(username)}</strong></td>
        <td>${esc(nombre)}</td>
        <td><span class="role-badge ${esc(role)}">${esc(role)}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${MODULOS_DISPONIBLES.map(m => `
              <label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer">
                <input type="checkbox" ${modsActuales.includes(m)?'checked':''}
                  onchange="toggleModulo('${escJsAttr(d.id)}','${m}',this.checked)"
                  ${role==='admin'?'disabled title="Admin tiene acceso a todo"':''}
                > ${esc(m)}
              </label>
              ${modsActuales.includes(m)&&role!=='admin' ? `
              <select style="font-size:.7rem;padding:1px 3px" title="Nivel de permiso en ${esc(m)}"
                onchange="cambiarPermiso('${escJsAttr(d.id)}','${m}',this.value)">
                <option value="editor" ${(permisosActuales[m]||'editor')==='editor'?'selected':''}>✏️ Editor</option>
                <option value="viewer" ${permisosActuales[m]==='viewer'?'selected':''}>👁 Sólo ver</option>
              </select>` : ''}`).join('')}
          </div>
        </td>
        <td>
          <button class="abtn" onclick="sendPasswordReset('${escJsAttr(d.id)}','${escJsAttr(username)}')">Enviar restablecimiento</button>
        </td>
        <td style="display:flex;gap:8px;flex-wrap:wrap">
          ${username !== 'srepetto'
            ? `<button class="abtn danger" onclick="deleteUser('${escJsAttr(d.id)}','${escJsAttr(username)}')">Eliminar</button>`
            : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--c-ink-mut)">Sin usuarios.</td></tr>';
    }
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--c-danger);padding:12px">Error al cargar usuarios.</td></tr>';
  }
}

// -- ENVIAR EMAIL DE RESTABLECIMIENTO (reemplaza "cambiar contraseña de
//    otro usuario", que ya no es posible sin backend — ver spec) --------
window.sendPasswordReset = async function(uid, username) {
  try {
    const snap = await getDoc(doc(db, 'usuarios', uid));
    if (!snap.exists() || !snap.data().email) { showAdminToast('Ese usuario no tiene un email cargado.', 'err'); return; }
    await sendPasswordResetEmail(auth, snap.data().email);
    showAdminToast(`✅ Email de restablecimiento enviado a ${username}.`, 'ok');
  } catch(e) {
    showAdminToast('Error al enviar: ' + e.message, 'err');
  }
};

// -- AGREGAR USUARIO ----------------------------------------------------
// Crea la cuenta de Firebase Authentication desde una instancia SECUNDARIA
// de la app (patrón estándar de Firebase): createUserWithEmailAndPassword
// en la instancia normal cerraría la sesión del admin que está creando la
// cuenta de otra persona.
window.addUser = async function() {
  const username = document.getElementById('newUsername').value.trim().toLowerCase();
  const nombre   = document.getElementById('newNombre').value.trim();
  const email    = document.getElementById('newEmail').value.trim();
  const pass     = document.getElementById('newPass').value.trim();
  const role     = document.getElementById('newRole').value;

  if (!username || !nombre || !email || !pass) {
    showAdminToast('Completá todos los campos.', 'err'); return;
  }
  if (pass.length < 6) {
    showAdminToast('La contraseña debe tener al menos 6 caracteres.', 'err'); return;
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    showAdminToast('El usuario solo puede tener letras, números y guión bajo.', 'err'); return;
  }

  try {
    const existeLookup = await getDoc(doc(db, 'login_lookup', username));
    if (existeLookup.exists()) { showAdminToast('Ese nombre de usuario ya existe.', 'err'); return; }
  } catch(e) {
    showAdminToast('Error al verificar el usuario: ' + e.message, 'err'); return;
  }

  const secondaryApp = initializeApp(FIREBASE_CONFIG, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    await setDoc(doc(db, 'usuarios', uid), { username, nombre, email, role, modulos: [], permisos: {} });
    await setDoc(doc(db, 'login_lookup', username), { email });
    document.getElementById('newUsername').value = '';
    document.getElementById('newNombre').value   = '';
    document.getElementById('newEmail').value    = '';
    document.getElementById('newPass').value     = '';
    document.getElementById('newRole').value     = 'viewer';
    showAdminToast('✅ Usuario ' + username + ' creado correctamente.', 'ok');
    loadUserTable();
  } catch(e) {
    showAdminToast('Error al crear usuario: ' + e.message, 'err');
  } finally {
    deleteApp(secondaryApp);
  }
};

// -- ELIMINAR USUARIO ---------------------------------------------------
// No borra la cuenta de Firebase Authentication (eso requeriría el Admin
// SDK / una Cloud Function, fuera de alcance — ver spec): borra el perfil
// de Firestore, con lo que esa persona pierde el acceso al instante (las
// reglas nuevas exigen que exists(usuarios/{uid})). La cuenta de
// Authentication en sí queda inactiva hasta que alguien la borre a mano,
// cada tanto, desde la consola de Firebase.
window.deleteUser = async function(uid, username) {
  if (!confirm('¿Eliminar el acceso del usuario "' + username + '"? Esta acción no se puede deshacer desde acá.')) return;
  try {
    await deleteDoc(doc(db, 'usuarios', uid));
    await deleteDoc(doc(db, 'login_lookup', username)).catch(()=>{});
    document.getElementById('urow_' + uid)?.remove();
    showAdminToast('Usuario ' + username + ' eliminado (su acceso se cortó al instante).', 'ok');
  } catch(e) {
    showAdminToast('Error al eliminar: ' + e.message, 'err');
  }
};

// -- TOGGLE MÓDULO --------------------------------------------------------
window.toggleModulo = async function(uid, modulo, enabled) {
  try {
    await updateDoc(doc(db, 'usuarios', uid), {
      modulos: enabled ? arrayUnion(modulo) : arrayRemove(modulo)
    });
    showAdminToast(`✅ Módulo "${modulo}" ${enabled?'habilitado':'deshabilitado'}.`, 'ok');
  } catch(e) {
    showAdminToast('Error: ' + e.message, 'err');
  }
};

// -- NIVEL DE PERMISO POR MÓDULO (editor puede editar, viewer sólo ve) ----
window.cambiarPermiso = async function(uid, modulo, nivel) {
  try {
    await updateDoc(doc(db, 'usuarios', uid), { ['permisos.' + modulo]: nivel });
    showAdminToast(`✅ Permiso de "${modulo}": ${nivel==='viewer'?'sólo ver':'editor'}.`, 'ok');
  } catch(e) {
    showAdminToast('Error: ' + e.message, 'err');
  }
};

// -- TOAST ADMIN ----------------------------------------------------------
function showAdminToast(msg, type) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className = 'toast-msg ' + type;
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// -- ARRANQUE ---------------------------------------------------
window.restaurarSesion();
</script>
```

- [ ] **Step 4: Agregar el campo de email al formulario de "Agregar usuario"**

En el HTML del panel admin (buscar `id="newRole"` — bloque `.add-user-form` visto en el archivo), agregar un campo antes del de contraseña:

Reemplazar:
```html
      <div class="afield">
        <label>Contraseña</label>
        <input type="password" id="newPass" placeholder="mínimo 6 caracteres" style="width:180px">
      </div>
```
por:
```html
      <div class="afield">
        <label>Email real</label>
        <input type="email" id="newEmail" placeholder="nombre@dominio.com" style="width:190px">
      </div>
      <div class="afield">
        <label>Contraseña</label>
        <input type="password" id="newPass" placeholder="mínimo 6 caracteres" style="width:180px">
      </div>
```

Y cambiar el encabezado de la columna "Nueva contraseña" de la tabla de usuarios (`<th>Nueva contraseña</th>`) por `<th>Restablecer</th>` (ya no se escribe una contraseña ahí, se manda un email — ver `sendPasswordReset` del Step 3).

- [ ] **Step 5: Verificación manual**

Confirmar que la página carga sin errores de JS en consola y que el overlay de login aparece (con las reglas viejas todavía desplegadas, el login real todavía va a fallar hasta la Task 9).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "index.html: login y panel admin sobre Firebase Authentication"
```

---

## Task 8: Prueba end-to-end de la migración con una cuenta descartable

**Files:** ninguno (sólo verificación manual + uso del script de la Task 2)

Esta tarea no modifica código — valida que el diseño completo (script + reglas + páginas) funciona antes de tocar ninguna cuenta real. Con las reglas de Firestore VIEJAS todavía desplegadas, nada de esto puede romper el sitio en producción.

- [ ] **Step 1: Habilitar el proveedor Email/Password (si el usuario todavía no lo hizo)**

Recordarle al usuario (no lo puede hacer el agente): Firebase Console → proyecto `dgfis-gcaba` → Authentication → Sign-in method → habilitar "Email/Password". Esto es un paso bloqueante — sin esto, `signInWithEmailAndPassword`/`importUsers` fallan.

- [ ] **Step 2: Crear una cuenta de prueba descartable en la colección vieja**

Desde la consola de Firebase (Firestore), crear un documento manual en `usuarios` (colección vieja) con id `zzz_prueba_migracion`:
```json
{
  "nombre": "Cuenta de prueba",
  "role": "viewer",
  "passHash": "<sha256 hex de una contraseña de prueba, calculado con el snippet del README>",
  "modulos": ["personal"],
  "permisos": {}
}
```

- [ ] **Step 3: Correr el script sólo contra esa cuenta**

```bash
cd migration-scripts
npm install
node migrar-usuarios.js --solo=zzz_prueba_migracion
```

Confirmar en la salida: `✅ zzz_prueba_migracion: importado a Authentication` y `→ perfil escrito en usuarios/<uid> y login_lookup/zzz_prueba_migracion`. Si el import de hash falla acá (algoritmo/rounds rechazados por Firebase), es el momento de ajustar `hash: { algorithm: 'SHA256', rounds: 1 }` en `migration-scripts/migrar-usuarios.js` (Task 2, Step 3) antes de seguir — nada de esto tocó cuentas reales todavía.

- [ ] **Step 4: Probar el login con la cuenta de prueba**

Servir el sitio localmente (por ejemplo `npx serve .` desde la raíz del repo, o abrir `gestion_personal.html` como `file://`) y loguearse con usuario `zzz_prueba_migracion` y la contraseña de prueba del Step 2. Confirmar que entra correctamente y que el módulo `personal` es accesible.

- [ ] **Step 5: Limpiar la cuenta de prueba**

Borrar manualmente desde la consola de Firebase: el documento `usuarios/zzz_prueba_migracion` (colección vieja), el documento nuevo `usuarios/{uid}` (buscarlo por el campo `username=="zzz_prueba_migracion"`), `login_lookup/zzz_prueba_migracion`, y la cuenta en Authentication → Users.

---

## Task 9: Publicar el código nuevo en Hosting (reglas de Firestore siguen viejas)

**Files:** ninguno (deploy)

**⚠️ Requiere confirmación explícita del usuario antes de ejecutar el deploy.**

- [ ] **Step 1: Confirmar con el usuario que quiere publicar ahora**

Explicarle que en este punto las reglas de Firestore siguen siendo las viejas (abiertas), así que si algo del login nuevo falla para alguien, el resto del sitio sigue funcionando mientras se corrige — este paso no puede "romper" el acceso de nadie todavía.

- [ ] **Step 2: Deploy**

```bash
firebase deploy --only hosting
```

- [ ] **Step 3: Verificación manual post-deploy**

Abrir el sitio publicado (no local) y confirmar que las 6 páginas cargan sin errores de JS en consola.

---

## Task 10: Migrar las cuentas reales y verificar login

**Files:** ninguno (operación de datos vía el script de la Task 2)

**⚠️ Requiere que el usuario haya pasado el service account key y la lista usuario→email real (ver spec, "Pasos que tenés que hacer vos").**

- [ ] **Step 1: Completar `migration-scripts/usuarios-email.json`**

Con el mapeo real que pasó el usuario, formato `{ "usuario1": "email1@real.com", "usuario2": "email2@real.com" }`.

- [ ] **Step 2: Correr la migración completa**

```bash
cd migration-scripts
node migrar-usuarios.js
```

Revisar la salida línea por línea: cada usuario tiene que terminar en `✅ ... importado` o `↷ ... ya existe` — cualquier `⚠️` o `❌` hay que resolverlo antes de seguir (usuario sin email en el JSON, sin passHash, o fallo de `importUsers`).

- [ ] **Step 3: Verificar login con al menos una cuenta real de cada rol**

Pedirle al usuario (o a una persona de confianza de cada rol) que inicie sesión con su usuario y contraseña de siempre en el sitio ya publicado (Task 9) — confirmar que entra sin tener que cambiar nada, en al menos: una cuenta `admin` y una cuenta `viewer`, y si existe alguna cuenta con `permisos` de tipo `'viewer'` en algún módulo específico, probar también esa combinación.

---

## Task 11: Publicar las reglas de Firestore nuevas (corte final)

**Files:** ninguno (deploy)

**⚠️ Requiere confirmación explícita del usuario antes de ejecutar — es el único paso que puede bloquear el acceso si algo quedó mal configurado.**

- [ ] **Step 1: Confirmar con el usuario**

Recordarle que es reversible al instante (alcanza con volver a publicar la versión anterior de `firestore.rules`, que sigue en el historial de git) y que ya se probó el login con cuentas reales en la Task 10.

- [ ] **Step 2: Deploy**

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 3: Verificación manual de las 6 páginas**

Con al menos una cuenta real, entrar a cada una de las 6 páginas y confirmar que cargan sus datos correctamente (no quedan en "Cargando…" ni tiran error de permisos en consola). Confirmar también que `buscador_permisos.html` sigue mostrando resultados de búsqueda SIN estar logueado (pestaña "Buscar", no "Carga").

- [ ] **Step 4: Si algo falla — rollback inmediato**

```bash
git log --oneline -- firestore.rules   # ubicar el commit de la Task 1 y el anterior a él
git show <commit-anterior-a-la-migracion>:firestore.rules > firestore.rules
firebase deploy --only firestore:rules
```

Después, diagnosticar con calma (sin presión de tener el sitio caído) antes de reintentar.

---

## Task 12: Limpieza — borrar la colección vieja de usuarios

**Files:** ninguno (operación de datos)

**⚠️ Requiere confirmación explícita del usuario — recién después de que la Task 11 esté confirmada funcionando por unos días.**

- [ ] **Step 1: Confirmar con el usuario que ya pasó suficiente tiempo de uso normal sin problemas**

- [ ] **Step 2: Borrar los documentos viejos**

Desde la consola de Firebase (Firestore → colección `usuarios` vieja) o con un script chico ad-hoc con el Admin SDK, borrar todos los documentos cuyo id sea un `username` (no un uid) — se distinguen porque tienen el campo `passHash`, que los documentos nuevos ya no tienen. Confirmar visualmente en la consola antes de borrar cuáles son.

- [ ] **Step 3: Commit final de housekeeping (si corresponde tocar algo en el repo)**

Si en el camino quedó algún comentario o referencia obsoleta a la colección vieja en el código, limpiarla acá. Actualizar `README.md` para reflejar el nuevo esquema de login (Firebase Authentication + `login_lookup` + `usuarios/{uid}`) en vez de las instrucciones viejas de `allow write: if true` en `usuarios`.

```bash
git add README.md
git commit -m "README: documentar el login sobre Firebase Authentication"
```

---

## Self-Review

**Cobertura del spec:** cada sección de `docs/superpowers/specs/2026-08-26-firebase-auth-migration-design.md` tiene tarea: modelo de datos nuevo → Task 1/2; script de migración → Task 2; flujo de login nuevo → Tasks 3-7; panel admin → Task 7; reglas nuevas → Task 1; consolidación de código → Tasks 3-7 (una sola implementación de login, con la excepción documentada y justificada de `buscador_permisos.html`, que preserva su comportamiento público-por-diseño); plan de despliegue → Tasks 8-12; pasos del usuario → señalados explícitamente en Tasks 8, 10, 11.

**Placeholders:** ninguno — cada Task trae el código completo a escribir, sin "TBD" ni "hacer luego". Las dos únicas verificaciones manuales que dependen de un valor real desconocido hoy (el algoritmo exacto de import de hash aceptado por Firebase, y la lista real de emails) están explícitamente resueltas por el orden del plan: se prueban primero con una cuenta descartable (Task 8) antes de tocar cuentas reales (Task 10).

**Consistencia de tipos/nombres:** `loggedUser` en todas las páginas mantiene la misma forma (`{uid, username, nombre, role, modulos, permisos}`); `window._f*`/`window._auth` se nombran igual en las Tasks 4-7; `MODULOS_DISPONIBLES` en Task 7 coincide con los `id` de `MODULES` y con los nombres de módulo usados en `firestore.rules` (Task 1) y en `MODULO_ID` de cada página (Tasks 4-6).
