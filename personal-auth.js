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

// Revalida la sesión guardada contra Firestore en vez de confiar a ciegas en
// localStorage (podría haber sido editado desde la consola del navegador).
// Se llama desde init(), que ya corre después de que el script módulo dejó
// listos window._fGetDoc/_fDoc/_db.
//
// Como estas 3 páginas son documentos separados (no una SPA), cada cambio de
// pantalla vuelve a mostrar el overlay de login por defecto (vía CSS) hasta
// que este chequeo termina. Si se espera el viaje a Firestore antes de
// ocultarlo, el usuario ve el popup de usuario/contraseña "parpadear" cada
// vez que navega. Por eso acá se confía primero en lo guardado en
// localStorage para ocultar el overlay al instante, y la revalidación contra
// Firestore corre después, en segundo plano — sólo se vuelve a mostrar el
// login si esa revalidación falla (sesión editada, usuario borrado, etc.).
async function restaurarSesion(){
  const saved = localStorage.getItem("dgf_session");
  if(!saved) return;
  let parsed;
  try{
    parsed = JSON.parse(saved);
    if(!parsed||!parsed.username) throw new Error("sesión inválida");
  }catch(e){
    localStorage.removeItem("dgf_session");
    return;
  }

  loggedUser=parsed;
  document.getElementById("loginOverlay").style.display="none";
  document.getElementById("userBadge").style.display="inline";
  document.getElementById("userBadge").textContent=loggedUser.nombre;
  actualizarPermisoUI();
  if (typeof window._onLogin === "function") window._onLogin(loggedUser);

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
