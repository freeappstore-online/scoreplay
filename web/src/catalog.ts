import catalogJson from './catalog-runtime.json?raw';
import { composerInfo } from './composers';
import type { LibraryEntry } from './library';
import { parseMidi } from './music';
import { readMusicXml } from './original-score';
type Assets = { midi?: string; pdf: string; musicxml?: string };
export type CatalogPiece = {
  id: string; title: string; composer: string; category: string; difficulty: string;
  instruments: string[]; tags: string[]; description: string; source: string;
  sourceUrl: string; rights: string; rightsUrl: string; edition: string;
  assets: Assets; duration: number; bpm: number;
  creditsUrl?: string; playbackUnavailable?: string;
};
type PieceFields = 'id' | 'title' | 'description' | 'assets' | 'duration' | 'bpm' | 'playbackUnavailable';
const data: { editions: Omit<CatalogPiece, PieceFields>[]; pieces: (Pick<CatalogPiece, PieceFields> & { editionIndex: number })[] } = JSON.parse(catalogJson);
export const CATALOG: CatalogPiece[] = data.pieces.map(({ editionIndex, ...piece }) => ({ ...data.editions[editionIndex], ...piece }));
export type Filters = { query: string; scope: string; category: string; difficulty: string; instrument: string; composer: string; duration: string; score: string; tags: string[]; sort: string };
export const DEFAULT_FILTERS: Filters = { query: '', scope: 'free', category: '', difficulty: '', instrument: '', composer: '', duration: '', score: '', tags: [], sort: 'title' };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export const matchesSearch = (text: string, query: string) => normalize(query).trim().split(/\s+/).every(word => normalize(text).includes(word));
const searchIndex = new Map(CATALOG.map(p => [p.id, normalize([p.title,p.composer,composerInfo(p.composer).fullName,composerInfo(p.composer).label,p.category,p.description,...p.instruments,...p.tags].join(' '))]));
export function filterCatalog(filters: Filters, favorites: string[]) {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean);
  const result = CATALOG.filter(p => words.every(word => searchIndex.get(p.id)!.includes(word))
    && (!filters.category || p.category === filters.category) && (!filters.difficulty || p.difficulty === filters.difficulty)
    && (!filters.instrument || p.instruments.includes(filters.instrument)) && (!filters.composer || p.composer === filters.composer)
    && (!filters.duration || (p.duration > 0 && p.duration <= Number(filters.duration))) && (!filters.score || !!p.assets.musicxml)
    && filters.tags.every(tag => p.tags.includes(tag)) && (filters.scope !== 'favorites' || favorites.includes(p.id)));
  const levels = ['Easy','Intermediate','Advanced','Not rated'];
  return result.sort((a,b) => (filters.sort === 'duration' ? (a.duration || Infinity)-(b.duration || Infinity) : filters.sort === 'difficulty' ? levels.indexOf(a.difficulty)-levels.indexOf(b.difficulty) : filters.sort === 'composer' ? composerInfo(a.composer).label.localeCompare(composerInfo(b.composer).label) : 0) || a.title.localeCompare(b.title));
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
async function getAsset(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('This piece could not be downloaded. Check your connection and try again.');
  return response.arrayBuffer();
}
export async function loadCatalogSong(piece: CatalogPiece, signal: AbortSignal) {
  if (!piece.assets.midi) throw new Error(piece.playbackUnavailable || 'This edition has no MIDI. Open its PDF in the library.');
  const song = parseMidi(await getAsset(piece.assets.midi, signal), piece.title);
  song.title = piece.title;
  return song;
}
export async function loadCatalogPiece(piece: CatalogPiece, signal: AbortSignal): Promise<LibraryEntry> {
  if (!piece.assets.midi) throw new Error(piece.playbackUnavailable || 'This edition has no MIDI. Open its PDF in the library.');
  const [bytes, pdf, xmlBytes] = await Promise.all([getAsset(piece.assets.midi, signal), getAsset(piece.assets.pdf, signal), piece.assets.musicxml ? getAsset(piece.assets.musicxml, signal) : undefined]);
  parseMidi(bytes, piece.title);
  if (new TextDecoder().decode(pdf.slice(0,5)) !== '%PDF-') throw new Error('The score download was incomplete. Please try again.');
  const musicxml = xmlBytes ? readMusicXml(new TextDecoder().decode(xmlBytes)).xml : undefined;
  return { id: piece.id, catalogId: piece.id, name: `${piece.id}.mid`, title: piece.title, displayTitle: piece.title, bytes, pdf, musicxml, added: Date.now() };
}
