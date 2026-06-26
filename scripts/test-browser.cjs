const { chromium } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4200';
const API_URL = process.env.API_URL || 'http://localhost:3000';

(async () => {
  console.log('Running API smoke checks first...');
  const smokeScript = path.join(__dirname, 'smoke-api.cjs');
  const smoke = spawnSync(process.execPath, [smokeScript], {
    stdio: 'inherit',
    env: { ...process.env, BASE: API_URL },
  });
  if (smoke.status !== 0) {
    console.error('API smoke checks failed — aborting browser probe.');
    process.exit(smoke.status || 1);
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.error(`[PAGE ERROR]`, err);
  });

  try {
    console.log(`Navigating to ${BASE_URL}/...`);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Navigation complete. Waiting 3 seconds for hydration...');
    await page.waitForTimeout(3000);

    const content = await page.content();
    console.log('Page content length:', content.length);
    console.log('Root HTML element innerHTML:');
    const rootHtml = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML : 'No root element found';
    });
    console.log(rootHtml);
  } catch (error) {
    console.error('Error occurred during test:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
