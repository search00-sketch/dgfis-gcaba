// Genera los íconos PWA como PNG de color sólido, sin depender de ninguna
// librería de imágenes (no hay ImageMagick/canvas/sharp disponibles en
// este entorno) — arma el PNG a mano: firma + chunks IHDR/IDAT/IEND, con
// la data de píxeles comprimida vía zlib.deflateSync (built-in de Node).
// Se corre una sola vez; los PNG resultantes se comitean al repo. Volver
// a correr este script si hace falta cambiar el color o el tamaño.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function solidColorPng(size, [r, g, b]) {
  const width = size, height = size;
  const bytesPerPixel = 3; // color type 2 = truecolor RGB, sin alpha
  const rowBytes = 1 + width * bytesPerPixel; // 1 byte de filtro + píxeles
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filtro "None"
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * bytesPerPixel;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idatData = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // profundidad de bit
  ihdr[9] = 2;  // tipo de color: RGB
  ihdr[10] = 0; // método de compresión
  ihdr[11] = 0; // método de filtro
  ihdr[12] = 0; // entrelazado

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BRAND_COLOR = [0x1a, 0x3a, 0x5c]; // --c-brand del sitio
const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  const png = solidColorPng(size, BRAND_COLOR);
  fs.writeFileSync(path.join(outDir, file), png);
  console.log('wrote', file, png.length, 'bytes');
}
