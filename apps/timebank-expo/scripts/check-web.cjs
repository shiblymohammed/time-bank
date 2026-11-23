const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) console.log(message.type(), message.text());
  });
  await fs.mkdir('docs/screens', { recursive: true });
  try {
    await page.goto('http://[::1]:8090', { timeout: 120000 });
    await page
      .getByRole('button', { name: 'Search skills and people', exact: true })
      .waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    for (const [name, route] of [
      ['home', '/'],
      ['exchange', '/exchange'],
      ['requests', '/requests'],
      ['profile', '/profile'],
    ]) {
      await page.goto(`http://[::1]:8090${route}`);
      await page.getByRole('button', { name: 'Home', exact: true }).waitFor();
      await page.waitForTimeout(1800);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) throw new Error(`${name} overflows horizontally`);
      await page.screenshot({ path: `docs/screens/${name}.png` });
      console.log(`${name}: rendered at 393x852 without horizontal overflow`);
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page
      .getByRole('button', { name: 'Save A fresh eye on my café menu', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).click();
    await expect(
      page
        .getByText('A fresh eye on my café menu', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Exchange', exact: true }).click();
    await page
      .getByLabel('Describe your time', { exact: true })
      .fill('I can help you learn to draw a portrait');
    await page.getByRole('button', { name: 'List My Time', exact: true }).click();
    await page.getByRole('button', { name: 'See it in the feed', exact: true }).click();
    await expect(
      page
        .getByText('I can help you learn to draw a portrait', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Search skills and people', exact: true }).click();
    await page.getByLabel('Search skills, help or people', { exact: true }).fill('portrait');
    await expect(
      page
        .getByText('I can help you learn to draw a portrait', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      'PASS: navigation, saving, publication, search, four screenshots and no runtime errors',
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
