import { test, expect } from '@playwright/test';

/** Must match apps/api/prisma/seed.js defaults */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hiconnect.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HiGo@Admin2024';

const KPI_LABELS = [
  'Active Trips',
  'Online Drivers',
  'Approved Drivers',
  'Total Passengers',
  "Today's Revenue",
  'Commission (5%)',
  'Open Disputes',
  'KYC Pending Queue',
];

test.describe('Admin dashboard', () => {
  test('login → dashboard KPIs → drivers list', async ({ page }) => {
    // 1. Admin login flow
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'HiGo Abuja Control Room' })).toBeVisible();

    await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Operations Overview' })).toBeVisible({
      timeout: 30_000,
    });

    // 2. Dashboard overview KPI elements
    for (const label of KPI_LABELS) {
      await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
    }

    // 3. Drivers page — table or loading overlay
    await page.goto('/drivers');
    await expect(page.getByRole('heading', { name: 'Driver Management' })).toBeVisible();

    const table = page.locator('table');
    const loadingOverlay = page.locator('table').locator('..').locator('.animate-spin').first();

    await expect(table.or(loadingOverlay)).toBeVisible({ timeout: 30_000 });

    // Once loading finishes, table headers should be present
    await expect(page.getByRole('columnheader', { name: 'Driver Name' })).toBeVisible({
      timeout: 30_000,
    });
  });
});