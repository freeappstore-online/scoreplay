import data from './catalog-data.json';
import type { LibraryEntry } from './library';
import { parseMidi } from './music';
import { readMusicXml } from './original-score';
export type CatalogPiece = typeof data[number];
export const CATALOG: CatalogPiece[] = data;
export type Filters = { query: string; scope: string; category: string; difficulty: string; instrument: string; composer: string; duration: string; score: string; tags: string[]; sort: string };
export const DEFAULT_FILTERS: Filters = { query: '', scope: 'free', category: '', difficulty: '', instrument: '', composer: '', duration: '', score: '', tags: [], sort: 'title' };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export const matchesSearch = (text: string, query: string) => normalize(query).trim().split(/\s+/).every(word => normalize(text).includes(word));
export function filterCatalog(filters: Filters, favorites: string[]) {
  const result = CATALOG.filter(p => matchesSearch([p.title,p.composer,p.category,p.description,...p.instruments,...p.tags].join(' '), filters.query)
    && (!filters.category || p.category === filters.category) && (!filters.difficulty || p.difficulty === filters.difficulty)
    && (!filters.instrument || p.instruments.includes(filters.instrument)) && (!filters.composer || p.composer === filters.composer)
    && (!filters.duration || p.duration <= Number(filters.duration)) && (!filters.score || !!p.assets.musicxml)
    && filters.tags.every(tag => p.tags.includes(tag)) && (filters.scope !== 'favorites' || favorites.includes(p.id)));
  const levels = ['Easy','Intermediate','Advanced'];
  return result.sort((a,b) => (filters.sort === 'duration' ? a.duration-b.duration : filters.sort === 'difficulty' ? levels.indexOf(a.difficulty)-levels.indexOf(b.difficulty) : filters.sort === 'composer' ? a.composer.localeCompare(b.composer) : 0) || a.title.localeCompare(b.title));
}
export function readPreferences(): { filters: Filters; favorites: string[] } {
  try {
    const saved = JSON.parse(localStorage.getItem('scoreplay-library-preferences') ?? '{}');
    const filters = { ...DEFAULT_FILTERS };
    for (const key of Object.keys(filters) as (keyof Filters)[]) {
      if (key === 'tags') filters.tags = Array.isArray(saved.filters?.tags) ? saved.filters.tags.filter((t: unknown) => typeof t === 'string') : [];
      else if (typeof saved.filters?.[key] === 'string') filters[key] = saved.filters[key];
    }
    if (!['free','mine','favorites'].includes(filters.scope)) filters.scope = 'free';
    return { filters, favorites: Array.isArray(saved.favorites) ? saved.favorites.filter((id: unknown) => typeof id === 'string') : [] };
  } catch { return { filters: { ...DEFAULT_FILTERS }, favorites: [] }; }
}
export async function loadCatalogPiece(piece: CatalogPiece, signal: AbortSignal): Promise<LibraryEntry> {
  const get = async (url: string) => { const response = await fetch(url, { signal }); if (!response.ok) throw new Error('This piece could not be downloaded. Check your connection and try again.'); return response.arrayBuffer(); };
  const [bytes, pdf, xmlBytes] = await Promise.all([get(piece.assets.midi), get(piece.assets.pdf), piece.assets.musicxml ? get(piece.assets.musicxml) : undefined]);
  parseMidi(bytes, piece.title);
  if (new TextDecoder().decode(pdf.slice(0,5)) !== '%PDF-') throw new Error('The score download was incomplete. Please try again.');
  const musicxml = xmlBytes ? readMusicXml(new TextDecoder().decode(xmlBytes)).xml : undefined;
  return { id: piece.id, name: `${piece.id}.mid`, title: piece.title, displayTitle: piece.title, bytes, pdf, musicxml, added: Date.now() };
}
