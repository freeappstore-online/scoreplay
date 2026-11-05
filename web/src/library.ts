import { parseMidi } from './music';
import { readMusicXml } from './original-score';
export type LibraryEntry = { id: string; name: string; title: string; displayTitle?: string; bytes: ArrayBuffer; musicxml?: string; pdf?: ArrayBuffer; added: number };
export const LIBRARY_LIMIT = 100;
export class LibraryFullError extends Error {
  constructor() { super(`Your files hold up to ${LIBRARY_LIMIT} arrangements. Remove one before saving more.`); }
}
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
    const entry = groups.get(id) ?? { ...(existing.find(e => e.id === id) ?? { id, title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), added: Date.now() }) };
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
  if (combined.size > LIBRARY_LIMIT) throw new LibraryFullError();
  return entries;
}
