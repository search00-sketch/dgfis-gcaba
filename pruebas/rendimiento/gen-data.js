// Datos sintéticos realistas: ~570 personas, ~10.000 novedades, actas, permisos.
function rnd(seed){return()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};}
const R=rnd(7);
const TURNOS=["Turno Mañana","Turno Tarde","Turno Noche","SADOFE Diurno","SADOFE Noche","Administrativo","Gerencia"];
const TIPOS=["Presente","Licencia Médica","Licencia Ordinaria","Ausencia","Llegada tarde","Retiro anticipado","Compensatorio","Otro"];
const ZONAS=["ONCE","AVELLANEDA","LINIERS","CONSTITUCIÓN","RETIRO","FLORIDA","CAMINITO","SAN TELMO","PATRULLA I","PATRULLA II"];
const pad=n=>String(n).padStart(2,'0');
const isoLocal=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const hoy=new Date();hoy.setHours(12,0,0,0);
const dia=off=>{const d=new Date(hoy);d.setDate(d.getDate()+off);return isoLocal(d);};
const data={};
const nomina={};
for(let i=0;i<570;i++){const baja=R()<0.08;nomina['p'+i]={nombre:'APELLIDO'+i+' NOMBRE'+(i%37),turno:TURNOS[Math.floor(R()*5.6)],rol:R()<0.08?'Chofer':R()<0.05?'Coordinador Zonal':'Inspector',dni:String(20000000+i*7919),estado:baja?'Baja':'Activo',coordinador:'COORD '+(i%12),celular:'11'+(40000000+i),...(baja?{fechaBaja:dia(-Math.floor(R()*300))}:{})};}
const chunked=(col,obj,size)=>{const ids=Object.keys(obj);let n=0;for(let i=0;i<ids.length;i+=size){const reg={};ids.slice(i,i+size).forEach(id=>reg[id]=obj[id]);data[col+'_chunks/chunk_'+(n++)]={registros:reg};}data[col+'_meta/index']={numChunks:n};};
chunked('nomina',nomina,500);
const nov={};
for(let i=0;i<10000;i++){const tipo=TIPOS[Math.floor(R()*TIPOS.length)];const off=-Math.floor(R()*700)+20;const f=dia(off);const pid='p'+Math.floor(R()*570);const id=pid+'_'+f+'_'+i;
  const n={personaId:pid,fecha:f,tipo,detalle:R()<0.3?'detalle '+i:'',creadoPor:'admin',creadoEn:new Date(hoy.getTime()+off*864e5).toISOString()};
  if(tipo.startsWith('Licencia')){n.licIni=f;n.licFin=dia(off+Math.floor(R()*20));n.estadoLic=['Pendiente','Aprobada','Rechazada','Aprobada'][Math.floor(R()*4)];}
  if(tipo==='Compensatorio'){n.compMovimiento=['otorgado','descontado','debe'][Math.floor(R()*3)];n.compDias=1;}
  nov[id]=n;}
chunked('novedades',nov,500);
data['personal_config/zonas']={lista:ZONAS};
data['personal_config/tipos_novedad']={lista:TIPOS};
data['personal_config/feriados']={lista:[dia(5),dia(-30)],desc:{}};
data['usuarios/uid_admin']={username:'admin',nombre:'Admin Test',role:'admin',modulos:[],permisos:{}};
for(const off of [0,1]){const a={};Object.keys(nomina).forEach(id=>{if(R()<0.5)a[id]=ZONAS[Math.floor(R()*ZONAS.length)];});data['distribuciones/'+dia(off)]={asignaciones:a};}
// actas / permisos (formato array por chunk)
const actas=[];for(let i=0;i<6000;i++){actas.push({fecha:dia(-Math.floor(R()*500)),operativo:['VENTA ILEGAL','EVENTO MASIVO','PARTIDO DE FUTBOL'][Math.floor(R()*3)],zona:ZONAS[Math.floor(R()*ZONAS.length)],turno:'MAÑANA',actaSecuestro:String(100000+i),actaComprobacion:R()<0.4?String(500000+i):'0',lat:-34.6+R()*0.1,lng:-58.45+R()*0.1,direccion:'CALLE '+i,precintos:[{precinto:'P'+i,cantidad:1,articulo:'ART',categoria:['ALIMENTOS','ROPA','OTROS'][Math.floor(R()*3)]}]});}
for(let i=0;i*500<actas.length;i++)data['actas_chunks/chunk_'+i]={registros:actas.slice(i*500,i*500+500)};
data['actas_meta/index']={totalChunks:Math.ceil(actas.length/500)};
const perm=[];for(let i=0;i<8000;i++)perm.push({nombre:'TITULAR '+i+' ÑANDÚ',dni:String(30000000+i),locacion:'PARQUE '+(i%50),barrio:'PALERMO',expediente:'EX-'+i,estado:'OTORGADO'});
for(let i=0;i*1000<perm.length;i++)data['permisos_chunks/chunk_'+i]={registros:perm.slice(i*1000,i*1000+1000)};
data['permisos_meta/index']={totalChunks:Math.ceil(perm.length/1000)};
data['relevamientos_meta/index']={numChunks:0};
data['urbetrack_meta/index']={meses:{},cargas:[]};
process.stdout.write(JSON.stringify(data));
