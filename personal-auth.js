// ============================================================
//  AUTH — compartido por gestion_personal.html, novedades_personal.html
//  y asignacion_zonas.html.
//  Cada página debe setear window.MODULO_ID ('personal'/'novedades'/
//  'asignacion') en un <script> ANTES de cargar este archivo. Si una
//  página necesita hacer algo extra al loguearse (ej: mostrar pestañas
//  sólo-admin), define window._onLogin(loggedUser) antes de que el login
//  ocurra (no hace falta que sea antes de este script: recién se llama
//  de forma asíncrona, mucho después de que toda la página ya cargó).
// ============================================================
const MODULO_ID = window.MODULO_ID;
let loggedUser = null;
window._soloLectura = false;

// Parte SIN Firebase de restaurarSesion(): si hay una sesión con forma
// válida en localStorage, la muestra al instante (oculta el overlay, badge
// de usuario, pestañas admin-only vía _onLogin). Se llama sola, más abajo
// en este mismo archivo, apenas termina de cargar — un <script> clásico
// como este no depende de red (salvo el propio archivo, mismo origen y
// cacheado). Antes, ese "ocultar al instante" vivía sólo dentro de
// restaurarSesion(), pero esa función recién se llamaba desde el <script
// type="module"> de cada página, DESPUÉS de que ese script terminara de
// bajar el SDK de Firebase completo desde el CDN — un viaje de red que
// podía demorar y que hacía "parpadear" el popup de usuario/contraseña en
// cada cambio de pantalla (estas 3 páginas son documentos separados, no una
// SPA, así que el overlay vuelve a su estado visible por defecto en cada
// una). Devuelve la sesión ya parseada (o null) para que restaurarSesion()
// no tenga que releerla.
function mostrarSesionCacheada(){
  const saved = localStorage.getItem("dgf_session");
  if(!saved) return null;
  let parsed;
  try{
    parsed = JSON.parse(saved);
    if(!parsed||!parsed.username) throw new Error("sesión inválida");
  }catch(e){
    localStorage.removeItem("dgf_session");
    return null;
  }

  loggedUser=parsed;
  document.getElementById("loginOverlay").style.display="none";
  document.getElementById("userBadge").style.display="inline";
  document.getElementById("userBadge").textContent=loggedUser.nombre;
  actualizarPermisoUI();
  if (typeof window._onLogin === "function") window._onLogin(loggedUser);
  return parsed;
}
mostrarSesionCacheada();

// Revalida contra Firestore la sesión que mostrarSesionCacheada() ya dejó
// mostrada de forma optimista (podría haber sido editada desde la consola
// del navegador, o el usuario borrado/deshabilitado). Se llama desde el
// script módulo de cada página, una vez que window._fGetDoc/_fDoc/_db están
// listos — sólo se vuelve a mostrar el login si esta revalidación falla.
async function restaurarSesion(){
  const parsed = mostrarSesionCacheada();
  if(!parsed) return;

  try {
    const snap = await window._fGetDoc(window._fDoc(window._db,"usuarios",parsed.username));
    if(!snap.exists()) throw new Error("usuario \""+parsed.username+"\" ya no existe en Firestore");
    const data = snap.data();
    if(data.role!=="admin" && !(data.modulos&&data.modulos.includes(MODULO_ID))) throw new Error("el usuario no tiene el módulo \""+MODULO_ID+"\" habilitado");
    loggedUser={username:parsed.username,nombre:data.nombre,role:data.role,modulos:data.modulos||[],permisos:data.permisos||{}};
    localStorage.setItem("dgf_session",JSON.stringify(loggedUser));
    document.getElementById("userBadge").textContent=loggedUser.nombre;
    actualizarPermisoUI();
    if (typeof window._onLogin === "function") window._onLogin(loggedUser);
  } catch(e) {
    console.error("restaurarSesion() falló la revalidación:", e);
    loggedUser=null;
    localStorage.removeItem("dgf_session");
    document.getElementById("loginOverlay").style.display="flex";
    document.getElementById("userBadge").style.display="none";
    const err=document.getElementById("loginErr");
    if(err){err.textContent="⚠️ Se cerró tu sesión: "+e.message;err.style.display="block";}
  }
}

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

function togglePass(){const i=document.getElementById("lPass");i.type=i.type==="password"?"text":"password";}
async function sha256(t){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function doLogin(){
  const u=document.getElementById("lUser").value.trim().toLowerCase();
  const p=document.getElementById("lPass").value;
  const err=document.getElementById("loginErr");err.style.display="none";
  if(!u||!p){err.textContent="Completá usuario y contraseña.";err.style.display="block";return;}
  const btn=document.getElementById("loginBtn");btn.disabled=true;btn.textContent="Verificando…";
  try{
    const snap=await window._fGetDoc(window._fDoc(window._db,"usuarios",u));
    if(!snap.exists()){showLoginErr("Usuario o contraseña incorrectos.");return;}
    const data=snap.data();
    if(data.passHash!==await sha256(p)){showLoginErr("Usuario o contraseña incorrectos.");return;}
    if(data.role!=="admin"&&!(data.modulos&&data.modulos.includes(MODULO_ID))){showLoginErr("Sin permiso de acceso.");return;}
    loggedUser={username:u,nombre:data.nombre,role:data.role,modulos:data.modulos||[],permisos:data.permisos||{}};
    localStorage.setItem("dgf_session",JSON.stringify(loggedUser));
    document.getElementById("loginOverlay").style.display="none";
    document.getElementById("userBadge").style.display="inline";
    document.getElementById("userBadge").textContent=loggedUser.nombre;
    actualizarPermisoUI();
    if (typeof window._onLogin === "function") window._onLogin(loggedUser);
  }catch(e){showLoginErr("Error: "+e.message);}
  finally{btn.disabled=false;btn.textContent="Ingresar";}
}
function showLoginErr(m){const e=document.getElementById("loginErr");e.textContent=m;e.style.display="block";document.getElementById("lPass").value="";}
function doLogout(){loggedUser=null;localStorage.removeItem("dgf_session");location.reload();}

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
    const snap=await window._fGetDoc(window._fDoc(window._db,"usuarios",loggedUser.username));
    if(!snap.exists()||snap.data().passHash!==await sha256(actual)){
      err.textContent="La contraseña actual no es correcta.";err.style.display="block";
      return;
    }
    await window._fSetDoc(window._fDoc(window._db,"usuarios",loggedUser.username),{passHash:await sha256(nueva)},{merge:true});
    cerrarModal("modal-cambiar-pass-overlay");
    toast("✅ Contraseña actualizada.");
  }catch(e){
    err.textContent="Error: "+e.message;err.style.display="block";
  }finally{
    btn.disabled=false;btn.textContent="Guardar";
  }
}
