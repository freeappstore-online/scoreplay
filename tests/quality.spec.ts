import { test, expect } from '@playwright/test';

test('discovery stays compact, classifications filter honestly, and selections stand out in both themes', async ({ page }) => {
  await page.goto('/library');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.getByRole('region', { name: 'Music collections' }).getByRole('button', { name: /Famous melodies/ }).click();
    const active = page.getByRole('region', { name: 'Music collections' }).getByRole('button', { name: /Famous melodies/ });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    const selected = await active.evaluate(el => getComputedStyle(el).backgroundColor);
    const plain = await page.getByRole('button', { name: /Explore everything/ }).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(selected).not.toBe(plain);
  }
  await page.getByRole('region', { name: 'Music collections' }).getByRole('button', { name: /First piano pieces/ }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.getByText(/First piano pieces · 13 pieces found/)).toBeVisible();
  await page.getByRole('button', { name: /Explore everything/ }).click();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByLabel('Arrangement', { exact: true }).selectOption('Instrumental part');
  await expect(page.getByRole('article').first().getByText('Instrumental part', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Score format', { exact: true }).selectOption('pdf-only');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^Preview / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('Filters', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByLabel('Find a song', { exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/quality-library-mobile.png' });
});

test.describe('recoverable file failures', () => {
  test.use({ serviceWorkers: 'block' });
  test('saving a catalog edition cannot overwrite a private import with the same filename', async ({ page }) => {
    await page.goto('/library');
    const response = await page.request.get('/music/nursery-opera-danceababy/score.mid');
    const original = await response.body();
    await page.getByLabel('Import library files').setInputFiles({ name: 'nursery-aikendrum.mid', mimeType: 'audio/midi', buffer: original });
    await expect(page.getByRole('button', { name: 'My files (1)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Free collection', exact: true }).click();
    await page.getByLabel('Find a song', { exact: true }).pressSequentially('Aiken Drum');
    await page.getByRole('button', { name: 'Save to my files', exact: true }).click();
    await expect(page.getByRole('article').getByRole('alert')).toContainText('personal arrangement already uses this filename');
    const stored = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
      const request = indexedDB.open('scoreplay', 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, read = db.transaction('library').objectStore('library').get('nursery-aikendrum');
        read.onsuccess = () => { resolve([...new Uint8Array(read.result.bytes)]); db.close(); };
      };
    }));
    expect(Buffer.from(stored)).toEqual(original);
    await page.getByRole('button', { name: 'Open Aiken Drum', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aiken Drum', exact: true })).toBeVisible();
  });

  test('missing files explain the server problem, and both preview and open retry in place', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scoreplay-sound-mode', 'simple'));
    await page.goto('/library');
    await page.getByLabel('Find a song', { exact: true }).pressSequentially('Dance a Baby');
    await page.route('**/music/nursery-opera-danceababy/score.mid', route => route.fulfill({ status: 404, body: 'Not found' }));
    await page.getByRole('button', { name: 'Preview Dance a Baby', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Music preview' });
    await expect(preview.getByRole('alert')).toContainText('unavailable on the server');
    await expect(preview.getByRole('alert')).not.toContainText('connection');
    await page.unroute('**/music/nursery-opera-danceababy/score.mid');
    await preview.getByRole('button', { name: 'Retry preview', exact: true }).click();
    await expect(preview.getByText('Playing preview', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => document.documentElement.dataset.text = 'lg');
    expect(await preview.getByText('Playing preview', { exact: true }).evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(30);
    expect(await preview.getByText('Dance a Baby', { exact: true }).evaluate(el => el.clientWidth)).toBeGreaterThan(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await preview.getByRole('button', { name: 'Stop preview', exact: true }).click();
    await page.route('**/music/nursery-opera-danceababy/score.pdf', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.getByRole('button', { name: 'Open Dance a Baby', exact: true }).click();
    const card = page.getByRole('article');
    await expect(card.getByRole('alert')).toContainText('server is temporarily unavailable');
    await page.unroute('**/music/nursery-opera-danceababy/score.pdf');
    await card.getByRole('button', { name: 'Retry Dance a Baby', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dance a Baby', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /Original score, measures/ }).locator('svg')).toBeVisible();
    const original = page.getByRole('button', { name: 'Original score', exact: true });
    const transcription = page.getByRole('button', { name: 'MIDI transcription', exact: true });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      expect(await original.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await transcription.evaluate(el => getComputedStyle(el).backgroundColor));
    }
  });

  test('saved catalog copies share one favourite and reopen from free results without downloads', async ({ page }) => {
    await page.goto('/library');
    await page.getByLabel('Find a song', { exact: true }).pressSequentially('Aiken Drum');
    await page.getByRole('button', { name: 'Save to my files', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved to my files', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Favourite Aiken Drum', exact: true }).click();
    await page.getByRole('button', { name: 'My files (1)', exact: true }).click();
    const star = page.getByRole('button', { name: 'Favourite saved Aiken Drum', exact: true });
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await star.click(); await expect(page.getByRole('button', { name: 'Favourites (0)', exact: true })).toBeVisible();
    await star.click(); await page.getByRole('button', { name: 'Favourites (1)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Aiken Drum', exact: true })).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Favourites (1)', exact: true })).toBeVisible();
    const requests: string[] = [];
    await page.route('**/music/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.getByRole('button', { name: 'Open Aiken Drum', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aiken Drum', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /Original score, measures/ }).locator('svg')).toBeVisible();
    expect(requests).toEqual([]);
  });
});
