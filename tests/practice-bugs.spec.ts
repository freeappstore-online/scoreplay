import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { Midi } = createRequire(new URL('../web/package.json', import.meta.url))('@tonejs/midi');

test('Space expands section controls without starting playback', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scoreplay-sound-mode', 'simple'));
  await page.goto('/');
  const summary = page.getByText('Edit A–B times', { exact: true });
  await summary.focus(); await summary.press('Space');
  await expect(page.getByLabel('Loop start in seconds')).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ Play', exact: true })).toBeVisible();
});

test('whole-piece section defaults are valid for a fractional MIDI duration', async ({ page }) => {
  const midi = new Midi(); midi.header.setTempo(123);
  midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 481, velocity: .7 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '↑ Open MIDI', exact: true })).toBeEnabled();
  await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'fractional.mid', mimeType: 'audio/midi', buffer: Buffer.from(midi.toArray()) });
  await expect(page.getByRole('heading', { name: 'fractional', exact: true })).toBeVisible();
  await page.getByText('Edit A–B times', { exact: true }).click();
  expect(await page.getByLabel('Loop end in seconds').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(true);
  await page.getByRole('button', { name: 'Apply section loop', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '↻ Loop on', exact: true })).toBeVisible();
  await page.getByLabel('Loop start in seconds').fill('0.2');
  await page.getByLabel('Loop end in seconds').fill('0.3');
  await page.getByRole('button', { name: 'Apply section loop', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Section A 0:00.200 → B 0:00.300 · Repeating', { exact: true })).toBeVisible();
});

test('solo makes the other track visibly silent and its mute button reflects what is heard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo Melody', exact: true }).click();
  const accompaniment = page.getByRole('button', { name: 'Unmute Accompaniment', exact: true });
  await expect(accompaniment).toHaveAttribute('aria-pressed', 'true');
  await accompaniment.click();
  await expect(page.getByRole('button', { name: 'Solo Melody', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Mute Accompaniment', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
