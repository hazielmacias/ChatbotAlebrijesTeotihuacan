const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'assets', '03_TEOTIHUACAN_-_Fuerzas_Basicas.png');
const PUBLIC = path.join(__dirname, '..', 'public');

const SIZES = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'logo-alebrijes.png', size: 256 }
];

async function main() {
  console.log('Generando favicons desde:', SOURCE);
  const meta = await sharp(SOURCE).metadata();
  console.log('Imagen fuente:', meta.width + 'x' + meta.height + 'px');

  for (const { name, size } of SIZES) {
    const out = path.join(PUBLIC, name);
    await sharp(SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 17, g: 17, b: 17, alpha: 1 }
      })
      .png({ compressionLevel: 9, quality: 90 })
      .toFile(out);
    const stat = fs.statSync(out);
    console.log('  OK', name, '(' + size + 'x' + size + ')', (stat.size / 1024).toFixed(1) + 'KB');
  }

  // Generar favicon.ico multi-resolucion (16, 32, 48)
  const icoSizes = [16, 32, 48];
  const buffers = await Promise.all(
    icoSizes.map(s =>
      sharp(SOURCE)
        .resize(s, s, { fit: 'contain', background: { r: 17, g: 17, b: 17, alpha: 1 } })
        .png()
        .toBuffer()
    )
  );

  // Construir un archivo .ICO manualmente
  const numImages = icoSizes.length;
  const headerSize = 6;
  const directoryEntrySize = 16;
  const offset = headerSize + numImages * directoryEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  let dataOffset = offset;
  const directory = Buffer.concat(
    icoSizes.map((s, i) => {
      const entry = Buffer.alloc(directoryEntrySize);
      entry.writeUInt8(s === 256 ? 0 : s, 0);
      entry.writeUInt8(s === 256 ? 0 : s, 1);
      entry.writeUInt8(0, 2);
      entry.writeUInt8(0, 3);
      entry.writeUInt16LE(1, 4);
      entry.writeUInt16LE(32, 6);
      entry.writeUInt32LE(buffers[i].length, 8);
      entry.writeUInt32LE(dataOffset, 12);
      dataOffset += buffers[i].length;
      return entry;
    })
  );

  const ico = Buffer.concat([header, directory, ...buffers]);
  const icoPath = path.join(PUBLIC, 'favicon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log('  OK favicon.ico (' + icoSizes.join(',') + ') ' + (ico.length / 1024).toFixed(1) + 'KB');

  // Generar og-image para redes sociales (1200x630 con fondo negro)
  const ogPath = path.join(PUBLIC, 'og-image.png');
  await sharp(SOURCE)
    .resize(800, 800, { fit: 'contain', background: { r: 17, g: 17, b: 17, alpha: 1 } })
    .extend({
      top: 0,
      bottom: 0,
      left: 200,
      right: 200,
      background: { r: 17, g: 17, b: 17, alpha: 1 }
    })
    .resize(1200, 630, { fit: 'contain', background: { r: 17, g: 17, b: 17, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(ogPath);
  console.log('  OK og-image.png (1200x630)');

  console.log('\nFavicons generados en public/');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
