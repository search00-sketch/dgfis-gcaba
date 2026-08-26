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
    return 'sin_email';
  }
  if (!datos.passHash || typeof datos.passHash !== 'string') {
    console.error(`⚠️  ${username}: no tiene passHash válido — se salteó.`);
    return 'sin_hash';
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
      return 'fallo_import';
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
  return 'migrado';
}

async function main() {
  const snap = await db.collection('usuarios').get();
  console.log(`Encontrados ${snap.size} documentos en la colección vieja "usuarios".`);
  const contador = { migrado: 0, ya_migrado: 0, sin_email: 0, sin_hash: 0, fallo_import: 0 };
  for (const d of snap.docs) {
    const username = d.id;
    if (soloUsuario && username !== soloUsuario) continue;
    const datos = d.data();
    // Un doc ya migrado (esquema nuevo, doc id = uid) siempre tiene el campo
    // "username" (lo escribe este mismo script); los docs viejos (doc id =
    // username) nunca lo tienen. Esto distingue "ya migrado" (salteo normal,
    // esperable si el script se corre más de una vez) de "doc viejo sin
    // passHash" (problema real: un usuario legítimo que no se migraría si
    // lo salteáramos en silencio).
    if (datos.username) {
      console.log(`↷ ${username}: ya es un perfil migrado (tiene "username") — se salteó.`);
      contador.ya_migrado++;
      continue;
    }
    if (!datos.passHash) {
      console.error(`⚠️  ${username}: no tiene passHash y no parece un perfil ya migrado (falta "username") — revisar a mano. Se salteó.`);
      contador.sin_hash++;
      continue;
    }
    const resultado = await migrarUsuario(username, datos);
    contador[resultado] = (contador[resultado] || 0) + 1;
  }
  console.log(`Listo. ${contador.migrado} migrados, ${contador.ya_migrado} ya migrados (salteo normal), ${contador.sin_email} sin email, ${contador.sin_hash} sin passHash (revisar), ${contador.fallo_import} fallos de importación.`);
  if (contador.sin_email > 0 || contador.sin_hash > 0 || contador.fallo_import > 0) {
    console.error('⚠️  Hubo usuarios que NO se migraron correctamente — revisar los mensajes de arriba antes de dar la migración por terminada.');
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
