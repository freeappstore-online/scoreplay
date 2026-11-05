import { useEffect, useRef, useState } from 'react';
import { Badge, Card, ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui';
import { DISNEY_CATALOG, libraryId, prepareLibrary, type LibraryEntry } from './library';
import { libraryEntries, savedFile, writeLibrary } from './storage';
export default function Library({ onOpen }: { onOpen: (entry: LibraryEntry) => void }) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [remove, setRemove] = useState<LibraryEntry | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void libraryEntries().then(setEntries).catch(() => setError('Local storage is unavailable. Enable browser storage to use your library.')); }, []);
  const refresh = async () => setEntries(await libraryEntries());
  const importFiles = async (files: File[]) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { const prepared = await prepareLibrary(files, await libraryEntries()); await writeLibrary(prepared); await refresh(); setNotice(`${prepared.length} arrangement${prepared.length === 1 ? '' : 's'} saved on this device.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save these files. Your browser may be out of storage.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const removeEntry = async () => {
    if (!remove) return;
    try { await writeLibrary([], remove.id); const last = await savedFile(); if (last && libraryId(last.name) === remove.id) await savedFile(null); await refresh(); setNotice(`${remove.title} removed from this device.`); }
    catch { setError('Could not remove the arrangement. Please try again.'); }
    finally { setRemove(null); }
  };
  const needle = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(e => e.title.toLocaleLowerCase().includes(needle));
  const catalog = DISNEY_CATALOG.filter(e => `${e.title} ${e.film}`.toLocaleLowerCase().includes(needle));
  const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel disabled:opacity-40';
  return <>
    <PageHeader title="Your music library." description="Keep the arrangements you love, with the scores that belong to them." actions={<Badge variant="success">Private on this device</Badge>} />
    <section className="space-y-3 rounded-2xl border border-dashed border-line-strong bg-panel p-5" aria-label="Library import" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFiles([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">Add an arrangement—or a whole collection</h2><p className="mt-2 text-sm text-muted">Select MIDI files and their matching MusicXML or PDF scores together.</p></div><button className={button} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Importing…' : '↑ Import music files'}</button></div>
      <p className="text-xs leading-5 text-muted">Matching names pair automatically: Belle-melody.mid + Belle-melody.musicxml + Belle-melody.pdf. Reimporting a filename updates that arrangement. Files stay in this browser.</p>
      <input ref={input} className="sr-only" type="file" multiple accept=".mid,.midi,.musicxml,.xml,.pdf" aria-label="Import library files" onChange={e => void importFiles([...e.target.files ?? []])} />
    </section>
    <label className="block"><span className="mb-2 block text-sm font-semibold">Find a song</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search songs or films…" className="min-h-11 w-full rounded-xl border border-line bg-paper px-4 text-ink" /></label>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    <p role="status" className="min-h-5 text-sm text-muted">{notice}</p>
    <section className="space-y-4" aria-label="My arrangements"><div className="flex items-center gap-3"><h2 className="text-2xl">My arrangements</h2><Badge>{entries.length}</Badge></div>
      {!filtered.length ? <p className="rounded-xl border border-line p-6 text-sm text-muted">{entries.length ? 'No arrangements match your search.' : 'Import your MIDI files to start your library. Add MusicXML for the original notation, and PDF for the printed score.'}</p> : <div className="grid gap-4 md:grid-cols-2">{filtered.map(entry => <Card key={entry.id}><div className="space-y-4"><div><h3 className="text-xl capitalize">{entry.title}</h3><p className="mt-1 break-all text-xs text-muted">{entry.name}</p></div><div className="flex flex-wrap gap-2"><Badge>MIDI playback</Badge>{entry.musicxml && <Badge variant="accent">Original sheet music</Badge>}{entry.pdf && <Badge>PDF score</Badge>}</div><div className="flex flex-wrap gap-2"><button className={button} onClick={() => onOpen(entry)} aria-label={`Open ${entry.title}`}>Open & play</button><button className={button} aria-label={`Remove ${entry.title}`} onClick={() => setRemove(entry)}>Remove</button></div></div></Card>)}</div>}
    </section>
    <section className="space-y-4 border-t border-line pt-6" aria-label="Disney song discovery"><h2 className="text-2xl">Discover Disney songs</h2><p className="text-sm leading-6 text-muted">Licensed sheet-music sources for familiar favourites. These links open the publisher or retailer; they are not bundled MIDI downloads. Import your own MIDI to play here, and a matching MusicXML or PDF score if you have one.</p>
      <div className="grid gap-4 sm:grid-cols-2">{catalog.map(song => <Card key={song.title}><div className="space-y-3"><div><p className="text-xs uppercase tracking-wider text-muted">{song.film}</p><h3 className="mt-1 text-xl">{song.title}</h3></div><p className="text-xs text-muted">{song.source}</p><a href={song.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-4">View licensed score ↗</a></div></Card>)}</div>
      {!catalog.length && <p className="text-sm text-muted">No Disney titles match your search.</p>}
    </section>
    <ConfirmDialog open={!!remove} title="Remove this arrangement?" message="Its MIDI and attached scores will be removed from this browser. Your original files are unaffected." confirmLabel="Remove arrangement" variant="danger" onCancel={() => setRemove(null)} onConfirm={() => void removeEntry()} />
  </>;
}
