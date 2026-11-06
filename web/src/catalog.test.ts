// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CATALOG, DEFAULT_FILTERS, filterCatalog, loadCatalogPiece, matchesSearch, readPreferences } from './catalog';
import { parseMidi } from './music';
import { readMusicXml } from './original-score';
import { vi } from 'vitest';
import type { CatalogPiece } from './catalog';
const verified: (CatalogPiece & { sha256: Record<string,string> })[] = JSON.parse(readFileSync(resolve('src/catalog-data.json'), 'utf8'));
describe('reviewed free collection', () => {
  it('contains unique, playable editions with intact score assets and recorded provenance', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(5261);
    expect(CATALOG.map(({ kind, ...piece }) => piece)).toEqual(verified.map(piece => Object.fromEntries(Object.entries(piece).filter(([key]) => !['urls','sha256','archiveMembers','verified'].includes(key)))));
    expect(new Set(CATALOG.map(p => p.id)).size).toBe(CATALOG.length);
    for (const piece of verified) {
      expect(piece.sourceUrl).toMatch(/^https:\/\/(www.mutopiaproject.org|www.gutenberg.org)\//);
      expect(piece.rights).toMatch(/Public domain|Creative Commons Attribution/i);
      expect(piece.tags.length).toBeGreaterThan(0);
      for (const [kind,path] of Object.entries(piece.assets)) {
        const bytes = readFileSync(resolve('public', `.${path}`));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(piece.sha256[kind]);
        if (kind === 'midi') {
          const song = parseMidi(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), piece.title);
          expect(song.notes.length).toBeGreaterThan(0); expect(Math.abs(song.duration-piece.duration)).toBeLessThan(1);
        } else if (kind === 'musicxml') expect(readMusicXml(bytes.toString()).measures.length).toBeGreaterThan(0);
        else expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
      }
    }
  }, 600000);
  it('includes every published Mutopia edition, all seasons, nursery scores, and explicit score-only editions', async () => {
    const provenance = JSON.parse(readFileSync(resolve('../scripts/mutopia-provenance.json'), 'utf8')) as { id: string; sourceUrl: string; credit: string; files: { asset: string; sha256: string }[] }[];
    expect(provenance.length).toBe(2123);
    const included = new Set(CATALOG.map(p => p.sourceUrl));
    for (const edition of provenance) {
      expect(included.has(edition.sourceUrl), edition.id).toBe(true);
      expect(edition.credit.length).toBeGreaterThan(0);
      for (const file of edition.files) {
        const bytes = readFileSync(resolve('public', `.${file.asset}`));
        expect(createHash('sha256').update(bytes).digest('hex'), file.asset).toBe(file.sha256);
      }
    }
    const seasons = filterCatalog({ ...DEFAULT_FILTERS, query: 'Vivaldi four seasons' }, []);
    expect(seasons).toHaveLength(12);
    for (const season of ['Spring','Summer','Autumn','Winter']) expect(seasons.filter(p => p.title.includes(season))).toHaveLength(3);
    expect(CATALOG.filter(p => p.id.startsWith('nursery-') && p.assets.musicxml)).toHaveLength(60);
    const scoreOnly = CATALOG.filter(p => !p.assets.midi);
    expect(scoreOnly).toHaveLength(4);
    for (const piece of scoreOnly) {
      expect(piece.playbackUnavailable).toBeTruthy();
      await expect(loadCatalogPiece(piece, new AbortController().signal)).rejects.toThrow('MIDI');
    }
  }, 120000);
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
  it('keeps known movements and parts distinct without calling unknown selections complete works', () => {
    expect(CATALOG.find(p => p.id === 'mutopia-301-spring-score')?.kind).toBe('Movement');
    expect(CATALOG.find(p => p.id === 'mutopia-1775-part-v1')?.kind).toBe('Instrumental part');
    expect(CATALOG.find(p => p.id === 'nursery-opera-danceababy')?.kind).toBe('Piece / arrangement');
    const scores = filterCatalog({ ...DEFAULT_FILTERS, score: 'pdf-only' }, []);
    expect(scores).toHaveLength(4); expect(scores.every(p => p.kind === 'Score only')).toBe(true);
    const first = filterCatalog({ ...DEFAULT_FILTERS, collection: 'first-piano' }, []);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every(p => p.difficulty === 'Easy' && p.instruments.length === 1 && p.instruments[0] === 'Piano')).toBe(true);
  });
  it('clears obsolete filters and deduplicates stored favourites', () => {
    localStorage.setItem('scoreplay-library-preferences', JSON.stringify({ filters: { composer: 'Missing composer', kind: 'bad', score: 'bad', collection: 'bad', sort: 'bad', tags: ['gentle', 'gentle', 'nonexistent'] }, favorites: ['mutopia-37', 'mutopia-37'] }));
    expect(readPreferences()).toEqual({ filters: { ...DEFAULT_FILTERS, tags: ['gentle'] }, favorites: ['mutopia-37'] });
    localStorage.clear();
  });
});
