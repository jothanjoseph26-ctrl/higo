const path = require('path');
const sharp = require(path.resolve(__dirname, '../../node_modules/.pnpm/sharp@0.35.2/node_modules/sharp'));

const file = process.argv[2];

async function main() {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowHasContent = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      // content = not transparent and not near-white
      if (a > 30 && !(r > 245 && g > 245 && b > 245)) {
        rowHasContent[y] = true;
        break;
      }
    }
  }
  // Cluster into bands
  const bands = [];
  let start = null;
  for (let y = 0; y < height; y++) {
    if (rowHasContent[y] && start === null) start = y;
    if (!rowHasContent[y] && start !== null) {
      bands.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, height - 1]);
  // merge bands separated by small gaps (<8px)
  const merged = [];
  for (const b of bands) {
    if (merged.length && b[0] - merged[merged.length - 1][1] < 10) {
      merged[merged.length - 1][1] = b[1];
    } else {
      merged.push([...b]);
    }
  }
  console.log(`${file}\n  size: ${width}x${height}\n  bands:`, merged.map(([s, e]) => `${s}-${e} (h=${e - s})`).join(', '));
}

main().catch(e => console.error('ERR', e.message));
