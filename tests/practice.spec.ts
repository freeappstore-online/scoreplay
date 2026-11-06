import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { Midi } = createRequire(new URL('../web/package.json', import.meta.url))('@tonejs/midi');
function fixture(high = false) {
  const midi = new Midi(); midi.header.setTempo(120);
  const melody = midi.addTrack(); melody.name = 'Melody'; melody.addNote({ midi: high ? 127 : 69, time: 0, duration: 6, velocity: .7 });
  const bass = midi.addTrack(); bass.name = 'Bass'; bass.addNote({ midi: 48, time: 0, duration: 6, velocity: .5 });
  const drums = midi.addTrack(); drums.name = 'Drums'; drums.channel = 9; drums.addNote({ midi: 36, time: 0, duration: .2, velocity: .7 });
  return Buffer.from(midi.toArray());
}

test('transpose changes original notation, preserves the PDF, and resets safely for another piece', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?piece=nursery-aikendrum');
  const score = page.getByRole('img', { name: /Original score, measures/ });
  await expect(score.locator('svg')).toBeVisible();
  const initial = await score.locator('svg').innerHTML();
  await page.getByLabel('Transpose', { exact: true }).selectOption('2');
  await expect(page.getByText('Score notation · +2 semitones', { exact: true })).toBeVisible();
  await expect(score.locator('svg')).toBeVisible();
  expect(await score.locator('svg').innerHTML()).not.toBe(initial);
  await page.getByRole('button', { name: 'PDF score', exact: true }).click();
  await expect(page.getByText(/This PDF stays in its original key/)).toBeVisible();
  await page.getByRole('button', { name: 'Piano roll', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'highest.mid', mimeType: 'audio/midi', buffer: fixture(true) });
  await expect(page.getByLabel('Transpose', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Transpose up one semitone', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('region', { name: 'Practice tools' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/practice-mobile.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('transpose and solo reach audible playback; fine speed preserves pitch', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreplay-sound-mode', 'simple');
    const Native = window.AudioContext; (window as any).pitches = []; (window as any).probes = [];
    window.AudioContext = class extends Native {
      createOscillator() { const osc = super.createOscillator(), set = osc.frequency.setValueAtTime.bind(osc.frequency); osc.frequency.setValueAtTime = (value, when) => { (window as any).pitches.push(value); return set(value, when); }; return osc; }
      createGain() { const node = super.createGain(), connect = node.connect.bind(node); (node as any).connect = (destination: AudioNode) => { if (destination === this.destination) { const probe = this.createAnalyser(); connect(probe); (window as any).probes.push(probe); } return connect(destination); }; return node; }
    };
  });
  await page.goto('/'); await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'practice.mid', mimeType: 'audio/midi', buffer: fixture() });
  await expect(page.getByRole('heading', { name: 'practice', exact: true })).toBeVisible();
  await page.getByLabel('Transpose', { exact: true }).selectOption('12');
  await page.getByRole('button', { name: 'Solo Melody', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pitches.includes(880))).toBe(true);
  expect(await page.evaluate(() => (window as any).pitches.every((p: number) => p === 880))).toBe(true);
  const level = () => page.evaluate(() => Math.max(...(window as any).probes.map((p: AnalyserNode) => { const a = new Float32Array(p.fftSize); p.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs)); })));
  await expect.poll(level).toBeGreaterThan(.001);
  await page.getByLabel('Speed percentage', { exact: true }).fill('73');
  await expect(page.getByLabel('Playback speed', { exact: true })).toHaveValue('0.73');
  expect(await page.evaluate(() => (window as any).pitches.every((p: number) => p === 880))).toBe(true);
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.getByLabel('Playback sound', { exact: true }).selectOption('sampled');
  await page.getByRole('button', { name: 'Stop and rewind', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect.poll(level, { timeout: 30000 }).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Unsolo Melody', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solo Melody', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('A–B validates boundaries, repeats a sampled passage, and count-in can be cancelled', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext; (window as any).loopProbes = [];
    window.AudioContext = class extends Native {
      createGain() { const node = super.createGain(), connect = node.connect.bind(node); (node as any).connect = (destination: AudioNode) => { if (destination === this.destination) { const probe = this.createAnalyser(); connect(probe); (window as any).loopProbes.push(probe); } return connect(destination); }; return node; }
    };
  });
  await page.goto('/'); await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'loop.mid', mimeType: 'audio/midi', buffer: fixture() });
  await expect(page.getByRole('heading', { name: 'loop', exact: true })).toBeVisible();
  await page.getByText('Edit A–B times', { exact: true }).click();
  await page.getByLabel('Loop start in seconds', { exact: true }).fill('2');
  await page.getByLabel('Loop end in seconds', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Apply section loop', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose A before B');
  await page.getByLabel('Loop start in seconds', { exact: true }).fill('0.5');
  await page.getByLabel('Loop end in seconds', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'Apply section loop', exact: true }).click();
  const position = page.getByLabel('Playback position', { exact: true });
  await expect(position).toHaveValue('0.5');
  await page.getByLabel('Count-in', { exact: true }).selectOption('bar');
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.getByText(/Count in: \d · Get ready/)).toBeVisible({ timeout: 30000 });
  await expect(position).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await expect(page.getByText(/Count in: \d · Get ready/)).toHaveCount(0);
  await page.getByLabel('Count-in', { exact: true }).selectOption('off');
  await page.getByRole('button', { name: 'Metronome off', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect.poll(async () => Number(await position.inputValue()), { intervals: [50] }).toBeGreaterThan(1.2);
  await expect.poll(async () => Number(await position.inputValue()), { intervals: [50] }).toBeLessThan(.9);
  await page.getByRole('button', { name: 'Metronome on', exact: true }).click();
  await expect.poll(async () => Number(await position.inputValue()), { intervals: [50] }).toBeGreaterThan(1.2);
  await expect.poll(async () => Number(await position.inputValue()), { intervals: [50] }).toBeLessThan(.9);
  await expect.poll(() => page.evaluate(() => { const probe = (window as any).loopProbes[0] as AnalyserNode; const data = new Float32Array(probe.fftSize); probe.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); })).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Clear section', exact: true }).click();
  await expect(page.getByRole('button', { name: '↻ Loop off', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('library previews leave practice pitch, solo, section and rhythm settings intact', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scoreplay-sound-mode', 'simple'));
  await page.goto('/'); await page.getByLabel('Choose MIDI file').setInputFiles({ name: 'preview-practice.mid', mimeType: 'audio/midi', buffer: fixture() });
  await expect(page.getByRole('heading', { name: 'preview-practice', exact: true })).toBeVisible();
  await page.getByLabel('Transpose', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Solo Melody', exact: true }).click();
  await page.getByRole('button', { name: 'Metronome off', exact: true }).click();
  await page.getByLabel('Count-in', { exact: true }).selectOption('bar');
  await page.getByText('Edit A–B times', { exact: true }).click();
  await page.getByLabel('Loop start in seconds', { exact: true }).fill('1'); await page.getByLabel('Loop end in seconds', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Apply section loop', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByLabel('Find a song', { exact: true }).pressSequentially('Aiken Drum');
  await page.getByRole('button', { name: 'Preview Aiken Drum', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Music preview' }).getByText('Playing preview', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  await expect(page.getByLabel('Transpose', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Count-in', { exact: true })).toHaveValue('bar');
  await expect(page.getByRole('button', { name: 'Metronome on', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Unsolo Melody', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '↻ Loop on', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Playback position', { exact: true })).toHaveValue('1');
  await page.getByRole('link', { name: 'Profile', exact: true }).click(); await page.getByRole('link', { name: 'Player', exact: true }).click();
  await expect(page.getByLabel('Transpose', { exact: true })).toHaveValue('3');
});
