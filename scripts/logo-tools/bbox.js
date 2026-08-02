const path = require('path');
const sharp = require(path.resolve(__dirname, '../../node_modules/.pnpm/sharp@0.35.2/node_modules/sharp'));

const file = process.argv[2];
const y0 = parseInt(process.argv[3] || '0', 10);
const y1 = parseInt(process.argv[4] || '-1', 10);

async function main() {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const endY = y1 === -1 ? height : y1;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = y0; y < endY; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a > 30 && !(r > 245 && g > 245 && b > 245)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log(JSON.stringify({ file, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }));
}

main().catch(e => console.error('ERR', e.message));
