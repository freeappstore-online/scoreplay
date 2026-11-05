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

test('sampled instruments produce audio, preserve transport, and reopen offline', async ({ page, context }) => {
  test.setTimeout(90000);
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
    const Native=window.AudioContext; (window as any).audioProbes=[]; (window as any).oscillators=0;
    window.AudioContext=class extends Native {
      createGain() { const gain=super.createGain(), connect=gain.connect.bind(gain); (gain as any).connect=(destination:AudioNode)=>{ if(destination===this.destination){const probe=this.createAnalyser();connect(probe);(window as any).audioProbes.push(probe);}return connect(destination);};return gain; }
      createOscillator() { (window as any).oscillators++;return super.createOscillator(); }
    };
  });
  const peak=()=>page.evaluate(()=>{const probe=(window as any).audioProbes[0] as AnalyserNode;if(!probe)return 0;const values=new Float32Array(probe.fftSize);probe.getFloatTimeDomainData(values);return Math.max(...values.map(Math.abs));});
  await page.goto('/');
  await expect(page.getByLabel('Playback sound',{exact:true})).toHaveValue('sampled');
  await page.getByLabel('Choose MIDI file').setInputFiles({name:'sample-study.mid',mimeType:'audio/midi',buffer:fixture()});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await context.setOffline(true); // Built-in instruments must work before the first Play.
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible({timeout:45000});
  await expect.poll(peak).toBeGreaterThan(.001);
  expect(await page.evaluate(()=>(window as any).oscillators)).toBe(0);
  await page.getByRole('button',{name:'Ⅱ Pause',exact:true}).click();
  await expect.poll(peak).toBeLessThan(.0001);
  const position=page.getByRole('slider',{name:'Playback position',exact:true});
  await position.fill('2');
  await page.getByLabel('Playback speed').selectOption('0.5');
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect.poll(peak).toBeGreaterThan(.001); // A held note is reconstructed at the seek point.
  await page.getByRole('button',{name:'Mute Right hand',exact:true}).click();
  await expect.poll(peak).toBeLessThan(.0001);
  await page.getByRole('button',{name:'Unmute Right hand',exact:true}).click();
  await expect.poll(peak).toBeGreaterThan(.001);
  await page.getByRole('button',{name:'Stop and rewind',exact:true}).click();
  await expect.poll(peak).toBeLessThan(.0001);
  await page.getByLabel('Playback sound',{exact:true}).selectOption('piano');
  await page.screenshot({path:'test-results/sampled-player.png',fullPage:true});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await context.setOffline(true);
  await expect(page.getByLabel('Playback sound',{exact:true})).toHaveValue('piano');
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible({timeout:20000});
  await expect.poll(peak).toBeGreaterThan(.001);
  await context.setOffline(false);
  await page.getByRole('link',{name:'Library',exact:true}).click();
  await expect.poll(peak).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});

