import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { APP } from '../../src/config/app';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`spatial shell ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const externalRequests: string[] = [];
    const localOrigin = new URL(test.info().project.use.baseURL!).origin;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== localOrigin) externalRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page).toHaveTitle('iLONGGO · Research Prototype');
    await expect(page.getByRole('heading', { name: 'iLONGGO', exact: true })).toBeVisible();
    await expect(page.getByText('Spatial layers loaded successfully')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
    await expect(page.locator('.map-render-status')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Iloilo City spatial preview', exact: true }).locator('canvas')).toBeVisible();
    const mapBox = await page.getByRole('region', { name: 'Iloilo City spatial preview', exact: true }).boundingBox();
    expect(mapBox?.height).toBeGreaterThanOrEqual(350);
    await expect(page.locator('.geography-number')).toHaveText('180');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const attribution = page.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('No external basemap');
    await mkdir('.wrangler/design-review', { recursive: true });
    await page.screenshot({ path: `.wrangler/design-review/ilonggo-${viewport.width}.png`, fullPage: true });

    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);

    const points = page.getByRole('checkbox', { name: 'Representative points' });
    await points.check();
    await expect(points).toBeChecked();
    await page.getByRole('combobox', { name: 'Explore a barangay' }).selectOption({ index: 1 });
    await expect(page.getByText('Barangay preview only. This does not select an incident site.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear selection' }).click();

    await page.getByRole('button', { name: 'About iLONGGO and important disclaimers' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(APP.subtitle, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close information dialog' })).toBeFocused();
    // Native modal keeps keyboard focus inside and supports Escape and touch/click.
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Understood · Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'About iLONGGO and important disclaimers' })).toBeFocused();

    const report = viewport.width <= 600
      ? page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Report an Incident' })
      : page.getByRole('banner').getByRole('button', { name: 'Report an Incident', exact: true });
    await report.click();
    await expect(page.getByRole('form', { name: 'Incident report' })).toBeVisible();
    await expect(page.getByLabel('Barangay', { exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const formAccessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(formAccessibility.violations).toEqual([]);
    await page.goto('/#review');
    await expect(page.getByRole('heading', { name: 'Local Demo Review', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const reviewAccessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(reviewAccessibility.violations).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('200% equivalent viewport reflows without horizontal page overflow', async ({ page }) => {
  // A 1440×900 screen at 200% browser zoom exposes 720×450 CSS pixels.
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto('/');
  await expect(page.getByText('Spatial layers loaded successfully')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'About iLONGGO and important disclaimers' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close information dialog' }).click();
});
