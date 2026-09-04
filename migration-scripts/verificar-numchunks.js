// Verifica (y opcionalmente corrige) el contador numChunks de una
// colección chunked (nomina, novedades). Compara <col>_meta/index.numChunks
// contra los documentos que EXISTEN de verdad en <col>_chunks — si un
// import se superpuso con otra escritura, ese contador puede quedar
// atrasado y esconder chunks reales (fue lo que pasó con "novedades" en
// septiembre 2026: numChunks decía 8 habiendo 26 chunks con 12660
// registros). Sólo lee por defecto; hace falta --fix para escribir.
//
// Uso:
//   node verificar-numchunks.js novedades
//   node verificar-numchunks.js novedades --fix
//   node verificar-numchunks.js nomina
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

const coleccion = process.argv[2];
const aplicarFix = process.argv.includes('--fix');

if (!coleccion) {
  console.error('Uso: node verificar-numchunks.js <coleccion> [--fix]');
  console.error('Ejemplo: node verificar-numchunks.js novedades');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const metaRef = db.doc(`${coleccion}_meta/index`);
  const metaSnap = await metaRef.get();
  const numChunksDeclarado = metaSnap.exists ? (metaSnap.data().numChunks || 0) : 0;

  const chunksSnap = await db.collection(`${coleccion}_chunks`).get();
  const indices = chunksSnap.docs.map(d => parseInt(d.id.replace('chunk_', ''), 10));
  const maxIdx = indices.length ? Math.max(...indices) : -1;
  const numChunksCorrecto = maxIdx + 1;

  const faltantes = [];
  for (let i = 0; i < numChunksCorrecto; i++) {
    if (!indices.includes(i)) faltantes.push(i);
  }

  let totalRegistros = 0;
  let totalDeclarados = 0;
  chunksSnap.docs.forEach(d => {
    const n = Object.keys(d.data().registros || {}).length;
    totalRegistros += n;
    const idx = parseInt(d.id.replace('chunk_', ''), 10);
    if (idx < numChunksDeclarado) totalDeclarados += n;
  });

  console.log(`== ${coleccion} ==`);
  console.log('numChunks declarado en Firestore:', numChunksDeclarado, '→', totalDeclarados, 'registros visibles para la app');
  console.log('Chunks reales encontrados:', chunksSnap.size, '(índices 0 a', maxIdx + ')');
  console.log('numChunks correcto:', numChunksCorrecto, '→', totalRegistros, 'registros reales');
  console.log('Huecos en la secuencia:', faltantes.length ? faltantes.join(', ') : 'ninguno');

  if (numChunksDeclarado === numChunksCorrecto) {
    console.log('✅ Ya está correcto, nada para arreglar.');
    return;
  }

  console.log(`⚠️  Desalineado: ${totalRegistros - totalDeclarados} registros invisibles para la app.`);
  if (!aplicarFix) {
    console.log('Corré de nuevo con --fix para corregirlo (no borra ni modifica ningún registro, sólo el contador).');
    return;
  }

  await metaRef.set({ numChunks: numChunksCorrecto }, { merge: true });
  const verif = await metaRef.get();
  console.log('✅ numChunks actualizado a', verif.data().numChunks);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