test.describe('asset loading without a service worker', () => {
  test.use({ serviceWorkers: 'block' });
  test('sound loading errors have a working fallback; navigation cancels pending playback', async ({page})=>{
    test.setTimeout(60000);
    await page.route('**/sounds/*.sf3',route=>route.fulfill({status:503,body:'Offline'}));
    await page.goto('/');await page.getByRole('button',{name:'▶ Play',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Instrument audio could not load');
    await page.getByLabel('Playback sound',{exact:true}).selectOption('simple');
    await page.getByRole('button',{name:'▶ Play',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Ⅱ Pause',exact:true}).click();
    await page.getByRole('button',{name:'Stop and rewind',exact:true}).click();
    await page.unroute('**/sounds/*.sf3');
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/sounds/*.sf3',async route=>{await gate;await route.continue();});
    await page.getByLabel('Playback sound',{exact:true}).selectOption('sampled');
    await page.getByRole('button',{name:'▶ Play',exact:true}).click();
    await expect(page.getByRole('button',{name:'Cancel play',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Library',exact:true}).click();
    const downloaded=page.waitForResponse(r=>r.url().includes('/sounds/') && r.url().endsWith('.sf3') && r.status()===200);
    release();await (await downloaded).finished();await page.unroute('**/sounds/*.sf3');
    await page.waitForTimeout(500); // Allow background engine preparation to finish after cancellation.
    await page.getByRole('link',{name:'Player',exact:true}).click();
    await expect(page.getByRole('button',{name:'▶ Play',exact:true})).toBeVisible();
    await expect(page.getByRole('slider',{name:'Playback position',exact:true})).toHaveValue('0');
  });

});

test('recorded violin differs from grand piano and percussion stays audible', async ({page})=>{
  test.setTimeout(90000);
  await page.addInitScript(()=>{
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      createGain(){const g=super.createGain(),connect=g.connect.bind(g);(g as any).connect=(dest:AudioNode)=>{if(dest===this.destination){const probe=this.createAnalyser();probe.smoothingTimeConstant=0;connect(probe);(window as any).timbreProbe=probe;}return connect(dest);};return g;}
    };
  });
  const spectrum=()=>page.evaluate(()=>{const probe=(window as any).timbreProbe as AnalyserNode;const data=new Float32Array(probe.frequencyBinCount);probe.getFloatFrequencyData(data);const part=Array.from(data.slice(5,180),db=>10**(db/20));const sum=part.reduce((a,b)=>a+b,0);return part.map(x=>x/(sum||1));});
  const midi=new Midi();midi.name='Instrument comparison';
  const violin=midi.addTrack();violin.name='Violin';violin.instrument.number=40;violin.addNote({midi:69,time:0,duration:8,velocity:.8});
  const drums=midi.addTrack();drums.name='Drums';drums.channel=9;for(let i=0;i<8;i++)drums.addNote({midi:i%2?38:36,time:i,duration:.2,velocity:.9});
  await page.goto('/');
  await page.getByLabel('Choose MIDI file').setInputFiles({name:'instruments.mid',mimeType:'audio/midi',buffer:Buffer.from(midi.toArray())});
  await page.getByRole('button',{name:'Mute Drums',exact:true}).click();
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible({timeout:45000});
  await page.waitForTimeout(600);const strings=await spectrum();
  await page.getByRole('button',{name:'Stop and rewind',exact:true}).click();
  await page.getByLabel('Playback sound',{exact:true}).selectOption('piano');
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  await page.waitForTimeout(600);const piano=await spectrum();
  expect(strings.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
  expect(piano.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
  expect(strings.reduce((sum,value,i)=>sum+Math.abs(value-piano[i]),0)).toBeGreaterThan(.15);
  await page.getByRole('button',{name:'Stop and rewind',exact:true}).click();
  await page.getByRole('button',{name:'Mute Violin',exact:true}).click();
  await page.getByRole('button',{name:'Unmute Drums',exact:true}).click();
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const p=(window as any).timbreProbe as AnalyserNode;const a=new Float32Array(p.fftSize);p.getFloatTimeDomainData(a);return Math.max(...a.map(Math.abs));})).toBeGreaterThan(.001);
});

test('concurrent player imports respect the library limit; filename search and removal preserve storage', async ({page, context}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Ode to Joy',exact:true})).toBeVisible();
  await page.evaluate(async bytes => {
    const db = await new Promise<IDBDatabase>((resolve,reject)=>{ const r=indexedDB.open('scoreplay',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('library','readwrite');for(let i=0;i<99;i++)tx.objectStore('library').put({id:`saved-${i}`,name:`saved-${i}.mid`,title:`Saved ${i}`,bytes:Uint8Array.from(bytes).buffer,added:1});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  },Array.from(fixture()));
  const other=await context.newPage();await other.goto('/');
  await expect(other.getByRole('heading',{name:'Ode to Joy',exact:true})).toBeVisible();
  await Promise.all([
    page.getByLabel('Choose MIDI file').setInputFiles({name:'concurrent-a.mid',mimeType:'audio/midi',buffer:fixture()}),
    other.getByLabel('Choose MIDI file').setInputFiles({name:'concurrent-b.mid',mimeType:'audio/midi',buffer:fixture()}),
  ]);
  for(const tab of [page,other])await expect(tab.getByRole('status').filter({hasText:/Saved on this device and added|File opened.*100 arrangements/})).toBeVisible();
  const stored=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('scoreplay',2);r.onsuccess=()=>resolve(r.result);});
    return new Promise<{count:number;last:string}>((resolve,reject)=>{const tx=db.transaction(['library','files'],'readonly');const count=tx.objectStore('library').count(),last=tx.objectStore('files').get('last');tx.oncomplete=()=>{db.close();resolve({count:count.result,last:last.result.name});};tx.onabort=()=>{db.close();reject(tx.error);};});
  });
  expect(stored.count).toBe(100);expect(stored.last).toMatch(/^concurrent-[ab]\.mid$/);
  // Updating an existing arrangement at capacity is allowed.
  await page.getByLabel('Choose MIDI file').setInputFiles({name:stored.last,mimeType:'audio/midi',buffer:fixture()});
  await expect(page.getByRole('status').filter({hasText:'Saved on this device and added'})).toBeVisible();
  await page.getByRole('link',{name:'Library',exact:true}).click();
  await page.getByRole('button',{name:'My files (100)',exact:true}).click();
  await page.getByRole('textbox',{name:'Find a song'}).pressSequentially(stored.last);
  await expect(page.getByText('1 piece found',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Remove ${stored.last.replace('.mid','').replaceAll('-',' ')}`,exact:true}).click();
  await page.getByRole('button',{name:'Remove arrangement',exact:true}).click();
  await expect(page.getByRole('button',{name:'My files (99)',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Player',exact:true}).click();await page.reload();
  await expect(page.getByRole('heading',{name:'Ode to Joy',exact:true})).toBeVisible();
});

test('opening another score resets its page and holding Space does not toggle repeatedly', async ({page}) => {
  const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+Array.from({length:8},(_,i)=>`<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join('')+'</part></score-partwise>';
  await page.goto('/library');
  await page.getByLabel('Import library files').setInputFiles(['first','second'].flatMap(name=>[
    {name:`${name}.mid`,mimeType:'audio/midi',buffer:fixture()},
    {name:`${name}.musicxml`,mimeType:'application/xml',buffer:Buffer.from(xml)},
  ]));
  await expect(page.getByRole('status').filter({hasText:'2 arrangements saved'})).toBeVisible();
  await page.getByRole('button',{name:'Open first',exact:true}).click();
  await page.getByRole('button',{name:'Next score page →',exact:true}).click();
  await expect(page.getByText('Score page 2 of 2',{exact:true})).toBeVisible();
  await page.getByLabel('Choose MIDI file').setInputFiles({name:'second.mid',mimeType:'audio/midi',buffer:fixture()});
  await expect(page.getByRole('status').filter({hasText:'Saved on this device and added'})).toBeVisible();
  await expect(page.getByText('Score page 1 of 2',{exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:/Original score, measures/}).locator('svg')).toBeVisible();
  await page.getByLabel('Playback sound',{exact:true}).selectOption('simple');
  await page.getByRole('heading',{name:'Practice study',exact:true}).click();
  await page.keyboard.down('Space');
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  await page.keyboard.down('Space');
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  await page.keyboard.up('Space');await page.keyboard.press('Space');
  await expect(page.getByRole('button',{name:'▶ Play',exact:true})).toBeVisible();
});

test('Aiken Drum follows its original notes and pickup across every score page', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/library');
  await page.getByRole('textbox',{name:'Find a song'}).pressSequentially('Aiken Drum');
  await page.getByRole('button',{name:'Open Aiken Drum',exact:true}).click();
  const score=page.getByRole('img',{name:/Original score, measures/});
  const cursor=score.locator('img[alt="Playback cursor"]');
  await expect(page.getByRole('checkbox',{name:'Follow playback',exact:true})).toBeChecked();
  await expect(cursor).toBeVisible();await expect(cursor).toHaveAttribute('data-score-beat','0');
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect.poll(async()=>Number(await cursor.getAttribute('data-score-beat'))).toBeGreaterThan(.25);
  await page.getByRole('button',{name:'Ⅱ Pause',exact:true}).click();
  const position=page.getByRole('slider',{name:'Playback position',exact:true});
  await position.fill('3.6'); // Beat 6.72: first bar on page two, after the pickup.
  await expect(page.getByText('Score page 2 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toHaveAttribute('data-measure','5');
  await expect(cursor).toHaveAttribute('data-score-beat','6.5');
  await expect(cursor).toBeVisible();
  await page.getByRole('button',{name:'Next score page →',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Follow playback',exact:true})).not.toBeChecked();
  await expect(page.getByText('Score page 3 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toBeHidden();
  await page.getByRole('checkbox',{name:'Follow playback',exact:true}).check();
  await expect(page.getByText('Score page 2 of 5',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Seek to score measure 5',exact:true}).click();
  await expect.poll(async()=>Number(await position.inputValue())).toBeCloseTo(6.5*60/112,2);
  await position.fill('8');
  await expect(page.getByText('Score page 3 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toHaveAttribute('data-measure','9');
  await position.fill('12.2');
  await expect(page.getByText('Score page 4 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toHaveAttribute('data-measure','13');
  await page.getByLabel('Playback speed').selectOption('2');
  await page.getByRole('button',{name:'▶ Play',exact:true}).click();
  await expect(page.getByText('Finished',{exact:true})).toBeVisible({timeout:10000});
  await expect(page.getByText('Score page 5 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toHaveAttribute('data-measure','17');
  await page.getByRole('button',{name:'Stop and rewind',exact:true}).click();
  await expect(page.getByText('Score page 1 of 5',{exact:true})).toBeVisible();
  await expect(cursor).toHaveAttribute('data-score-beat','0');
  await page.setViewportSize({width:390,height:844});await position.fill('2');
  await expect(cursor).toBeVisible();
  await expect.poll(async()=>cursor.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('[aria-label="Scrollable original sheet music"]')!.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right;})).toBe(true);
  await page.screenshot({path:'test-results/aiken-follow-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('composer surnames, portraits, full-name search and saved filters work together', async ({page,context})=>{
  await page.goto('/library');
  const composer=page.getByLabel('Composer',{exact:true});
  await expect(composer.locator('option').filter({hasText:'Beethoven, Ludwig van'})).toHaveAttribute('value','L. V. Beethoven');
  const labels=await composer.locator('option').allTextContents();
  expect(labels.slice(1)).toEqual([...labels.slice(1)].sort((a,b)=>a.localeCompare(b)));
  await composer.selectOption('L. V. Beethoven');
  await expect(page.locator('article').getByText('Beethoven, Ludwig van',{exact:true}).first()).toBeVisible();
  const portraits=page.getByRole('img',{name:'Portrait of Ludwig van Beethoven',exact:true});
  await expect(portraits.first()).toBeVisible();
  await expect.poll(()=>portraits.first().evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'test-results/composer-portraits.png',fullPage:true});
  await page.reload();await expect(composer).toHaveValue('L. V. Beethoven');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByRole('textbox',{name:'Find a song'}).pressSequentially('Johann Sebastian Bach');
  await expect(page.getByRole('img',{name:'Portrait of Johann Sebastian Bach',exact:true}).first()).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await context.setOffline(true);
  const bach=page.getByRole('img',{name:'Portrait of Johann Sebastian Bach',exact:true}).first();
  await expect.poll(()=>bach.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await context.setOffline(false);
});
