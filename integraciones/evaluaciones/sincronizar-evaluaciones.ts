// ============================================================================
//  Office Script — "Sincronizar evaluaciones al portal DGFIS"
//
//  Se instala DENTRO del Excel "EVALUACIÓN DE DESEMPEÑO" (Automatizar → Nuevo
//  script) y lo ejecuta el flujo de Power Automate (ver README.md de esta
//  carpeta). Lee las hojas CARGAS NUEVAS y BASE, normaliza los datos igual que
//  la carga manual de evaluaciones_desempeno.html y devuelve el CUERPO listo
//  para mandar a la API de Firestore (documents:commit): una sola escritura
//  atómica que reemplaza las evaluaciones y la BASE del portal.
//
//  No escribe nada en el Excel: sólo lee.
//
//  Qué arma:
//   evaluaciones_chunks/eval_0..N  → {n, datos:'[…]', actualizadoEn}
//   evaluaciones_chunks/base       → {n, datos:'[…]', actualizadoEn}
//   evaluaciones_chunks/eval_N+1.. → se borran (por si antes había más)
//   evaluaciones_meta/index        → chunks, count, baseCount, v, fechas,
//                                    ultimaAuto… (NO toca "cargas", el
//                                    historial de cargas manuales)
//  La versión "v" es un hash del contenido: si nada cambió desde la corrida
//  anterior, el portal no vuelve a descargar los datos.
// ============================================================================

const PROYECTO = "dgfis-gcaba";
const HOJA_EVAL = "CARGAS NUEVAS";
const HOJA_BASE = "BASE";
// Tope por documento (Firestore admite 1 MiB; los acentos ocupan 2 bytes).
const MAX_CHARS_CHUNK = 450000;
// Documentos eval_N sobrantes que se borran después del último usado.
const CHUNKS_A_LIMPIAR = 10;
const CATS: string[] = ["DESTACADO", "BUENO", "REGULAR", "INSUFICIENTE"];

interface Evaluacion {
  id: string; ini: string; fin: string; mail: string; evaluador: string;
  agente: string; sector: string; turno: string; puntaje: number | null;
  desempeno: string; obs: string; puntajeTxt?: string;
}
interface AgenteBase { nombre: string; cuit: string; area: string; puesto: string; modalidad: string; }
interface ValorFS {
  stringValue?: string; integerValue?: string;
  mapValue?: { fields: { [k: string]: ValorFS } };
}
interface Escritura {
  update?: { name: string; fields: { [k: string]: ValorFS } };
  updateMask?: { fieldPaths: string[] };
  delete?: string;
}
interface Resultado {
  cuerpo: string;        // JSON para POST …/documents:commit
  evaluaciones: number;
  agentesBase: number;
  desde: string;
  hasta: string;
  version: string;
  documentos: number;
  avisos: string;
}

