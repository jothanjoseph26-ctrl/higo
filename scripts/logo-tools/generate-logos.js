const path = require('path');
const sharp = require(path.resolve(__dirname, '../../node_modules/.pnpm/sharp@0.35.2/node_modules/sharp'));

const PASSENGER_GREEN = { r: 11, g: 110, b: 79 };   // #0B6E4F
const DRIVER_NAVY = { r: 10, g: 37, b: 64 };        // #0A2540
const ACCENT_ORANGE = { r: 255, g: 122, b: 0 };      // #FF7A00

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const [greenH, greenS] = rgbToHsl(PASSENGER_GREEN.r, PASSENGER_GREEN.g, PASSENGER_GREEN.b);
const [navyH, navyS] = rgbToHsl(DRIVER_NAVY.r, DRIVER_NAVY.g, DRIVER_NAVY.b);
const [orangeH, orangeS] = rgbToHsl(ACCENT_ORANGE.r, ACCENT_ORANGE.g, ACCENT_ORANGE.b);

function isGreenish(r, g, b) {
  return g > r + 15 && r < 100 && g < 160 && g >= b;
}
function isOrangeish(r, g, b) {
  return r > 180 && r > g + 40 && g > b + 40;
}

/**
 * Recolor green pixels to `variant` ('passenger'|'driver'|'white') brand
 * color and orange pixels to the canonical accent orange, preserving each
 * pixel's original lightness (keeps shading/highlights from the source art).
 * 'white' flattens the green mark to solid white (s=0) -- for icon
 * foregrounds meant to sit on a colored (not white) background.
 */
async function recolor(inputBuffer, variant) {
  const targetH = variant === 'driver' ? navyH : greenH;
  const targetS = variant === 'white' ? 0 : variant === 'driver' ? navyS : greenS;
  const img = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 5) continue;
    if (isGreenish(r, g, b)) {
      const [, , l] = rgbToHsl(r, g, b);
      const targetL = variant === 'white' ? 0.96 : l;
      const [nr, ng, nb] = hslToRgb(targetH, targetS, targetL);
      data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    } else if (isOrangeish(r, g, b)) {
      const [, , l] = rgbToHsl(r, g, b);
      const [nr, ng, nb] = hslToRgb(orangeH, orangeS, l);
      data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function cropWithPadding(file, box, paddingRatio = 0.06) {
  const padX = Math.round(box.w * paddingRatio);
  const padY = Math.round(box.h * paddingRatio);
  const buf = await sharp(file)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .extend({ top: padY, bottom: padY, left: padX, right: padX, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return buf;
}

async function onWhiteBg(buf) {
  const meta = await sharp(buf).metadata();
  return sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: '#ffffff' } })
    .composite([{ input: buf }])
    .png()
    .toBuffer();
}

async function squareIconCanvas(buf, canvasSize, contentRatio, background) {
  const target = Math.round(canvasSize * contentRatio);
  const resized = await sharp(buf).resize({ width: target, height: target, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let canvas = sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: background || { r: 0, g: 0, b: 0, alpha: 0 } } });
  return canvas.composite([{ input: resized, gravity: 'center' }]).png().toBuffer();
}

const BASE44_ASSETS = 'C:/Users/flood/hiconnect/Base44/src/assets';
const LIGHT_WORDMARK = `${BASE44_ASSETS}/rectangular-logo.png`;
const LIGHT_BOX = { x: 251, y: 243, w: 1002, h: 373 };
const DARK_WORDMARK = `${BASE44_ASSETS}/rectangulat-logo-4-dark-bg.png`;
const DARK_BOX = { x: 150, y: 152, w: 1387, h: 496 };
const SQUARE_SOURCE = `${BASE44_ASSETS}/box-4-white-bg-logo.png`;
const SQUARE_BOX = { x: 85, y: 65, w: 374, h: 461 };
const ICON_ONLY_BOX = { x: 161, y: 65, w: 206, h: 249 };

