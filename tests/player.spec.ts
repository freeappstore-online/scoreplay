import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { Midi } = require('@tonejs/midi');
function fixture() {
  const m = new Midi(); m.name = 'Practice study';
  const t = m.addTrack(); t.name = 'Right hand';
  t.addNote({ midi: 60, time: 0, duration: 4, velocity: .8 });
  t.addNote({ midi: 64, time: 4, duration: 4, velocity: .6 });
  return Buffer.from(m.toArray());
}
test('import, actual audio signal, controls, keyboard, persistence and profile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    (window as any).audioProbes = [];
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain();
        const connect = gain.connect.bind(gain);
        (gain as any).connect = (destination: AudioNode) => {
          if (destination === this.destination) { const probe = this.createAnalyser(); connect(probe); (window as any).audioProbes.push(probe); }
          return connect(destination);
        };
        return gain;
      }
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ode to Joy' })).toBeVisible();
  await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'study.mid', mimeType: 'audio/midi', buffer: fixture() });
  await expect(page.getByRole('heading', { name: 'Practice study' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const probe = (window as any).audioProbes[0] as AnalyserNode;
    if (!probe) return 0;
    const samples = new Float32Array(probe.fftSize); probe.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  })).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  const paused = await page.getByRole('slider', { name: 'Playback position', exact: true }).inputValue();
  await page.waitForTimeout(200);
  expect(await page.getByRole('slider', { name: 'Playback position', exact: true }).inputValue()).toBe(paused);
  await page.getByLabel('Playback speed').selectOption('0.5');
  await page.getByRole('button', { name: 'Mute Right hand', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute Right hand', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unmute Right hand', exact: true }).click();
  await page.getByLabel('Volume', { exact: true }).focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('64');
  await page.getByRole('button', { name: 'Stop and rewind' }).click();
  await expect(page.getByRole('slider', { name: 'Playback position', exact: true })).toHaveValue('0');
  await page.getByRole('heading', { name: 'Practice study' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Ⅱ Pause', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /profile/i }).click();
  await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible();
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice study' })).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Practice study' })).toBeVisible();
  await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'bad.mid', mimeType: 'audio/midi', buffer: Buffer.from('not MIDI') });
  await expect(page.getByRole('alert').filter({ hasText: 'not a MIDI file' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Practice study' })).toBeVisible();
  await page.getByRole('button', { name: 'Try demo' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  const icon = await page.request.get('/favicon.ico'); expect(icon.ok()).toBe(true);
  await page.getByRole('button', { name: 'Forget saved MIDI' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved MIDI removed' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Ode to Joy' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile has no horizontal overflow and retains usable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ode to Joy' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/dark.png', fullPage: true });
});