function main(workbook: ExcelScript.Workbook): Resultado {
  const hE = buscarHoja(workbook, HOJA_EVAL);
  const hB = buscarHoja(workbook, HOJA_BASE);
  const valE = valoresDe(hE);
  const valB = valoresDe(hB);

  // ---- CARGAS NUEVAS ----
  const mE = mapearEncabezados(valE, {
    id: /^id$/, ini: /^hora de inicio$/, fin: /^hora de finalizacion$/, mail: /^correo electronico$/,
    evaluador: /^nombre$/, agente: /^inspector$/, sector: /^sector$/, turno: /^turno$/,
    puntaje: /^puntaje$/, desempeno: /^desempeno$/, obs: /^observaciones$/,
  }, ["id", "ini", "agente", "puntaje", "desempeno"], HOJA_EVAL);
  const evals: Evaluacion[] = [];
  let sinFecha = 0, sinAgente = 0;
  for (let i = mE.fila + 1; i < valE.length; i++) {
    const row = valE[i];
    const g = (k: string): string | number | boolean => (k in mE.map ? row[mE.map[k]] : "");
    const agente = txt(g("agente")), id = txt(g("id"));
    if (!agente && !id) continue;
    if (!agente) { sinAgente++; continue; }
    const ini = fechaExcel(g("ini"));
    if (!ini) { sinFecha++; continue; }
    const pRaw = g("puntaje");
    const pNum = txt(pRaw) === "" ? NaN : Number(txt(pRaw).replace(",", "."));
    const e: Evaluacion = {
      id: id || ini, ini, fin: fechaExcel(g("fin")), mail: txt(g("mail")), evaluador: txt(g("evaluador")),
      agente, sector: txt(g("sector")), turno: txt(g("turno")).toUpperCase(),
      puntaje: isFinite(pNum) ? pNum : null, desempeno: catNorm(g("desempeno")),
      obs: String(g("obs") ?? "").trim(),
    };
    if (e.puntaje === null && txt(pRaw)) e.puntajeTxt = txt(pRaw);
    evals.push(e);
  }
  if (!evals.length) throw new Error(`La hoja "${HOJA_EVAL}" no tiene evaluaciones: no se sincroniza nada.`);

  // ---- BASE ----
  const mB = mapearEncabezados(valB, {
    nombre: /^apellido y nombre$/, cuit: /^cuit$/, area: /^area$/, puesto: /^puesto$/, modalidad: /^modalidad$/,
  }, ["nombre"], HOJA_BASE);
  const base: AgenteBase[] = [];
  const vistos: string[] = [];
  for (let i = mB.fila + 1; i < valB.length; i++) {
    const row = valB[i];
    const g = (k: string): string => (k in mB.map ? txt(row[mB.map[k]]) : "");
    const nombre = g("nombre");
    if (!nombre) continue;
    const k = claveNombre(nombre);
    if (vistos.indexOf(k) >= 0) continue;
    vistos.push(k);
    base.push({
      nombre, cuit: g("cuit").replace(/\D/g, ""), area: g("area").toUpperCase(),
      puesto: g("puesto").toUpperCase(), modalidad: g("modalidad").toUpperCase(),
    });
  }

  // ---- Armado de la escritura ----
  const chunks = partir(evals);
  const fechas = evals.map(e => e.ini.slice(0, 10)).sort();
  const desde = fechas[0], hasta = fechas[fechas.length - 1];
  const datosBase = JSON.stringify(base);
  const version = "auto-" + hash(chunks.map(c => c.datos).join("|") + "#" + datosBase);
  const ahora = new Date().toISOString();
  const raiz = `projects/${PROYECTO}/databases/(default)/documents`;

  const writes: Escritura[] = [];
  chunks.forEach((c, i) => writes.push({
    update: { name: `${raiz}/evaluaciones_chunks/eval_${i}`, fields: { n: int(c.n), datos: str(c.datos), actualizadoEn: str(ahora) } },
  }));
  writes.push({ update: { name: `${raiz}/evaluaciones_chunks/base`, fields: { n: int(base.length), datos: str(datosBase), actualizadoEn: str(ahora) } } });
  for (let i = chunks.length; i < chunks.length + CHUNKS_A_LIMPIAR; i++) {
    writes.push({ delete: `${raiz}/evaluaciones_chunks/eval_${i}` });
  }
  const meta: { [k: string]: ValorFS } = {
    chunks: int(chunks.length), count: int(evals.length), baseCount: int(base.length), v: str(version),
    primeraFecha: str(desde), ultimaFecha: str(hasta), archivo: str(workbook.getName()),
    actualizadoEn: str(ahora), actualizadoPor: str("Power Automate"),
    ultimaAuto: { mapValue: { fields: {
      en: str(ahora), evaluaciones: int(evals.length), base: int(base.length),
      desde: str(desde), hasta: str(hasta), version: str(version), archivo: str(workbook.getName()),
    } } },
  };
  writes.push({
    update: { name: `${raiz}/evaluaciones_meta/index`, fields: meta },
    updateMask: { fieldPaths: Object.keys(meta) },   // conserva "cargas"
  });

  const avisos: string[] = [];
  if (sinFecha) avisos.push(`${sinFecha} filas sin "Hora de inicio" (ignoradas)`);
  if (sinAgente) avisos.push(`${sinAgente} filas sin INSPECTOR (ignoradas)`);
  return {
    cuerpo: JSON.stringify({ writes }), evaluaciones: evals.length, agentesBase: base.length,
    desde, hasta, version, documentos: chunks.length + 1, avisos: avisos.join("; "),
  };
}

