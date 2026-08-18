const { chromium } = require('./node_modules/.pnpm/playwright@1.61.0/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'store-screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TOKEN = process.env.HIGO_TOKEN;
if (!TOKEN) {
  console.error('HIGO_TOKEN env var required');
  process.exit(1);
}

async function capturePassenger() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('https://ride.hiconnectgo.com/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('base44_access_token', token);
  }, TOKEN);

  await page.goto('https://ride.hiconnectgo.com/home', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT_DIR, 'passenger-1-home.png') });
  console.log('captured home');

  const tripsTab = page.getByText('Trips', { exact: true });
  if (await tripsTab.isVisible().catch(() => false)) {
    await tripsTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'passenger-2-trips.png') });
    console.log('captured trips');
  }

  const homeTab = page.getByText('Home', { exact: true });
  if (await homeTab.isVisible().catch(() => false)) {
    await homeTab.click();
    await page.waitForTimeout(1500);
    const whereTo = page.getByPlaceholder('Where to?');
    if (await whereTo.isVisible().catch(() => false)) {
      await whereTo.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, 'passenger-3-search.png') });
      console.log('captured search');
    }
  }

  await browser.close();
  console.log('Passenger screenshots done');
}

capturePassenger().catch(e => { console.error('FAILED', e); process.exit(1); });
