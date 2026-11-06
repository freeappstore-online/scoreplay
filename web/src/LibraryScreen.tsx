import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Card, ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui';
import { prepareLibrary, type LibraryEntry } from './library';
import { libraryEntries, removeLibraryEntry, writeLibrary } from './storage';
import { CATALOG, DEFAULT_FILTERS, filterCatalog, loadCatalogPiece, loadCatalogSong, matchesSearch, readPreferences, type CatalogPiece, type Filters } from './catalog';
import { formatTime, parseMidi } from './music';
import type { Player } from './audio';
import { LibraryPreview } from './library-preview';
import { PreviewBar, PreviewButton } from './LibraryPreview';
import { pwa } from './fas-capabilities/pwa';
import { composerInfo } from './composers';
import { ComposerIdentity } from './ComposerIdentity';
import { SharePiece } from './SharePiece';
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel disabled:opacity-40';
const selectedButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-accent bg-accent px-4 py-2 text-sm font-bold text-paper shadow-sm';
const control = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-paper px-3 text-sm text-ink';
const optionKeys = ['category', 'difficulty', 'composer', 'instruments', 'tags'] as const;
const catalogOptions = Object.fromEntries(optionKeys.map(key => [key, [...new Set(CATALOG.flatMap(p => p[key]))].sort((a,b) => (key === 'composer' ? composerInfo(a).label : a).localeCompare(key === 'composer' ? composerInfo(b).label : b))]));
const options = (key: typeof optionKeys[number]): string[] => catalogOptions[key];
const composerCounts = new Map(options('composer').map(name => [name, CATALOG.filter(p => p.composer === name).length]));
export default function Library({ onOpen, player, ready }: { onOpen: (entry: LibraryEntry) => Promise<void>; player: Player; ready: boolean }) {
  const [preview] = useState(() => new LibraryPreview(player));
  useEffect(() => {
    const release = pwa.addBusyGuard(() => ['loading','playing'].includes(preview.getSnapshot().phase));
    return () => { preview.stop(); release(); };
  }, [preview]);
  const [initial] = useState(readPreferences);
  const [filters, setFilters] = useState(initial.filters), [favorites, setFavorites] = useState(initial.favorites);
  const [entries, setEntries] = useState<LibraryEntry[]>([]), [limit, setLimit] = useState(12);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [remove, setRemove] = useState<LibraryEntry | null>(null);
  const input = useRef<HTMLInputElement>(null), request = useRef<AbortController | null>(null);
  useEffect(() => { void libraryEntries().then(setEntries).catch(() => setError('Local storage is unavailable. You can still browse and open the free collection.')); return () => request.current?.abort(); }, []);
  useEffect(() => { try { localStorage.setItem('scoreplay-library-preferences', JSON.stringify({ filters, favorites })); } catch { setNotice('Preferences cannot be saved in this browser.'); } }, [filters, favorites]);
  useEffect(() => setLimit(12), [filters]);
  useEffect(() => pwa.addBusyGuard(() => !!busy), [busy]);
  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(f => ({ ...f, [key]: value }));
  const favorite = (id: string) => setFavorites(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids,id]);
  const tag = (value: string) => change('tags', filters.tags.includes(value) ? filters.tags.filter(t => t !== value) : [...filters.tags,value]);
  const refresh = async () => setEntries(await libraryEntries());
  const importFiles = async (files: File[]) => {
    if (busy) return; preview.stop(); setBusy('import'); setError(''); setNotice('');
    try { const prepared = await prepareLibrary(files, await libraryEntries()); await writeLibrary(prepared); await refresh(); setFilters({ ...DEFAULT_FILTERS, scope: 'mine' }); setNotice(`${prepared.length} arrangement${prepared.length === 1 ? '' : 's'} saved on this device.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save these files. Your browser may be out of storage.'); }
    finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const usePiece = async (piece: CatalogPiece, save: boolean) => {
    if (busy) return;
    if (!save) preview.stop();
    const controller = new AbortController(); request.current = controller; setBusy(piece.id); setError(''); setNotice('');
    try {
      const entry = await loadCatalogPiece(piece, controller.signal);
      if (save) {
        await writeLibrary([entry]); await refresh(); setNotice(`${piece.title} saved with its score on this device.`);
      } else await onOpen(entry);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not open this piece. Please try again.'); }
    finally { if (!controller.signal.aborted) { setBusy(''); request.current = null; } }
  };
  const removeEntry = async () => {
    if (!remove || busy) return;
    if (preview.getSnapshot().id === `local:${remove.id}`) preview.stop();
    setBusy('remove'); setError('');
    try { await removeLibraryEntry(remove.id); await refresh(); setFavorites(ids => ids.filter(id => id !== `local:${remove.id}`)); setNotice(`${remove.title} removed from this device.`); }
    catch { setError('Could not remove the arrangement. Please try again.'); }
    finally { setRemove(null); setBusy(''); }
  };
  const catalog = useMemo(() => filters.scope === 'mine' ? [] : filterCatalog(filters, favorites), [filters, favorites]);
  const savedById = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
  const hasMetadataFilter = !!(filters.category || filters.difficulty || filters.instrument || filters.composer || filters.duration || filters.score || filters.tags.length);
  const eligibleIds = useMemo(() => hasMetadataFilter && filters.scope !== 'free' ? new Set(filterCatalog({ ...filters, scope: 'free' }, []).map(p => p.id)) : new Set<string>(), [filters, hasMetadataFilter]);
  const own = useMemo(() => filters.scope === 'free' ? [] : entries.filter(e => matchesSearch(`${e.title} ${e.name}`,filters.query) && (!hasMetadataFilter || eligibleIds.has(e.id)) && (filters.scope !== 'favorites' || favorites.includes(`local:${e.id}`))), [entries, filters, hasMetadataFilter, eligibleIds, favorites]);
  const isFiltered = Object.entries(filters).some(([key,value]) => !['scope','sort'].includes(key) && (Array.isArray(value) ? value.length : value));
  const clear = () => setFilters({ ...DEFAULT_FILTERS, scope: filters.scope });
  const select = (label: string, key: 'category'|'difficulty'|'instrument'|'composer'|'duration'|'score'|'sort', values: [string,string][]) => <label className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span><select aria-label={label} className={control} value={filters[key]} onChange={e => change(key,e.target.value)}>{values.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <>
    <PageHeader title="Find your next favourite." description={`${CATALOG.length} free pieces and parts. Real scores. A little practice, every day.`} actions={<Badge variant="success">Free to play & download</Badge>} />
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-label="Music collections">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">A shelf for every mood</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[
        ['♫','Explore everything','All free pieces','',[]], ['☀','Little learners','Nursery songs & sing-alongs','Children & learning',[]], ['♬','Classical favourites','Bach, Beethoven & beyond','Classical',[]], ['☾','A quieter moment','Gentle pieces & lullabies','',['gentle']],
      ].map(([icon,title,subtitle,category,tags]) => <button key={String(title)} className="min-w-0 rounded-xl border border-line bg-paper p-4 text-left transition-colors hover:border-accent" onClick={() => setFilters({ ...DEFAULT_FILTERS, category: category as string, tags: tags as string[] })}><span aria-hidden="true" className="text-2xl text-accent">{icon}</span><span className="mt-3 block text-base font-semibold">{title}</span><span className="mt-1 block text-xs leading-5 text-muted">{subtitle}</span></button>)}</div>
    </section>
    <section aria-label="Browse composers" className="space-y-3"><h2 className="text-xl">Browse composers</h2><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{['W. A. Mozart','L. V. Beethoven','J. S. Bach','A. Vivaldi','F. F. Chopin','E. Satie','F. Schubert','P. I. Tchaikovsky','F. Mendelssohn-Bartholdy'].filter(name => CATALOG.some(p => p.composer === name)).map(name => {
      const composer = composerInfo(name), active = filters.scope === 'free' && filters.composer === name;
      return <button key={name} aria-label={`Browse ${composer.label}`} aria-pressed={active} className={`flex min-w-0 items-center gap-3 rounded-xl border-2 p-3 text-left ${active ? 'border-accent bg-accent text-paper' : 'border-line bg-paper text-ink hover:border-accent'}`} onClick={() => setFilters({ ...DEFAULT_FILTERS, composer: name })}>
        {composer.portrait && <img src={composer.portrait.url} alt="" width={36} height={48} loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover object-top" />}<span className="min-w-0"><span className="block text-sm font-bold">{active && '✓ '}{composer.label.split(',')[0]}</span><span className="block text-xs">{composerCounts.get(name)} {composerCounts.get(name) === 1 ? 'piece' : 'pieces'}</span></span>
      </button>;
    })}</div></section>
    <div role="group" aria-label="Library shelves" className="flex flex-wrap gap-2">{[['free','Free collection'],['mine',`My files (${entries.length})`],['favorites',`Favourites (${favorites.length})`]].map(([value,label]) => <button key={value} className={filters.scope === value ? selectedButton : button} aria-pressed={filters.scope === value} onClick={() => setFilters(f => ({ ...DEFAULT_FILTERS, scope: value, query: f.query }))}>{filters.scope === value && <span aria-hidden="true" className="mr-2">✓</span>}{label}</button>)}</div>
    <section className="space-y-4" aria-label="Search and filters">
      <label className="block"><span className="mb-2 block text-sm font-semibold">Find a song</span><input value={filters.query} onChange={e => change('query',e.target.value)} placeholder="Search titles, composers, moods or tags…" className={control} /></label>
      {filters.scope !== 'mine' && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {select('Category','category',[['','All categories'],...options('category').map(x => [x,x] as [string,string])])}
          {select('Difficulty · estimated','difficulty',[['','All levels'],...['Easy','Intermediate','Advanced','Not rated'].map(x => [x,x] as [string,string])])}
          {select('Instrument','instrument',[['','All instruments'],...options('instruments').map(x => [x,x] as [string,string])])}
          {select('Composer','composer',[['','All composers'],...options('composer').map(x => [x,composerInfo(x).label] as [string,string])])}
          {select('Length','duration',[['','Any duration'],['60','Under 1 minute'],['180','Under 3 minutes'],['300','Under 5 minutes']])}
          {select('Score format','score',[['','All scores'],['musicxml','Original MusicXML']])}
          <label className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted">Add a tag</span><select aria-label="Add a tag" className={control} value="" onChange={e => { if (e.target.value) tag(e.target.value); }}><option value="">Choose a tag…</option>{options('tags').filter(t => !filters.tags.includes(t)).map(t => <option key={t}>{t}</option>)}</select></label>
          {select('Sort by','sort',[['title','Title A–Z'],['composer','Composer A–Z'],['duration','Shortest first'],['difficulty','Easiest first']])}
        </div>
        <div className="flex flex-wrap gap-2">{filters.tags.map(t => <button className={`${button} border-accent text-accent`} key={t} aria-label={`Remove tag ${t}`} onClick={() => tag(t)}>{t} ×</button>)}</div>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted">{catalog.length + own.length} {catalog.length + own.length === 1 ? 'piece' : 'pieces'} found · {filters.scope === 'free' ? `Free collection · ${CATALOG.length} total` : filters.scope === 'favorites' ? 'In your favourites' : 'In your saved files'}</p>{isFiltered && <button className={button} onClick={clear}>Clear filters</button>}</div>
    </section>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    {busy && !['import','remove'].includes(busy) && <p role="status" className="text-sm text-muted">Opening music and score…</p>}
    {filters.scope !== 'mine' && <section className="space-y-4" aria-label="Free music results">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.slice(0,limit).map(piece => <Card key={piece.id} className="min-w-0"><article className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-muted">{piece.category}</p><h2 className="mt-2 break-words text-xl">{piece.title}</h2><ComposerIdentity name={piece.composer} /></div><button className={`min-h-11 min-w-11 shrink-0 rounded-lg border-2 text-xl ${favorites.includes(piece.id) ? 'border-accent bg-accent text-paper' : 'border-line bg-paper text-muted hover:border-accent'}`} aria-label={`Favourite ${piece.title}`} aria-pressed={favorites.includes(piece.id)} onClick={() => favorite(piece.id)}>{favorites.includes(piece.id) ? '★' : '☆'}</button></div>
        <div className="flex flex-wrap gap-2"><Badge>{piece.difficulty}</Badge><Badge>{piece.assets.midi ? formatTime(piece.duration) : 'PDF score'}</Badge><Badge>{piece.instruments.join(' + ')}</Badge></div>
        <div className="flex flex-wrap gap-1.5">{piece.tags.map(t => <button key={t} className={`min-h-8 rounded-full border px-2.5 py-1 text-xs ${filters.tags.includes(t) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-accent'}`} aria-pressed={filters.tags.includes(t)} onClick={() => tag(t)}>#{t}</button>)}</div>
        <p className="text-xs leading-5 text-muted">{!piece.assets.midi ? piece.playbackUnavailable : piece.assets.musicxml ? 'Original sheet music + PDF' : 'MIDI sheet music + original PDF'}</p>
        <div className="mt-auto flex flex-wrap gap-2">{piece.assets.midi ? <><PreviewButton preview={preview} disabled={!!busy || !ready} source={{ id: `catalog:${piece.id}`, title: piece.title, load: async signal => { const saved = savedById.get(piece.id); return saved?.catalogId === piece.id ? parseMidi(saved.bytes, piece.title) : loadCatalogSong(piece, signal); } }} /><button className={`${button} border-accent text-accent`} disabled={!!busy} onClick={() => void usePiece(piece,false)} aria-label={`Open ${piece.title}`}>Open score</button><button className={button} disabled={!!busy || entries.some(e => e.id === piece.id)} onClick={() => void usePiece(piece,true)}>{entries.some(e => e.id === piece.id) ? 'Saved to my files' : 'Save to my files'}</button><SharePiece id={piece.id} title={piece.title} /></> : <a className={button} href={piece.assets.pdf} target="_blank" rel="noopener noreferrer" aria-label={`Open PDF ${piece.title}`}>Open PDF score ↗</a>}</div>
        <details className="break-words border-t border-line pt-3 text-xs leading-5 text-muted"><summary className="cursor-pointer py-1 font-semibold">About, downloads & credits</summary><div className="mt-3 space-y-3"><p>{piece.description}</p><p>{piece.edition}</p>{piece.creditsUrl && <a className="block text-accent underline" href={piece.creditsUrl} target="_blank" rel="noopener noreferrer">Edition files &amp; credits ↗</a>}{composerInfo(piece.composer).portrait && <p>Portrait: {composerInfo(piece.composer).portrait!.artist}. {composerInfo(piece.composer).portrait!.rights}. <a className="text-accent underline" href={composerInfo(piece.composer).portrait!.sourceUrl} target="_blank" rel="noopener noreferrer">Image source ↗</a></p>}<p>{piece.rights} · <a className="text-accent underline" href={piece.rightsUrl} target="_blank" rel="noopener noreferrer">Rights details ↗</a></p><a className="block text-accent underline" href={piece.sourceUrl} target="_blank" rel="noopener noreferrer">{piece.source} ↗</a><div className="flex flex-wrap gap-4">{piece.assets.midi && <a className="min-h-8 text-accent underline" href={piece.assets.midi} download={`${piece.title}.mid`}>Download MIDI</a>}<a className="min-h-8 text-accent underline" href={piece.assets.pdf} download={`${piece.title}.pdf`}>Download PDF</a>{piece.assets.musicxml && <a className="min-h-8 text-accent underline" href={piece.assets.musicxml} download={`${piece.title}.musicxml`}>MusicXML</a>}</div></div></details>
      </article></Card>)}</div>
      {catalog.length > limit && <button className={`${button} w-full`} onClick={() => setLimit(n => n+12)}>Show more · {catalog.length-limit} remaining</button>}
    </section>}
    {(filters.scope === 'mine' || own.length > 0) && <section className="space-y-4" aria-label="My arrangements"><h2 className="text-2xl">My arrangements</h2><p className="text-xs text-muted">Saved on this device. Search applies to your filenames and titles.</p><div className="grid gap-4 md:grid-cols-2">{own.map(entry => <Card key={entry.id}><div className="space-y-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl capitalize">{entry.title}</h3><p className="mt-1 break-all text-xs text-muted">{entry.name}</p></div><button className={favorites.includes(`local:${entry.id}`) ? selectedButton : button} aria-label={`Favourite saved ${entry.title}`} aria-pressed={favorites.includes(`local:${entry.id}`)} onClick={() => favorite(`local:${entry.id}`)}>{favorites.includes(`local:${entry.id}`) ? '★' : '☆'}</button></div><div className="flex flex-wrap gap-2"><Badge>MIDI playback</Badge>{entry.musicxml && <Badge variant="accent">Original sheet music</Badge>}{entry.pdf && <Badge>PDF score</Badge>}</div><div className="flex flex-wrap gap-2"><PreviewButton preview={preview} disabled={!!busy || !ready} source={{ id: `local:${entry.id}`, title: entry.title, load: async () => parseMidi(entry.bytes, entry.title) }} /><button className={button} disabled={!!busy} onClick={() => { preview.stop(); void onOpen(entry).catch(e => setError(e instanceof Error ? e.message : 'Could not open this arrangement.')); }} aria-label={`Open ${entry.title}`}>Open score</button><button className={button} disabled={!!busy} aria-label={`Remove ${entry.title}`} onClick={() => setRemove(entry)}>Remove</button></div></div></Card>)}</div></section>}
    {!catalog.length && !own.length && <div className="rounded-2xl border border-dashed border-line p-8 text-center"><h2 className="text-xl">{filters.scope === 'mine' && !entries.length ? 'Your own music belongs here.' : filters.scope === 'favorites' && !favorites.length ? 'Start a shelf of favourites.' : filters.scope === 'favorites' ? 'No favourites match these filters.' : 'No pieces match just yet.'}</h2><p className="mt-3 text-sm text-muted">{filters.scope === 'mine' ? 'Import your MIDI and matching scores below, or save a piece from the free collection.' : filters.scope === 'favorites' && !favorites.length ? 'Tap a star on any piece to keep it here.' : 'Try fewer filters, another tag, or a different search.'}</p>{filters.scope !== 'free' && <button className={`${selectedButton} mt-4 mr-2`} onClick={() => change('scope','free')}>Search all free pieces</button>}{isFiltered && <button className={`${button} mt-4`} onClick={clear}>Reset search and filters</button>}</div>}
    <section className="space-y-3 rounded-2xl border border-dashed border-line-strong bg-panel p-5" aria-label="Library import" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFiles([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl">Bring your own collection</h2><p className="mt-2 text-sm text-muted">Select MIDI files and matching MusicXML or PDF scores together.</p></div><button className={button} disabled={!!busy} onClick={() => input.current?.click()}>{busy === 'import' ? 'Importing…' : '↑ Import music files'}</button></div>
      <p className="text-xs leading-5 text-muted">Matching filenames pair automatically. Up to 100 arrangements. Your imports stay private in this browser. Saved files can be reopened without downloading them again.</p>
      <input ref={input} className="sr-only" type="file" multiple accept=".mid,.midi,.musicxml,.xml,.pdf" aria-label="Import library files" onChange={e => void importFiles([...e.target.files ?? []])} />
    </section>
    <footer className="space-y-2 border-t border-line pt-5 text-xs leading-5 text-muted"><p>All collection downloads are free. Mutopia editions are public domain or freely licensed under Creative Commons, with credits and terms on each piece. Nursery songs come from The Baby’s Bouquet and The Baby’s Opera. Difficulty labels are editorial estimates; unassessed editions are marked “Not rated”.</p><p>PDF preserves the published score. MusicXML preserves original notation where available; MIDI sheet music is an approximate transcription. Playback uses recorded instruments, with a lightweight Simple tones option.</p><a className="text-accent underline" href="/music/gutenberg-license.txt" target="_blank" rel="noopener noreferrer">The Baby’s Bouquet source terms</a><a className="ml-4 text-accent underline" href="/music/gutenberg-opera-license.txt" target="_blank" rel="noopener noreferrer">The Baby’s Opera source terms</a></footer>
    <PreviewBar preview={preview} />
    <ConfirmDialog open={!!remove} title="Remove this arrangement?" message="Its MIDI and attached scores will be removed from this browser. Your original files are unaffected." confirmLabel="Remove arrangement" variant="danger" onCancel={() => setRemove(null)} onConfirm={() => void removeEntry()} />
  </>;
}