// ---------------------------------------------------------------- utilidades
function buscarHoja(wb: ExcelScript.Workbook, nombre: string): ExcelScript.Worksheet {
  const h = wb.getWorksheets().find(s => norm(s.getName()) === norm(nombre));
  if (!h) throw new Error(`No existe la hoja "${nombre}". Hojas: ${wb.getWorksheets().map(s => s.getName()).join(", ")}`);
  return h;
}
function valoresDe(h: ExcelScript.Worksheet): (string | number | boolean)[][] {
  const r = h.getUsedRange(true);
  if (!r) throw new Error(`La hoja "${h.getName()}" está vacía.`);
  return r.getValues();
}
function mapearEncabezados(
  vals: (string | number | boolean)[][], defs: { [k: string]: RegExp }, req: string[], hoja: string
): { map: { [k: string]: number }, fila: number } {
  for (let i = 0; i < Math.min(10, vals.length); i++) {
    const heads = vals[i].map(h => norm(h));
    const map: { [k: string]: number } = {};
    Object.keys(defs).forEach(k => { const j = heads.findIndex(h => defs[k].test(h)); if (j >= 0) map[k] = j; });
    if (req.every(k => k in map)) return { map, fila: i };
  }
  throw new Error(`En la hoja "${hoja}" no encontré los encabezados esperados (${req.join(", ")}).`);
}
function norm(s: string | number | boolean): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function claveNombre(s: string): string { return norm(s).replace(/\s*,[\s,]*/g, ", ").replace(/,\s*$/, "").trim(); }
function txt(v: string | number | boolean): string { return String(v ?? "").replace(/\s+/g, " ").trim(); }
function catNorm(v: string | number | boolean): string {
  const n = norm(v).toUpperCase();
  if (!n) return "";
  return CATS.find(c => n === c) || CATS.find(c => n.indexOf(c) >= 0) || n;
}
const pad = (n: number | string): string => String(n).padStart(2, "0");
// Fecha/hora de Excel (número de serie) → "AAAA-MM-DD HH:MM", hora local de la planilla.
function fechaExcel(v: string | number | boolean): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && isFinite(v)) {
    return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 16).replace("T", " ");
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}` + (m[4] !== undefined ? ` ${pad(m[4])}:${m[5]}` : "");
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}` + (m[4] !== undefined ? ` ${m[4]}:${m[5]}` : "");
  return "";
}
// Parte las evaluaciones en arrays JSON (texto) de hasta MAX_CHARS_CHUNK.
function partir(evals: Evaluacion[]): { datos: string, n: number }[] {
  const out: { datos: string, n: number }[] = [];
  let act: string[] = [], tam = 2;
  const cerrar = () => { out.push({ datos: "[" + act.join(",") + "]", n: act.length }); act = []; tam = 2; };
  evals.forEach(e => {
    const j = JSON.stringify(e);
    if (tam + j.length + 1 > MAX_CHARS_CHUNK && act.length) cerrar();
    act.push(j); tam += j.length + 1;
  });
  if (act.length) cerrar();
  return out;
}
function str(v: string): ValorFS { return { stringValue: v }; }
function int(n: number): ValorFS { return { integerValue: String(n) }; }
// Hash de 53 bits (cyrb53) para la versión del contenido.
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
