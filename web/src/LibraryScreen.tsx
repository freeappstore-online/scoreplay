import { useEffect, useRef, useState } from 'react';
import { Badge, Card, ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui';
import { libraryId, prepareLibrary, type LibraryEntry } from './library';
import { libraryEntries, savedFile, writeLibrary } from './storage';
import { CATALOG, DEFAULT_FILTERS, filterCatalog, loadCatalogPiece, matchesSearch, readPreferences, type CatalogPiece, type Filters } from './catalog';
import { formatTime } from './music';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel disabled:opacity-40';
const control = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-paper px-3 text-sm text-ink';
const options = (key: 'category' | 'difficulty' | 'composer' | 'instruments' | 'tags') => [...new Set(CATALOG.flatMap(p => p[key]))].sort();
export default function Library({ onOpen }: { onOpen: (entry: LibraryEntry) => Promise<void> }) {
  const [initial] = useState(readPreferences);
  const [filters, setFilters] = useState(initial.filters), [favorites, setFavorites] = useState(initial.favorites);
  const [entries, setEntries] = useState<LibraryEntry[]>([]), [limit, setLimit] = useState(12);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [remove, setRemove] = useState<LibraryEntry | null>(null);
  const input = useRef<HTMLInputElement>(null), request = useRef<AbortController | null>(null);
  useEffect(() => { void libraryEntries().then(setEntries).catch(() => setError('Local storage is unavailable. You can still browse and open the free collection.')); return () => request.current?.abort(); }, []);
  useEffect(() => { try { localStorage.setItem('scoreplay-library-preferences', JSON.stringify({ filters, favorites })); } catch { setNotice('Preferences cannot be saved in this browser.'); } }, [filters, favorites]);
  useEffect(() => setLimit(12), [filters]);
  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(f => ({ ...f, [key]: value }));
  const favorite = (id: string) => setFavorites(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id]);
  const tag = (value: string) => change('tags', filters.tags.includes(value) ? filters.tags.filter(t => t !== value) : [...filters.tags,value]);
  const refresh = async () => setEntries(await libraryEntries());
  const importFiles = async (files: File[]) => {
    if (busy) return; setBusy('import'); setError(''); setNotice('');
    try { const prepared = await prepareLibrary(files, await libraryEntries()); await writeLibrary(prepared); await refresh(); setFilters({ ...DEFAULT_FILTERS, scope: 'mine' }); setNotice(`${prepared.length} arrangement${prepared.length === 1 ? '' : 's'} saved on this device.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save these files. Your browser may be out of storage.'); }
    finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const usePiece = async (piece: CatalogPiece, save: boolean) => {
    if (busy) return;
    const controller = new AbortController(); request.current = controller; setBusy(piece.id); setError(''); setNotice('');
    try {
      const entry = await loadCatalogPiece(piece, controller.signal);
      if (save) {
        const current = await libraryEntries();
        if (current.length >= 100 && !current.some(e => e.id === entry.id)) throw new Error('Your files hold up to 100 arrangements. Remove one before saving more.');
        await writeLibrary([entry]); await refresh(); setNotice(`${piece.title} saved with its score on this device.`);
      } else await onOpen(entry);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not open this piece. Please try again.'); }
    finally { if (!controller.signal.aborted) { setBusy(''); request.current = null; } }
  };
  const removeEntry = async () => {
    if (!remove) return;
    try { await writeLibrary([], remove.id); const last = await savedFile(); if (last && libraryId(last.name) === remove.id) await savedFile(null); await refresh(); setFavorites(ids => ids.filter(id => id !== `local:${remove.id}`)); setNotice(`${remove.title} removed from this device.`); }
    catch { setError('Could not remove the arrangement. Please try again.'); }
    finally { setRemove(null); }
  };
  const catalog = filters.scope === 'mine' ? [] : filterCatalog(filters, favorites);
  const hasMetadataFilter = !!(filters.category || filters.difficulty || filters.instrument || filters.composer || filters.duration || filters.score || filters.tags.length);
  const eligibleIds = new Set(filterCatalog({ ...filters, scope: 'free' }, []).map(p => p.id));
  const own = filters.scope === 'free' ? [] : entries.filter(e => matchesSearch(e.title,filters.query) && (!hasMetadataFilter || eligibleIds.has(e.id)) && (filters.scope !== 'favorites' || favorites.includes(`local:${e.id}`)));
  const isFiltered = Object.entries(filters).some(([key,value]) => !['scope','sort'].includes(key) && (Array.isArray(value) ? value.length : value));
  const clear = () => setFilters({ ...DEFAULT_FILTERS, scope: filters.scope });
  const select = (label: string, key: 'category'|'difficulty'|'instrument'|'composer'|'duration'|'score'|'sort', values: [string,string][]) => <label className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span><select aria-label={label} className={control} value={filters[key]} onChange={e => change(key,e.target.value)}>{values.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <>
    <PageHeader title="Find your next favourite." description={`${CATALOG.length} free pieces. Real scores. A little practice, every day.`} actions={<Badge variant="success">Free to play & download</Badge>} />
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-label="Music collections">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">A shelf for every mood</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[
        ['♫','Explore everything','All free pieces','',[]], ['☀','Little learners','Nursery songs & sing-alongs','Children & learning',[]], ['♬','Classical favourites','Bach, Beethoven & beyond','Classical',[]], ['☾','A quieter moment','Gentle pieces & lullabies','',['gentle']],
      ].map(([icon,title,subtitle,category,tags]) => <button key={String(title)} className="min-w-0 rounded-xl border border-line bg-paper p-4 text-left transition-colors hover:border-accent" onClick={() => setFilters({ ...DEFAULT_FILTERS, category: category as string, tags: tags as string[] })}><span aria-hidden="true" className="text-2xl text-accent">{icon}</span><span className="mt-3 block text-base font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-muted">{subtitle}</span></button>)}</div>
    </section>
    <div role="group" aria-label="Library shelves" className="flex flex-wrap gap-2">{[['free','Free collection'],['mine',`My files (${entries.length})`],['favorites',`Favourites (${favorites.length})`]].map(([value,label]) => <button key={value} className={`${button} ${filters.scope === value ? 'border-accent bg-accent-soft text-accent' : ''}`} aria-pressed={filters.scope === value} onClick={() => setFilters(f => ({ ...DEFAULT_FILTERS, scope: value, query: f.query }))}>{label}</button>)}</div>
    <section className="space-y-4" aria-label="Search and filters">
      <label className="block"><span className="mb-2 block text-sm font-semibold">Find a song</span><input value={filters.query} onChange={e => change('query',e.target.value)} placeholder="Search titles, composers, moods or tags…" className={control} /></label>
      {filters.scope !== 'mine' && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {select('Category','category',[['','All categories'],...options('category').map(x => [x,x] as [string,string])])}
          {select('Difficulty · estimated','difficulty',[['','All levels'],...['Easy','Intermediate','Advanced'].map(x => [x,x] as [string,string])])}
          {select('Instrument','instrument',[['','All instruments'],...options('instruments').map(x => [x,x] as [string,string])])}
          {select('Composer','composer',[['','All composers'],...options('composer').map(x => [x,x] as [string,string])])}
          {select('Length','duration',[['','Any duration'],['60','Under 1 minute'],['180','Under 3 minutes'],['300','Under 5 minutes']])}
          {select('Score format','score',[['','All scores'],['musicxml','Original MusicXML']])}
          <label className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted">Add a tag</span><select aria-label="Add a tag" className={control} value="" onChange={e => { if (e.target.value) tag(e.target.value); }}><option value="">Choose a tag…</option>{options('tags').filter(t => !filters.tags.includes(t)).map(t => <option key={t}>{t}</option>)}</select></label>
          {select('Sort by','sort',[['title','Title A–Z'],['composer','Composer A–Z'],['duration','Shortest first'],['difficulty','Easiest first']])}
        </div>
        <div className="flex flex-wrap gap-2">{filters.tags.map(t => <button className={`${button} border-accent text-accent`} key={t} aria-label={`Remove tag ${t}`} onClick={() => tag(t)}>{t} ×</button>)}</div>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted">{catalog.length + own.length} {catalog.length + own.length === 1 ? 'piece' : 'pieces'} found{filters.scope === 'free' ? ` · ${CATALOG.length} in the collection` : ''}</p>{isFiltered && <button className={button} onClick={clear}>Clear filters</button>}</div>
    </section>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    {busy && busy !== 'import' && <p role="status" className="text-sm text-muted">Opening music and score…</p>}
    {filters.scope !== 'mine' && <section className="space-y-4" aria-label="Free music results">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.slice(0,limit).map(piece => <Card key={piece.id}><article className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted">{piece.category}</p><h2 className="mt-2 text-xl">{piece.title}</h2><p className="mt-2 text-sm text-muted">{piece.composer}</p></div><button className="min-h-11 min-w-11 shrink-0 rounded-lg text-xl text-accent hover:bg-accent-soft" aria-label={`Favourite ${piece.title}`} aria-pressed={favorites.includes(piece.id)} onClick={() => favorite(piece.id)}>{favorites.includes(piece.id) ? '★' : '☆'}</button></div>
        <div className="flex flex-wrap gap-2"><Badge>{piece.difficulty}</Badge><Badge>{formatTime(piece.duration)}</Badge><Badge>{piece.instruments.join(' + ')}</Badge></div>
        <div className="flex flex-wrap gap-1.5">{piece.tags.map(t => <button key={t} className={`min-h-8 rounded-full border px-2.5 py-1 text-xs ${filters.tags.includes(t) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-accent'}`} aria-pressed={filters.tags.includes(t)} onClick={() => tag(t)}>#{t}</button>)}</div>
        <p className="text-xs leading-5 text-muted">{piece.assets.musicxml ? 'Original sheet music + PDF' : 'MIDI sheet music + original PDF'}</p>
        <div className="mt-auto flex flex-wrap gap-2"><button className={`${button} border-accent text-accent`} disabled={!!busy} onClick={() => void usePiece(piece,false)} aria-label={`Open ${piece.title}`}>Open & play</button><button className={button} disabled={!!busy || entries.some(e => e.id === piece.id)} onClick={() => void usePiece(piece,true)}>{entries.some(e => e.id === piece.id) ? 'Saved to my files' : 'Save to my files'}</button></div>
        <details className="border-t border-line pt-3 text-xs leading-5 text-muted"><summary className="cursor-pointer py-1 font-semibold">About, downloads & credits</summary><div className="mt-3 space-y-3"><p>{piece.description}</p><p>{piece.edition}</p><p>{piece.rights} · <a className="text-accent underline" href={piece.rightsUrl} target="_blank" rel="noopener noreferrer">Rights details ↗</a></p><a className="block text-accent underline" href={piece.sourceUrl} target="_blank" rel="noopener noreferrer">{piece.source} ↗</a><div className="flex flex-wrap gap-4"><a className="min-h-8 text-accent underline" href={piece.assets.midi} download={`${piece.title}.mid`}>Download MIDI</a><a className="min-h-8 text-accent underline" href={piece.assets.pdf} download={`${piece.title}.pdf`}>Download PDF</a>{piece.assets.musicxml && <a className="min-h-8 text-accent underline" href={piece.assets.musicxml} download={`${piece.title}.musicxml`}>MusicXML</a>}</div></div></details>
      </article></Card>)}</div>
      {catalog.length > limit && <button className={`${button} w-full`} onClick={() => setLimit(n => n+12)}>Show more · {catalog.length-limit} remaining</button>}
    </section>}
    {filters.scope !== 'free' && <section className="space-y-4" aria-label="My arrangements"><h2 className="text-2xl">My arrangements</h2><p className="text-xs text-muted">Saved on this device. Search applies to your filenames and titles.</p><div className="grid gap-4 md:grid-cols-2">{own.map(entry => <Card key={entry.id}><div className="space-y-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl capitalize">{entry.title}</h3><p className="mt-1 break-all text-xs text-muted">{entry.name}</p></div><button className={button} aria-label={`Favourite saved ${entry.title}`} aria-pressed={favorites.includes(`local:${entry.id}`)} onClick={() => favorite(`local:${entry.id}`)}>{favorites.includes(`local:${entry.id}`) ? '★' : '☆'}</button></div><div className="flex flex-wrap gap-2"><Badge>MIDI playback</Badge>{entry.musicxml && <Badge variant="accent">Original sheet music</Badge>}{entry.pdf && <Badge>PDF score</Badge>}</div><div className="flex flex-wrap gap-2"><button className={button} disabled={!!busy} onClick={() => void onOpen(entry).catch(e => setError(e instanceof Error ? e.message : 'Could not open this arrangement.'))} aria-label={`Open ${entry.title}`}>Open & play</button><button className={button} aria-label={`Remove ${entry.title}`} onClick={() => setRemove(entry)}>Remove</button></div></div></Card>)}</div></section>}
    {!catalog.length && !own.length && <div className="rounded-2xl border border-dashed border-line p-8 text-center"><h2 className="text-xl">{filters.scope === 'mine' && !entries.length ? 'Your own music belongs here.' : filters.scope === 'favorites' && !favorites.length ? 'Start a shelf of favourites.' : 'No pieces match just yet.'}</h2><p className="mt-3 text-sm text-muted">{filters.scope === 'mine' ? 'Import your MIDI and matching scores below, or save a piece from the free collection.' : filters.scope === 'favorites' && !favorites.length ? 'Tap a star on any piece to keep it here.' : 'Try fewer filters, another tag, or a different search.'}</p>{isFiltered && <button className={`${button} mt-4`} onClick={clear}>Reset search and filters</button>}</div>}
    <section className="space-y-3 rounded-2xl border border-dashed border-line-strong bg-panel p-5" aria-label="Library import" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFiles([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">Bring your own collection</h2><p className="mt-2 text-sm text-muted">Select MIDI files and matching MusicXML or PDF scores together.</p></div><button className={button} disabled={!!busy} onClick={() => input.current?.click()}>{busy === 'import' ? 'Importing…' : '↑ Import music files'}</button></div>
      <p className="text-xs leading-5 text-muted">Matching filenames pair automatically. Up to 100 arrangements. Your imports stay private in this browser. Saved files can be reopened without downloading them again.</p>
      <input ref={input} className="sr-only" type="file" multiple accept=".mid,.midi,.musicxml,.xml,.pdf" aria-label="Import library files" onChange={e => void importFiles([...e.target.files ?? []])} />
    </section>
    <footer className="space-y-2 border-t border-line pt-5 text-xs leading-5 text-muted"><p>All collection downloads are free. Mutopia editions carry public-domain dedications; nursery songs come from the 1878 collection The Baby’s Bouquet. Each piece includes its source and rights details. Difficulty labels are editorial estimates for the complete arrangement.</p><p>PDF preserves the published score. MusicXML preserves original notation where available; MIDI sheet music is an approximate transcription. Playback uses synthesized instrument tones.</p><a className="text-accent underline" href="/music/gutenberg-license.txt" target="_blank" rel="noopener noreferrer">Project Gutenberg source terms</a></footer>
    <ConfirmDialog open={!!remove} title="Remove this arrangement?" message="Its MIDI and attached scores will be removed from this browser. Your original files are unaffected." confirmLabel="Remove arrangement" variant="danger" onCancel={() => setRemove(null)} onConfirm={() => void removeEntry()} />
  </>;
}
