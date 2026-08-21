// ============================================================
//  MENÚ DE NAVEGACIÓN ENTRE MÓDULOS
//  Compartido por gestion_personal.html, novedades_personal.html
//  y asignacion_zonas.html. No depende de Firebase.
// ============================================================
const NAV_MODULES=[
  {id:"permisos",icon:"🔍",title:"Buscador de Permisos",url:"buscador_permisos.html"},
  {id:"estadisticas",icon:"📊",title:"Estadísticas — Actas",url:"estadisticas_actas.html"},
  {id:"personal",icon:"👥",title:"Gestión de Personal",url:"gestion_personal.html"},
  {id:"novedades",icon:"📋",title:"Novedades de Personal",url:"novedades_personal.html"},
  {id:"asignacion",icon:"📍",title:"Asignación de Zonas",url:"asignacion_zonas.html"},
  {id:"relevamientos",icon:"🗂️",title:"Relevamientos Operativos",url:"relevamientos_operativos.html"},
];
function toggleNavMenu(e){
  if(e)e.stopPropagation();
  const m=document.getElementById("navMenu");
  if(!m)return;
  if(m.style.display==="block"){m.style.display="none";return;}
  renderNavMenu();
  m.style.display="block";
}
function renderNavMenu(){
  const m=document.getElementById("navMenu");
  if(!m)return;
  // Se muestran todos los módulos siempre (no sólo los habilitados para el
  // usuario actual) para poder viajar rápido entre páginas — cada página de
  // destino ya valida su propio acceso al cargar (restaurarSesion en
  // personal-auth.js), así que esto no abre nada que esa página no controle.
  const current=location.pathname.split("/").pop();
  const items=NAV_MODULES;
  m.innerHTML=(items.length?items.map(x=>
    '<a href="'+x.url+'" class="'+(x.url===current?"current":"")+'"><span>'+x.icon+'</span><span>'+x.title+'</span></a>'
  ).join(""):'<div class="nav-empty">Sin otros módulos habilitados</div>')+
  '<a href="index.html" class="nav-portal">🏛️<span>Portal</span></a>';
}
document.addEventListener("click",function(e){
  const dd=document.querySelector(".nav-drop");
  const menu=document.getElementById("navMenu");
  if(menu&&dd&&!dd.contains(e.target))menu.style.display="none";
});
