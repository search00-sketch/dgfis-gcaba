// Colección "en chunks" genérica: varios registros por documento para gastar
// pocas lecturas. Es el mismo esquema que ya usa el portal (X_meta/index con
// numChunks + X_chunks/chunk_N con un mapa "registros" {id: datos}), pero en
// UN solo lugar en vez de copiado en cada página.
//
//  - Cada alta/edición/baja toca sólo su clave del mapa ("registros.<id>"),
//    así dos personas editando registros distintos no se pisan.
//  - numChunks sólo sube (transacción), nunca baja: así un guardado con una
//    foto vieja no puede "esconder" chunks que existen.

// Actualiza campos con notación de punto; si el documento no existe todavía,
// lo crea vacío y reintenta.
export async function updateOrCrear(fs, ref, campos) {
  try { await fs.updateDoc(ref, campos); }
  catch (e) { await fs.setDoc(ref, {}, { merge: true }); await fs.updateDoc(ref, campos); }
}

export class ChunkedCollection {
  constructor({ fs, db }, nombre, { size = 300 } = {}) {
    this.fs = fs; this.db = db; this.nombre = nombre; this.size = size;
    this.numChunks = 0; this.cuentas = []; this.cargada = false;
  }
  _ref(col, id) { return this.fs.doc(this.db, col, id); }
  _chunkRef(i) { return this._ref(this.nombre + '_chunks', 'chunk_' + i); }

  // Lee todo: 1 lectura del índice + 1 por chunk. Devuelve [{id, _chunk, ...datos}].
  async cargar() {
    const meta = await this.fs.getDoc(this._ref(this.nombre + '_meta', 'index'));
    this.numChunks = meta.exists() ? (meta.data().numChunks || 0) : 0;
    const snaps = await Promise.all(Array.from({ length: this.numChunks }, (_, i) => this.fs.getDoc(this._chunkRef(i))));
    const recs = [];
    this.cuentas = [];
    snaps.forEach((s, i) => {
      const regs = s.exists() ? (s.data().registros || {}) : {};
      this.cuentas[i] = Object.keys(regs).length;
      Object.entries(regs).forEach(([id, d]) => recs.push({ id, _chunk: i, ...d }));
    });
    this.cargada = true;
    return recs;
  }

  async _subirNumChunks(n) {
    const ref = this._ref(this.nombre + '_meta', 'index');
    await this.fs.runTransaction(this.db, async tx => {
      const s = await tx.get(ref);
      const actual = s.exists() ? (s.data().numChunks || 0) : 0;
      if (n > actual) tx.set(ref, { numChunks: n }, { merge: true });
    });
  }
  _requiereCarga() { if (!this.cargada) throw new Error(this.nombre + ': hay que cargar la colección antes de guardar.'); }
  // Primer chunk con lugar; si todos están llenos, uno nuevo.
  _lugar() {
    for (let i = 0; i < this.cuentas.length; i++) if ((this.cuentas[i] || 0) < this.size) return i;
    return this.cuentas.length;
  }

  // Alta o edición de UN registro ({id, _chunk?, ...datos}).
  async guardar(rec) {
    this._requiereCarga();
    const { id, _chunk, ...datos } = rec;
    let idx = _chunk;
    const nuevo = idx === undefined;
    if (nuevo) idx = this._lugar();
    if (idx >= this.numChunks) { await this._subirNumChunks(idx + 1); this.numChunks = idx + 1; }
    await updateOrCrear(this.fs, this._chunkRef(idx), { ['registros.' + id]: datos });
    if (nuevo) { this.cuentas[idx] = (this.cuentas[idx] || 0) + 1; rec._chunk = idx; }
    return rec;
  }

  async eliminar(rec) {
    this._requiereCarga();
    if (rec._chunk === undefined) return;
    await updateOrCrear(this.fs, this._chunkRef(rec._chunk), { ['registros.' + rec.id]: this.fs.deleteField() });
    this.cuentas[rec._chunk] = Math.max(0, (this.cuentas[rec._chunk] || 0) - 1);
  }

  // Alta/edición masiva: UNA escritura por chunk afectado.
  async guardarVarios(lista) {
    this._requiereCarga();
    const porChunk = {};
    let maxIdx = this.numChunks - 1;
    lista.forEach(rec => {
      const { id, _chunk, ...datos } = rec;
      let idx = _chunk;
      if (idx === undefined) { idx = this._lugar(); this.cuentas[idx] = (this.cuentas[idx] || 0) + 1; rec._chunk = idx; }
      if (idx > maxIdx) maxIdx = idx;
      (porChunk[idx] = porChunk[idx] || {})['registros.' + id] = datos;
    });
    if (maxIdx + 1 > this.numChunks) { await this._subirNumChunks(maxIdx + 1); this.numChunks = maxIdx + 1; }
    await Promise.all(Object.entries(porChunk).map(([i, campos]) => updateOrCrear(this.fs, this._chunkRef(i), campos)));
  }
}
