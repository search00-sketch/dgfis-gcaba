#!/usr/bin/env node
// generate-config.js
// Leer .env y generar config.js con las variables de Firebase
// Ejecutar: node generate-config.js

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const configPath = path.join(__dirname, 'config.js');

if (!fs.existsSync(envPath)) {
  console.error('ERROR: No se encontró el archivo .env');
  console.error('Copiá .env.example a .env y completá los valores.');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const vars = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key, ...valueParts] = trimmed.split('=');
  vars[key.trim()] = valueParts.join('=').trim();
}

const config = `// config.js — Generado automáticamente por generate-config.js
// NO editar manualmente ni subir a repositorios públicos.
const FIREBASE_CONFIG = {
  apiKey: "${vars.FIREBASE_API_KEY || ''}",
  authDomain: "${vars.FIREBASE_AUTH_DOMAIN || ''}",
  projectId: "${vars.FIREBASE_PROJECT_ID || ''}",
  storageBucket: "${vars.FIREBASE_STORAGE_BUCKET || ''}",
  messagingSenderId: "${vars.FIREBASE_MESSAGING_SENDER_ID || ''}",
  appId: "${vars.FIREBASE_APP_ID || ''}"
};
`;

fs.writeFileSync(configPath, config, 'utf8');
console.log('✅ config.js generado correctamente.');
console.log('   Asegurate de agregar config.js a tu .gitignore.');
