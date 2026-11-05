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
  await page.getByRole('button', { name: 'Clear last opened file' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Last-opened file cleared' })).toBeVisible();
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

test('engraved score, track and rhythm choices, paging, cursor and mode switching', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const staff = page.getByRole('img', { name: /Staff notation/ });
  await expect(staff.locator('svg')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Sheet music', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await staff.locator('path').count()).toBeGreaterThan(20);
  await page.getByLabel('Score tracks', { exact: true }).selectOption('0');
  await expect(staff.locator('svg')).toBeVisible();
  await page.getByLabel('Notation rhythm', { exact: true }).selectOption('8');
  await expect(staff.locator('svg')).toBeVisible();
  await page.getByLabel('Notation rhythm', { exact: true }).selectOption('6');
  await page.getByLabel('Score tracks', { exact: true }).selectOption('-1');
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.getByText('Measures 5–8 of 8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seek to measure 5', exact: true }).click();
  const position = page.getByRole('slider', { name: 'Playback position', exact: true });
  const saved = await position.inputValue(); expect(Number(saved)).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'Piano roll', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(position).toHaveValue(saved);
  await page.getByRole('button', { name: 'Sheet music', exact: true }).click();
  await expect(staff.locator('svg')).toBeVisible();
  await expect(position).toHaveValue(saved);
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect(page.getByText('Measures 5–8 of 8', { exact: true })).toBeVisible();
  await expect(staff.locator('svg')).toBeVisible();
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await expect(staff.locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Stop and rewind' }).click();
  await expect(page.getByText('Measures 1–4 of 8', { exact: true })).toBeVisible();
  await expect(staff.locator('svg')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/sheet-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/sheet-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('library pairs original notation and PDF, searches, restores and removes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const xml = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' + Array.from({ length: 8 }, (_, i) => `<measure number="${i+1}">${i === 0 ? '<attributes><divisions>1</divisions><key><fifths>-2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join('') + '</part></score-partwise>';
  await page.goto('/library');
  await page.getByLabel('Import library files').setInputFiles([
    { name: 'Belle-melody.mid', mimeType: 'audio/midi', buffer: fixture() },
    { name: 'Belle-melody.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) },
    { name: 'Belle-melody.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
  ]);
  await expect(page.getByRole('status').filter({ hasText: '1 arrangement saved' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Find a song' }).pressSequentially('Belle');
  await expect(page.getByRole('heading', { name: 'Belle melody', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Let It Go', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Belle melody', exact: true }).click();
  const original = page.getByRole('img', { name: /Original score, measures/ });
  await expect(original.locator('svg')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Original MusicXML notation', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next score page →', exact: true }).click();
  await expect(page.getByText('Score page 2 of 2', { exact: true })).toBeVisible();
  await expect(original.locator('svg')).toBeVisible();
  await page.getByRole('button', { name: 'MIDI transcription', exact: true }).click();
  await expect(page.getByRole('img', { name: /Staff notation/ }).locator('svg')).toBeVisible();
  await page.getByRole('button', { name: 'PDF score', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open PDF score in a new tab ↗' })).toHaveAttribute('href', /^blob:/);
  await page.reload();
  await expect(page.getByText('Original MusicXML notation', { exact: true })).toBeVisible();
  await expect(original.locator('svg')).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Belle melody', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/library.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove Belle melody', exact: true }).click();
  await page.getByRole('button', { name: 'Remove arrangement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Belle melody', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Belle melody', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('supplied Belle arrangements render their original scores and remain playable', async ({ page }) => {
  test.skip(!process.env.SCOREPLAY_BELLE_DIR, 'Optional user-provided local music fixtures');
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const names = ['Belle-band.mid', 'Belle-melody-piano-bass.mid', 'Belle-melody-piano-bass.musicxml', 'Belle-melody-piano-bass.pdf', 'Belle-melody.mid', 'Belle-melody.musicxml', 'Belle-melody.pdf', 'Belle-orchestral.mid'];
  await page.goto('/library');
  await page.getByLabel('Import library files').setInputFiles(names.map(name => `${process.env.SCOREPLAY_BELLE_DIR}/${name}`));
  await expect(page.getByRole('status').filter({ hasText: '4 arrangements saved' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Open Belle melody piano bass', exact: true }).click();
  const original = page.getByRole('img', { name: /Original score, measures/ });
  await expect(original.locator('svg')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Score page 1 of 42', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/belle-original.png', fullPage: true });
  await page.getByRole('button', { name: '▶ Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Playback position', exact: true }).inputValue())).toBeGreaterThan(.2);
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Next score page →', exact: true }).click();
  await expect(page.getByText('Score page 2 of 42', { exact: true })).toBeVisible();
  await expect(original.locator('svg')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'PDF score', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open PDF score in a new tab ↗' })).toBeVisible();
  await page.reload();
  await expect(original.locator('svg')).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test('free collection filters, favourites, real nursery score and saved offline files', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/library');
  await expect(page.getByText('60 pieces found · 60 in the collection')).toBeVisible();
  await page.getByRole('textbox', { name: 'Find a song' }).pressSequentially('London');
  await page.getByLabel('Category', { exact:true }).selectOption('Children & learning');
  await page.getByLabel('Difficulty · estimated').selectOption('Easy');
  await page.getByLabel('Instrument', { exact:true }).selectOption('Piano');
  await page.getByLabel('Score format').selectOption('musicxml');
  await page.getByLabel('Add a tag').selectOption('english');
  await expect(page.getByText('1 piece found · 60 in the collection')).toBeVisible();
  await page.getByRole('button', { name:'Favourite London Bridge',exact:true }).click();
  await page.reload();
  await expect(page.getByRole('textbox', { name:'Find a song' })).toHaveValue('London');
  await expect(page.getByRole('button', { name:'Favourite London Bridge',exact:true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name:'Save to my files',exact:true }).click();
  await expect(page.getByRole('status').filter({ hasText:'London Bridge saved with its score' })).toBeVisible();
  await page.getByRole('button', { name:'Open London Bridge',exact:true }).click();
  await expect(page.getByRole('heading', { name:'London Bridge',exact:true })).toBeVisible();
  await expect(page.getByRole('img', { name:/Original score, measures/ }).locator('svg')).toBeVisible({timeout:20000});
  await page.getByRole('button', { name:'▶ Play',exact:true }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name:'Playback position',exact:true }).inputValue())).toBeGreaterThan(.2);
  await page.getByRole('button', { name:'Ⅱ Pause',exact:true }).click();
  await page.getByRole('button', { name:'PDF score',exact:true }).click();
  await expect(page.getByRole('link', { name:'Open PDF score in a new tab ↗' })).toHaveAttribute('href',/^blob:/);
  await page.getByRole('link', { name:'Library',exact:true }).click();
  await page.getByRole('button', { name:'Favourites (1)',exact:true }).click();
  await expect(page.getByRole('button', { name:'Open London Bridge',exact:true })).toBeVisible();
  await page.getByRole('button', { name:'My files (1)',exact:true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name:'Open London Bridge',exact:true }).click();
  await expect(page.getByRole('img', { name:/Original score, measures/ }).locator('svg')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name:'London Bridge',exact:true })).toBeVisible();
  await page.getByRole('link', { name:'Library',exact:true }).click();
  await page.getByRole('button', { name:'Explore everything',exact:false }).click();
  await page.getByLabel('Instrument', { exact:true }).selectOption('Trumpet');
  await page.getByLabel('Category', { exact:true }).selectOption('Children & learning');
  await expect(page.getByText('No pieces match just yet.')).toBeVisible();
  await page.getByRole('button', { name:'Clear filters',exact:true }).click();
  await expect(page.getByText('60 pieces found · 60 in the collection')).toBeVisible();
  await page.screenshot({path:'test-results/free-library-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/free-library-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('classical download failures recover; MIDI notation and source PDF work', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('textbox', { name:'Find a song' }).pressSequentially('fur elise piano');
  await expect(page.getByRole('heading', { name:'Für Elise — piano',exact:true })).toBeVisible();
  await page.route('**/music/**/score.mid', route => route.fulfill({status:503,body:'Unavailable'}));
  await page.getByRole('button', { name:'Open Für Elise — piano',exact:true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be downloaded');
  await page.unroute('**/music/**/score.mid');
  await page.getByRole('button', { name:'Open Für Elise — piano',exact:true }).click();
  await expect(page.getByRole('img', { name:/Staff notation/ }).locator('svg')).toBeVisible({timeout:20000});
  await expect(page.getByRole('heading', { name:'Für Elise — piano',exact:true })).toBeVisible();
  await page.getByRole('button', { name:'▶ Play',exact:true }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name:'Playback position',exact:true }).inputValue())).toBeGreaterThan(.2);
  await page.getByRole('button', { name:'Ⅱ Pause',exact:true }).click();
  await page.getByRole('button', { name:'PDF score',exact:true }).click();
  await expect(page.getByRole('link', { name:'Open PDF score in a new tab ↗' })).toBeVisible();
});
