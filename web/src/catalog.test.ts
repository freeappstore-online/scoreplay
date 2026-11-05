// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CATALOG, DEFAULT_FILTERS, filterCatalog, loadCatalogPiece, matchesSearch, readPreferences } from './catalog';
import { parseMidi } from './music';
import { readMusicXml } from './original-score';
import { vi } from 'vitest';
describe('reviewed free collection', () => {
  it('contains unique, playable editions with intact score assets and recorded provenance', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(143);
    expect(new Set(CATALOG.map(p => p.id)).size).toBe(CATALOG.length);
    for (const piece of CATALOG) {
      expect(piece.sourceUrl).toMatch(/^https:\/\/(www.mutopiaproject.org|www.gutenberg.org)\//);
      expect(piece.rights.toLowerCase()).toContain('public domain');
      expect(piece.tags.length).toBeGreaterThan(0);
      for (const [kind,path] of Object.entries(piece.assets)) {
        const bytes = readFileSync(resolve('public', `.${path}`));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(piece.sha256[kind as keyof typeof piece.sha256]);
        if (kind === 'midi') {
          const song = parseMidi(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), piece.title);
          expect(song.notes.length).toBeGreaterThan(0); expect(Math.abs(song.duration-piece.duration)).toBeLessThan(1);
        } else if (kind === 'musicxml') expect(readMusicXml(bytes.toString()).measures.length).toBeGreaterThan(0);
        else expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
      }
    }
  }, 30000);
  it('combines search, tags, difficulty, instrument, duration, score type and favourites', () => {
    expect(matchesSearch('Für Elise · L. V. Beethoven','fur beethoven')).toBe(true);
    expect(matchesSearch('London Bridge','London waltz')).toBe(false);
    const filters = { ...DEFAULT_FILTERS, category:'Children & learning', difficulty:'Easy', instrument:'Piano', duration:'180', score:'musicxml', tags:['learning','english'], sort:'duration' };
    const results = filterCatalog(filters, []);
    expect(results.length).toBeGreaterThan(3);
    expect(results.every(p => p.assets.musicxml && p.duration<=180 && p.tags.includes('english'))).toBe(true);
    expect(results.map(p => p.duration)).toEqual(results.map(p => p.duration).sort((a,b) => a-b));
    expect(filterCatalog({ ...filters, scope:'favorites' }, [results[0].id])).toEqual([results[0]]);
    expect(filterCatalog({ ...filters, instrument:'Trumpet' }, [])).toEqual([]);
  });
  it('recovers from invalid stored preferences and a failed download', async () => {
    localStorage.setItem('scoreplay-library-preferences','{'); expect(readPreferences().filters).toEqual(DEFAULT_FILTERS);
    localStorage.setItem('scoreplay-library-preferences', JSON.stringify({ filters: { scope:'bad',query:3,tags:[1,'gentle'] }, favorites:'bad' }));
    expect(readPreferences()).toEqual({ filters:{...DEFAULT_FILTERS,tags:['gentle']},favorites:[] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:false }));
    await expect(loadCatalogPiece(CATALOG[0], new AbortController().signal)).rejects.toThrow('could not be downloaded');
    vi.unstubAllGlobals(); localStorage.clear();
  });
});
