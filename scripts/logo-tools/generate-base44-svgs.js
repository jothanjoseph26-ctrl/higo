const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '../../node_modules/.pnpm/sharp@0.35.2/node_modules/sharp'));

async function svgFromPng(pngFile, svgOut) {
  const buf = await sharp(pngFile).png().toBuffer();
  const meta = await sharp(buf).metadata();
  const b64 = buf.toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}">\n  <image width="${meta.width}" height="${meta.height}" href="data:image/png;base64,${b64}"/>\n</svg>\n`;
  fs.writeFileSync(svgOut, svg, 'utf8');
  console.log(`wrote ${svgOut} (${meta.width}x${meta.height}, ${(svg.length / 1024).toFixed(1)} KB)`);
}

const PASSENGER = 'C:/Users/flood/hiconnect/higo-platform/apps/passenger-app/src/assets';
const DRIVER = 'C:/Users/flood/hiconnect/higo-platform/apps/driver-app/src/assets';
const BASE44_ASSETS = 'C:/Users/flood/hiconnect/Base44/src/assets';

async function main() {
  // Small stacked icon+wordmark ("default" variant): passenger green (existing) + new driver navy
  await svgFromPng(`${PASSENGER}/logo-square.png`, `${BASE44_ASSETS}/higo-logo.svg`);
  await svgFromPng(`${DRIVER}/logo-square.png`, `${BASE44_ASSETS}/higo-logo-driver.svg`);

  // Wide icon+wordmark ("wide" variant): passenger green (existing) + new driver navy
  await svgFromPng(`${PASSENGER}/logo-rectangular.png`, `${BASE44_ASSETS}/rectangular-logo.svg`);
  await svgFromPng(`${DRIVER}/logo-rectangular.png`, `${BASE44_ASSETS}/rectangular-logo-driver.svg`);

  // White/transparent variant ("dark" variant, shown on colored backgrounds): color-neutral, shared by both
  await svgFromPng(`${PASSENGER}/logo-rectangular-dark.png`, `${BASE44_ASSETS}/higo-logo-white.svg`);
}

main().catch((e) => { console.error('FAILED', e); process.exit(1); });
