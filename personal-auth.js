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
