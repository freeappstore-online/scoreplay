import { test, expect, type Page } from '@playwright/test';
async function search(page: Page, text: string) {
  const field = page.getByLabel('Find a song', { exact: true }); await field.fill(''); await field.pressSequentially(text);
}
async function simple(page: Page) { await page.addInitScript(() => localStorage.setItem('scoreplay-sound-mode', 'simple')); }

test('preview stays in results, loads only MIDI, reuses audio, and restores the player settings', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [], music: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/music/')) music.push(r.url()); });
  await page.addInitScript(() => {
    const Native = window.AudioContext; (window as any).audioCount = 0; (window as any).probes = [];
    window.AudioContext = class extends Native {
      constructor() { super(); (window as any).audioCount++; }
      createGain() { const gain = super.createGain(), connect = gain.connect.bind(gain);
        (gain as any).connect = (target: AudioNode) => { if (target === this.destination) { const probe = this.createAnalyser(); connect(probe); (window as any).probes.push(probe); } return connect(target); }; return gain; }
    };
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Ode to Joy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ Pause', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: '↻ Loop off', exact: true }).click();
  await page.getByRole('button', { name: 'Mute Melody', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position', exact: true }).evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '5'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('link', { name: 'Library', exact: true }).click(); await search(page, 'Aiken Drum');
  expect(music).toHaveLength(0);
  await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Music preview', exact: true });
  await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => Math.max(...(window as any).probes.map((p: AnalyserNode) => { const a = new Float32Array(p.fftSize); p.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs)); })))).toBeGreaterThan(.001);
  await expect(page).toHaveURL(/\/library$/);
  expect(music).toHaveLength(1); expect(music[0]).toContain('/music/nursery-aikendrum/score.mid');
  await page.getByRole('button', { name: 'Pause preview Aiken Drum', exact: true }).click();
  await expect(bar.getByText('Preview paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume preview Aiken Drum', exact: true }).click();
  await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible(); expect(music).toHaveLength(1);
  await search(page, 'London Bridge'); await expect(bar.getByText('Aiken Drum', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview London Bridge', exact: true }).click();
  await expect(bar.getByText('London Bridge', { exact: true })).toBeVisible(); await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).audioCount)).toBe(1);
  expect(music).toHaveLength(2); expect(music.every(url => url.endsWith('.mid'))).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' }); await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/library-preview-mobile.png' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  await expect(bar).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Ode to Joy', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Playback position', exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Playback speed', { exact: true })).toHaveValue('0.5');
  await expect(page.getByRole('button', { name: '↻ Loop on', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Unmute Melody', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Ode to Joy', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('preview request cancellation', () => {
  test.use({ serviceWorkers: 'block' });
  test('late requests cannot replace a newer preview; failures retry and navigation cancels pending playback', async ({ page }) => {
    await simple(page); await page.goto('/library');
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/music/nursery-aikendrum/score.mid', async route => { await held; await route.continue().catch(() => {}); });
    await search(page, 'Aiken Drum'); await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel preview Aiken Drum', exact: true })).toBeVisible();
    await search(page, 'London Bridge'); await page.getByRole('button', { name: 'Preview London Bridge', exact: true }).click();
    const bar = page.getByRole('region', { name: 'Music preview', exact: true });
    await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible(); release();
    await expect(bar.getByText('London Bridge', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
    await page.unroute('**/music/nursery-aikendrum/score.mid');
    await page.route('**/music/nursery-aikendrum/score.mid', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await search(page, 'Aiken Drum'); await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
    await expect(bar.getByRole('alert')).toContainText('could not be downloaded');
    await page.unroute('**/music/nursery-aikendrum/score.mid');
    await page.getByRole('button', { name: 'Retry preview', exact: true }).click();
    await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
    let finish!: () => void; const pending = new Promise<void>(resolve => { finish = resolve; });
    await page.route('**/music/nursery-aikendrum/score.mid', async route => { await pending; await route.continue().catch(() => {}); });
    await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
    await page.getByRole('link', { name: 'Profile', exact: true }).click(); finish();
    await expect(bar).toHaveCount(0); await page.getByRole('link', { name: 'Player', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ode to Joy', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible();
  });
});

test('saved files preview offline and opening a previewed piece loads its score without reverting to the previous piece', async ({ page, context }) => {
  await simple(page); await page.goto('/library'); await search(page, 'Aiken Drum');
  await page.getByRole('button', { name: 'Save to my files', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to my files', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My files (1)', exact: true }).click(); await context.setOffline(true);
  await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Music preview', exact: true });
  await expect(bar.getByText('Playing preview', { exact: true })).toBeVisible();
  await context.setOffline(false); await page.getByRole('button', { name: 'Open Aiken Drum', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aiken Drum', exact: true })).toBeVisible();
  await expect(bar).toHaveCount(0); await expect(page.getByRole('img', { name: /Original score, measures/ }).locator('svg')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Playback position', exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Aiken Drum', exact: true })).toBeVisible();
});
