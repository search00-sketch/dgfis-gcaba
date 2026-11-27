// Prueba de personas/chunks.js contra un Firestore simulado en memoria.
//   node pruebas/personas/chunks.mjs
import assert from 'assert';
import { ChunkedCollection } from '../../personas/chunks.js';

// --- Firestore mínimo: doc/getDoc/setDoc(merge)/updateDoc con notación de punto/deleteField/runTransaction
const DEL = Symbol('delete');
const almacen = new Map();
const key = r => r.col + '/' + r.id;
const clon = o => JSON.parse(JSON.stringify(o));
const fs = {
  doc: (_db, col, id) => ({ col, id }),
  deleteField: () => DEL,
  async getDoc(r) { const d = almacen.get(key(r)); return { exists: () => !!d, data: () => clon(d) }; },
  async setDoc(r, datos, op) { almacen.set(key(r), op && op.merge ? { ...(almacen.get(key(r)) || {}), ...clon(datos) } : clon(datos)); },
  async updateDoc(r, campos) {
    const d = almacen.get(key(r));
    if (!d) { const e = new Error('not-found'); e.code = 'not-found'; throw e; }
    Object.entries(campos).forEach(([ruta, v]) => {
      const partes = ruta.split('.'); let o = d;
      partes.slice(0, -1).forEach(p => { o = o[p] = o[p] || {}; });
      if (v === DEL) delete o[partes.at(-1)]; else o[partes.at(-1)] = clon(v);
    });
  },
  async runTransaction(_db, fn) {
    await fn({ get: r => fs.getDoc(r), set: (r, datos, op) => fs.setDoc(r, datos, op) });
  },
};
const nueva = (tam = 3) => new ChunkedCollection({ fs, db: {} }, 'p', { size: tam });

// 1) colección vacía
let c = nueva();
assert.deepStrictEqual(await c.cargar(), []);
await assert.rejects(async () => nueva().guardar({ id: '1', a: 1 }), /cargar la colección/);

// 2) altas de a una: llena el chunk 0 (tamaño 3) y abre el 1
for (const id of ['10', '11', '12', '13']) await c.guardar({ id, nombre: 'N' + id });
assert.strictEqual(c.numChunks, 2);
assert.deepStrictEqual(Object.keys(almacen.get('p_chunks/chunk_0').registros).sort(), ['10', '11', '12']);
assert.deepStrictEqual(Object.keys(almacen.get('p_chunks/chunk_1').registros), ['13']);
assert.strictEqual(almacen.get('p_meta/index').numChunks, 2);

// 3) otra "pestaña" lee todo y edita UN registro sin pisar a los demás
const otra = nueva(); const todos = await otra.cargar();
assert.strictEqual(todos.length, 4);
const r11 = todos.find(x => x.id === '11');
await c.guardar({ id: '12', nombre: 'cambio desde A', _chunk: 0 });         // A edita el 12
await otra.guardar({ ...r11, nombre: 'cambio desde B' });                    // B edita el 11 (con su foto vieja)
const final = await nueva().cargar();
assert.strictEqual(final.find(x => x.id === '12').nombre, 'cambio desde A'); // no se perdió
assert.strictEqual(final.find(x => x.id === '11').nombre, 'cambio desde B');

// 4) baja
await otra.eliminar(final.find(x => x.id === '10'));
assert.strictEqual((await nueva().cargar()).length, 3);

// 5) masivo: respeta tamaño, usa los huecos y NO baja numChunks
const m = nueva(); await m.cargar();
const lote = ['20', '21', '22', '23', '24', '25', '26'].map(id => ({ id, nombre: 'L' + id }));
await m.guardarVarios(lote);
const total = await nueva().cargar();
assert.strictEqual(total.length, 3 + 7);
const porChunk = {}; total.forEach(x => { porChunk[x._chunk] = (porChunk[x._chunk] || 0) + 1; });
assert.ok(Object.values(porChunk).every(n => n <= 3), JSON.stringify(porChunk));
assert.ok(almacen.get('p_meta/index').numChunks >= 4);
// numChunks nunca baja aunque otro escriba con una foto vieja
const vieja = nueva(); await vieja.cargar(); const antes = almacen.get('p_meta/index').numChunks;
await vieja._subirNumChunks(1);
assert.strictEqual(almacen.get('p_meta/index').numChunks, antes);

// 6) reimportar lo mismo no duplica
const m2 = nueva(); const existentes = await m2.cargar();
await m2.guardarVarios(lote.map(l => ({ ...l, _chunk: existentes.find(e => e.id === l.id)._chunk })));
assert.strictEqual((await nueva().cargar()).length, 10);

console.log('chunks: OK');