const OUT = {
  passenger: 'C:/Users/flood/hiconnect/higo-platform/apps/passenger-app/src/assets',
  driver: 'C:/Users/flood/hiconnect/higo-platform/apps/driver-app/src/assets',
};
const ADMIN_DASHBOARD_PUBLIC = 'C:/Users/flood/hiconnect/higo-platform/apps/admin-dashboard/public';

async function main() {
  for (const variant of ['passenger', 'driver']) {
    const outDir = OUT[variant];

    // logo-rectangular.png (light bg wordmark)
    const wm = await cropWithPadding(LIGHT_WORDMARK, LIGHT_BOX, 0.08);
    const wmColored = await recolor(wm, variant);
    await sharp(await onWhiteBg(wmColored)).toFile(`${outDir}/logo-rectangular.png`);

    // logo-rectangular-dark.png (dark bg wordmark -- white+orange, only orange needs canonical alignment)
    const dwm = await cropWithPadding(DARK_WORDMARK, DARK_BOX, 0.08);
    const dwmColored = await recolor(dwm, variant); // green-check is no-op here (no green pixels), orange gets aligned
    await sharp(dwmColored).toFile(`${outDir}/logo-rectangular-dark.png`);

    // logo-square.png (icon + wordmark + "Powered by Hiconnect", stacked)
    const sq = await cropWithPadding(SQUARE_SOURCE, SQUARE_BOX, 0.08);
    const sqColored = await recolor(sq, variant);
    await sharp(await onWhiteBg(sqColored)).toFile(`${outDir}/logo-square.png`);

    // icon mark only, recolored, for app-icon.png / adaptive-icon.png
    const iconOnly = await cropWithPadding(SQUARE_SOURCE, ICON_ONLY_BOX, 0.10);
    const iconColored = await recolor(iconOnly, variant);
    const iconWhite = await recolor(iconOnly, 'white');

    // app-icon.png: 1024x1024, white background, colored mark (iOS requires
    // opaque, no alpha -- and iOS/Play-listing icons are conventionally a
    // mark-on-white card, so this one is unaffected by the launcher fix below)
    const appIcon = await squareIconCanvas(iconColored, 1024, 0.62, { r: 255, g: 255, b: 255, alpha: 1 });
    await sharp(appIcon).toFile(`${outDir}/app-icon.png`);

    // adaptive-icon.png: white mark on transparent -- app.json now sets
    // backgroundColor to the brand color per variant (see app.json edits),
    // so the Android home-screen/launcher icon reads as a branded colored
    // tile instead of "logo mark stranded on a flat white circle."
    const adaptiveIcon = await squareIconCanvas(iconWhite, 1024, 0.55, { r: 0, g: 0, b: 0, alpha: 0 });
    await sharp(adaptiveIcon).toFile(`${outDir}/adaptive-icon.png`);

    console.log(`${variant}: wrote logo-rectangular.png, logo-rectangular-dark.png, logo-square.png, app-icon.png, adaptive-icon.png`);
  }

  // admin-dashboard (separate web app, keeps the original green scheme)
  {
    const wm = await cropWithPadding(LIGHT_WORDMARK, LIGHT_BOX, 0.08);
    const wmColored = await recolor(wm, 'passenger');
    await sharp(await onWhiteBg(wmColored)).toFile(`${ADMIN_DASHBOARD_PUBLIC}/logo-rectangular.png`);

    const dwm = await cropWithPadding(DARK_WORDMARK, DARK_BOX, 0.08);
    const dwmColored = await recolor(dwm, 'passenger');
    await sharp(dwmColored).toFile(`${ADMIN_DASHBOARD_PUBLIC}/logo-rectangular-dark.png`);

    const sq = await cropWithPadding(SQUARE_SOURCE, SQUARE_BOX, 0.08);
    const sqColored = await recolor(sq, 'passenger');
    await sharp(await onWhiteBg(sqColored)).toFile(`${ADMIN_DASHBOARD_PUBLIC}/logo-square.png`);

    console.log('admin-dashboard: wrote logo-rectangular.png, logo-rectangular-dark.png, logo-square.png');
  }
}

main().catch((e) => { console.error('FAILED', e); process.exit(1); });
