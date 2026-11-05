import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { COMPOSERS, composerInfo } from './composers';
import { CATALOG, DEFAULT_FILTERS, filterCatalog } from './catalog';
it('displays and sorts surnames first while accepting full composer names in search', () => {
  expect(composerInfo('L. V. Beethoven').label).toBe('Beethoven, Ludwig van');
  const results = filterCatalog({ ...DEFAULT_FILTERS, query: 'Johann Sebastian Bach' }, []);
  expect(results.length).toBeGreaterThan(0);
  expect(results.every(p => p.composer === 'J. S. Bach')).toBe(true);
  const sorted = filterCatalog({ ...DEFAULT_FILTERS, sort: 'composer' }, []).map(p => composerInfo(p.composer).label);
  expect(sorted).toEqual([...sorted].sort((a,b)=>a.localeCompare(b)));
  for (const piece of CATALOG.filter(p=>!p.composer.startsWith('Traditional'))) expect(COMPOSERS[piece.composer]).toBeDefined();
});
it('ships intact public-domain portraits with source credits and honest missing-portrait fallbacks', () => {
  const portraits = Object.values(COMPOSERS).flatMap(p=>p.portrait ? [p.portrait] : []);
  expect(portraits).toHaveLength(14);
  for(const portrait of portraits) {
    const bytes = readFileSync(resolve('public', `.${portrait.url}`));
    expect(bytes.length).toBe(portrait.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(portrait.sha256);
    expect(portrait.rights).toBe('Public domain');
    expect(portrait.sourceUrl).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/);
    expect(portrait.artist.length).toBeGreaterThan(0);
  }
  expect(composerInfo('Christian Petzold').portrait).toBeUndefined();
  expect(composerInfo('Traditional').label).toBe('Traditional');
});
