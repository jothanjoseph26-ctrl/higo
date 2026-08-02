const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '../../node_modules/.pnpm/sharp@0.35.2/node_modules/sharp'));

async function main() {
  const targets = [
    {
      variant: 'passenger',
      pngFile: 'C:/Users/flood/hiconnect/higo-platform/apps/passenger-app/src/assets/adaptive-icon.png',
      svgOut: 'C:/Users/flood/hiconnect/higo-platform/apps/passenger-app/src/assets/passenger-icon.svg',
    },
    {
      variant: 'driver',
      pngFile: 'C:/Users/flood/hiconnect/higo-platform/apps/driver-app/src/assets/adaptive-icon.png',
      svgOut: 'C:/Users/flood/hiconnect/higo-platform/apps/driver-app/src/assets/driver-icon.svg',
    },
  ];

  for (const t of targets) {
    const buf = await sharp(t.pngFile).png().toBuffer();
    const b64 = buf.toString('base64');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n  <image width="1024" height="1024" href="data:image/png;base64,${b64}"/>\n</svg>\n`;
    fs.writeFileSync(t.svgOut, svg, 'utf8');
    console.log(`wrote ${t.svgOut} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((e) => { console.error('FAILED', e); process.exit(1); });
