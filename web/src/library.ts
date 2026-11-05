import { parseMidi } from './music';
import { readMusicXml } from './original-score';
export type LibraryEntry = { id: string; name: string; title: string; bytes: ArrayBuffer; musicxml?: string; pdf?: ArrayBuffer; added: number };
export const libraryId = (name: string) => name.replace(/\.(mid|midi|musicxml|xml|pdf)$/i, '').toLowerCase();
export async function prepareLibrary(files: File[], existing: LibraryEntry[]) {
  if (!files.length) return [];
  if (files.length > 100) throw new Error('Import up to 100 files at a time.');
  const groups = new Map<string, Partial<LibraryEntry>>();
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['mid','midi','musicxml','xml','pdf'].includes(extension ?? '')) throw new Error(`Unsupported file: ${file.name}`);
    if (file.size > (extension === 'pdf' ? 20 : 5) * 1024 * 1024) throw new Error(`${file.name} is too large. MIDI/MusicXML: 5 MB; PDF: 20 MB.`);
    const id = libraryId(file.name);
    const entry = groups.get(id) ?? { ...existing.find(e => e.id === id), id, title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), added: Date.now() };
    const bytes = await file.arrayBuffer();
    if (extension === 'mid' || extension === 'midi') { parseMidi(bytes, file.name); entry.bytes = bytes; entry.name = file.name; }
    else if (extension === 'pdf') {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error(`${file.name} is not a valid PDF.`);
      entry.pdf = bytes;
    } else entry.musicxml = readMusicXml(new TextDecoder().decode(bytes)).xml;
    groups.set(id, entry);
  }
  const entries: LibraryEntry[] = [];
  for (const [id, entry] of groups) {
    if (!entry.bytes || !entry.name) throw new Error(`Add the matching MIDI for “${id}” too. MIDI and score filenames must match before the extension.`);
    entries.push(entry as LibraryEntry);
  }
  const combined = new Map(existing.map(e => [e.id, e])); entries.forEach(e => combined.set(e.id, e));
  if (combined.size > 100) throw new Error('This library supports 100 arrangements. Remove one before adding more.');
  return entries;
}

export const DISNEY_CATALOG = [
  { title: 'Belle', film: 'Beauty and the Beast', url: 'https://www.musicnotes.com/sheetmusic/beauty-and-the-beast/belle/MN0057057', source: 'Musicnotes · piano, vocal & guitar' },
  { title: 'Let It Go', film: 'Frozen', url: 'https://www.halleonard.com/product/140822/let-it-go', source: 'Hal Leonard · easy piano' },
  ...[
    ['A Whole New World', 'Aladdin'], ["How Far I’ll Go", 'Moana'], ['Part of Your World', 'The Little Mermaid'],
    ['Can You Feel the Love Tonight?', 'The Lion King'], ['I See the Light', 'Tangled'], ['Reflection', 'Mulan'],
  ].map(([title, film]) => ({ title, film, url: 'https://www.halleonard.com/product/354996/disney-goes-classical', source: 'Hal Leonard · Disney Goes Classical songbook' })),
];
