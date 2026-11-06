import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { initApp } from '@freeappstore/sdk';
import { Badge, Card, PageHeader, Shell, type NavItem } from '@freeappstore/sdk/ui';
import { Player, type SoundMode } from './audio';
import { SOUND_BANK } from './sound-cache';
import { formatTime } from './music';
import { PianoRoll } from './PianoRoll';
import type { LibraryEntry } from './library';
import { useMusicFile } from './useMusicFile';
import { piecePath, SharePiece } from './SharePiece';
import { pwa } from './fas-capabilities/pwa';
import { button, selectedButton } from './ui';
import { PracticeControls } from './PracticeControls';
import { transposeSong, pitchLabel, rhythmAt, validLoop, type LoopRange } from './practice';

const Library = lazy(() => import('./LibraryScreen'));
const OriginalScore = lazy(() => import('./OriginalScore'));
const SheetMusic = lazy(() => import('./SheetMusic'));

export const fas = initApp({ appId: 'scoreplay' });
const NAV: NavItem[] = [{ label: 'Player', href: '/', title: 'Scoreplay — MIDI player' }, { label: 'Library', href: '/library', title: 'Library — Scoreplay' }, { label: 'How to use', href: '/about', title: 'How to use — Scoreplay' }];
function Button({ primary, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button {...props} className={`${primary || props['aria-pressed'] === true ? selectedButton : button} ${className}`} />;
}
export default function App() {
  const [mode, setMode] = useState('sheet');
  const [soundMode, setSoundMode] = useState<SoundMode>(() => { try { const saved = localStorage.getItem('scoreplay-sound-mode'); return saved === 'piano' || saved === 'simple' ? saved : 'sampled'; } catch { return 'sampled'; } });
  const [audioLoading, setAudioLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [original, setOriginal] = useState(true);
  const [route, setRoute] = useState(location.pathname + location.search);
  const path = route.split('?')[0];
  const linkedPieceId = path === '/' ? new URLSearchParams(route.split('?')[1] ?? '').get('piece') : null;
  const [player] = useState(() => new Player());
  const { song, musicxml, pdf, catalogId, revision, busy, error, notice, setError, open, demo, forget, openEntry } = useMusicFile(player, linkedPieceId);
  const sourceEditionId = /^mutopia-\d+/.exec(catalogId ?? '')?.[0];
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1), [volume, setVolume] = useState(65), [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(new Set<number>());
  const [pitchShift, setTranspose] = useState(0), [metronome, setMetronome] = useState(false), [countIn, setCountIn] = useState(false), [countingIn, setCountingIn] = useState(0);
  const [loopRange, setLoopRange] = useState<LoopRange | null>(null), [solo, setSolo] = useState<number | null>(null);
  const [pitchDocument, setPitchDocument] = useState<typeof song>(null);
  const transpose = pitchDocument === song ? pitchShift : 0;
  const displaySong = useMemo(() => song ? transposeSong(song, transpose) : null, [song, transpose]);
  const effectiveMuted = useMemo(() => solo === null ? muted : new Set(song?.tracks.flatMap((_, i) => i === solo ? [] : [i]) ?? []), [song, muted, solo]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setMuted(new Set()); setSolo(null); setTranspose(0); setPitchDocument(song); player.transpose = 0; setLoopRange(null); player.loopRange = null; setLoop(false); player.loop = false; setOriginal(true); setMode('sheet'); }, [revision, player, song]);
  useEffect(() => {
    player.sound = soundMode; player.onLoading = setAudioLoading;
    player.onUpdate = (t, p) => { setTime(t); setPlaying(p); };
    player.onCountIn = setCountingIn; player.onError = setError;
    const sync = () => setRoute(location.pathname + location.search); addEventListener('popstate', sync);
    const release = pwa.addBusyGuard(() => player.playing || player.loading);
    return () => { player.pause(); release(); removeEventListener('popstate', sync); };
  }, [player]);
  useEffect(() => { if (!pdf) { setPdfUrl(''); return; } const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })); setPdfUrl(url); return () => URL.revokeObjectURL(url); }, [pdf]);
  useEffect(() => { if (path !== '/') player.pause(); }, [path, player]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (busy || e.code !== 'Space' || path !== '/' || (e.target as HTMLElement).closest('button,input,select,textarea,a,[contenteditable]')) return;
      e.preventDefault(); if (!e.repeat) void toggle();
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  });
  const navigate = (href: string) => { history.pushState(null, '', href); setRoute(location.pathname + location.search); };
  const start = async (skipCountIn = false) => { setError(''); try { await player.play(skipCountIn); } catch (e) { setError(e instanceof Error ? e.message : 'Audio could not start. Please try Play again.'); } };
  const toggle = () => player.playing || player.loading ? player.pause() : start();
  const seek = (t: number) => { const resume = player.playing || player.loading; player.seek(t); if (resume) void start(true); };
  const changeSound = (value: SoundMode) => {
    const resume = player.playing || player.loading; player.pause(); player.sound = value; setSoundMode(value); setError('');
    try { localStorage.setItem('scoreplay-sound-mode', value); } catch { /* Preference storage is optional. */ }
    if (resume) void start(true);
  };
  const changeSpeed = (value: number) => { const resume = player.playing || player.loading; player.pause(); player.speed = value; setSpeed(value); if (resume) void start(true); };
  const toggleTrack = (i: number) => {
    const resume = player.playing || player.loading; player.pause();
    const next = new Set(muted); if (next.has(i)) next.delete(i); else next.add(i);
    setMuted(next); setSolo(null); player.muted = next; if (resume) void start(true);
  };
  const changePractice = (apply: () => void) => { const resume = player.playing || player.loading; player.pause(); apply(); if (resume) void start(true); };
  const changeTranspose = (value: number) => changePractice(() => { player.transpose = value; setTranspose(value); setPitchDocument(song); });
  const changeLoop = () => changePractice(() => { player.loop = !loop; setLoop(!loop); });
  const changeRange = (range: LoopRange | null) => {
    if (range && (!song || !validLoop(range, song.duration))) return;
    changePractice(() => { player.loopRange = range; setLoopRange(range); player.loop = !!range; setLoop(!!range); if (range && (player.time < range.start || player.time >= range.end)) player.seek(range.start); });
  };
  const toggleSolo = (index: number) => changePractice(() => {
    const value = solo === index ? null : index; setSolo(value);
    player.muted = value === null ? new Set(muted) : new Set(song?.tracks.flatMap((_, i) => i === value ? [] : [i]) ?? []);
  });
  const openLibrary = async (entry: LibraryEntry) => { const pending = openEntry(entry); navigate(entry.catalogId ? piecePath(entry.catalogId) : '/'); await pending; };
  const clearPieceLink = () => { if (linkedPieceId !== null) { history.replaceState(null, '', '/'); setRoute('/'); } };
  const openFile = (file?: File) => { if (file && !busy) { clearPieceLink(); void open(file); } };
  return <Shell app={fas} appName="Scoreplay" nav={NAV} onNavigate={navigate}>
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-9">
      {path === '/library' ? <Suspense fallback={<p role="status">Loading library…</p>}><Library onOpen={openLibrary} player={player} ready={!busy} /></Suspense> : path === '/about' ? <>
        <PageHeader title="A little room for your music." description="Open a MIDI, press play, and take it at your own pace." />
        <Card><div className="space-y-5 text-sm leading-7">
          <h2 className="text-2xl">From file to first note</h2>
          <ol className="list-decimal space-y-2 pl-5"><li>Export your music as a standard MIDI (.mid or .midi), then choose Open MIDI.</li><li>Press Play or use the space bar. Use the measure buttons, click the piano roll, or drag the position slider to jump.</li><li>Slow down without changing pitch, mute or solo a track, or repeat a section with A–B markers.</li></ol>
          <p>Transpose by up to an octave in either direction without changing tempo. Sheet notation and piano roll follow the new pitch; percussion and printed PDFs stay unchanged. Set A and B at the playhead or enter seconds to loop a passage. The metronome follows MIDI tempo and meter changes; enable a one-bar count-in to get ready before Play. Practice pitch, section and solo reset when opening another piece.</p>
          <p>Original instruments uses each track’s instrument; Grand piano plays melodic tracks on piano and keeps percussion as drums. Note timing, tempo changes, velocity and sustain pedal are respected. Pitch bends and other expressive MIDI controllers are not yet reproduced.</p>
          <p>Switch between Sheet music and Piano roll. Sheet music is an approximate transcription: choose a track and rhythm grid, browse measures, or follow playback. MIDI does not preserve original notation, so key spelling, beaming, and hand assignments are estimated. Notes cannot be edited in this version. Import paired MusicXML and PDF scores through Library. MusicXML preserves the original notation; PDF opens the printed score. The free library includes classical and traditional pieces with MIDI and PDF scores, plus original MusicXML for nursery songs. Search by title, composer or tags, filter by difficulty and instrument, and star your favourites. Save a piece to My files to keep its files on this device. MuseScore project files and audio recordings are not supported. Maximum file size: 5 MB; maximum duration: two hours.</p>
          <p>Use Share on a free-library piece to copy or send a link that opens its music and score. Recipients can listen without an account. Your imported arrangements and their scores are saved in this browser on this device. They are never sent to a server. Remove arrangements in Library, or use “Clear last opened file” to clear just the last-opened selection. The demo is an arrangement of Beethoven’s public-domain Ode to Joy.</p>
          <p className="text-xs text-muted"><a className="text-accent underline" href="https://github.com/mrbumpy409/GeneralUser-GS" target="_blank" rel="noopener noreferrer">GeneralUser GS by S. Christian Collins</a> · <a className="text-accent underline" href={SOUND_BANK.license} target="_blank" rel="noopener noreferrer">Sound bank terms</a> · <a className="text-accent underline" href="/sounds/SpessaSynth-LICENSE.txt" target="_blank" rel="noopener noreferrer">SpessaSynth engine</a></p>
          <Button onClick={() => navigate('/')}>Back to player</Button>
        </div></Card>
      </> : <>
        <PageHeader title="Make time for music." description="Your MIDI. Your tempo. A simple space to listen and practise." actions={<Badge variant="success">On your device</Badge>} />
        <section aria-label="Import music" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); openFile(e.dataTransfer.files[0]); }} className={`flex flex-col justify-between gap-4 rounded-2xl border border-dashed p-5 sm:flex-row sm:items-center ${drag ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel'}`}>
          <div className="flex items-center gap-4"><span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-2xl text-accent">♫</span><div><h2 className="text-xl">Bring your own music</h2><p className="mt-1 text-sm text-muted">Drop a MIDI file here · .mid or .midi · up to 5 MB</p></div></div>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => { clearPieceLink(); demo(); }}>Try demo</Button><Button onClick={() => navigate('/library')}>Browse free library</Button><Button primary disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Opening…' : '↑ Open MIDI'}</Button></div>
          <input ref={input} type="file" accept=".mid,.midi,audio/midi,audio/x-midi" aria-label="Choose MIDI file" className="sr-only" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; openFile(file); }} />
        </section>
        {error && <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">{error}{linkedPieceId !== null && !song && <button className="ml-3 min-h-11 underline" onClick={() => location.reload()}>Retry linked piece</button>}</div>}
        <p role="status" className="min-h-5 text-xs text-muted">{notice}</p>
        {song && <>
          <section className="overflow-hidden rounded-2xl border border-line bg-paper" aria-label="Music player">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6"><div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Now on the stand</p><h2 className="break-words text-3xl">{song.title}</h2><p className="mt-2 text-sm text-muted">{song.tracks.length} tracks · {song.notes.length.toLocaleString()} notes · {Math.round(song.bpm)} BPM at start</p></div><div className="flex flex-wrap items-start gap-2"><Badge variant={playing ? 'success' : 'default'}>{audioLoading ? 'Preparing playback' : countingIn ? `Count in: ${countingIn}` : playing ? 'Playing' : time >= song.duration ? 'Finished' : time > 0 ? 'Paused' : 'Ready to play'}</Badge>{transpose !== 0 && <Badge variant="accent">{pitchLabel(transpose)}</Badge>}{catalogId && <SharePiece key={catalogId} id={catalogId} title={song.title} />}{sourceEditionId && <a className="inline-flex min-h-11 items-center rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel" href={`/music/${sourceEditionId}/credits.html`} target="_blank" rel="noopener noreferrer" aria-label={`Credits for ${song.title}`}>Source &amp; credits ↗</a>}</div></div>
            <div className="flex flex-wrap gap-2 border-b border-line bg-panel px-5 py-3" role="group" aria-label="Music view"><Button primary={mode === 'sheet'} aria-pressed={mode === 'sheet'} onClick={() => setMode('sheet')}>Sheet music</Button><Button primary={mode === 'roll'} aria-pressed={mode === 'roll'} onClick={() => setMode('roll')}>Piano roll</Button>{pdfUrl && <Button primary={mode === 'pdf'} aria-pressed={mode === 'pdf'} onClick={() => setMode('pdf')}>PDF score</Button>}</div>
            {mode === 'sheet' ? <>
              {musicxml && <div className="flex flex-wrap gap-2 px-5 pt-4"><Button aria-pressed={original} onClick={() => setOriginal(true)}>Original score</Button><Button aria-pressed={!original} onClick={() => setOriginal(false)}>MIDI transcription</Button></div>}
              <Suspense fallback={<p role="status" className="p-5 text-sm text-muted">Loading sheet music…</p>}>{musicxml && original ? <OriginalScore key={revision} xml={musicxml} song={song} transpose={transpose} time={time} onSeek={seek} /> : <SheetMusic key={revision} song={displaySong!} time={time} playing={playing} onSeek={seek} />}</Suspense>
            </> : mode === 'pdf' && pdfUrl ? <div className="space-y-3 p-5">{transpose !== 0 && <p role="status" className="text-sm text-muted">This PDF stays in its original key. Playback is {pitchLabel(transpose)}. Choose Sheet music to read the transposed notes.</p>}<a className="text-sm text-accent underline" href={pdfUrl} target="_blank" rel="noopener noreferrer">Open PDF score in a new tab ↗</a><iframe src={pdfUrl} title="PDF score" className="h-[650px] w-full rounded-lg border border-line bg-score-paper" /></div> : <PianoRoll song={displaySong!} time={time} muted={effectiveMuted} onSeek={seek} />}
            <div className="space-y-5 border-t border-line p-5 sm:p-6">
              <div><label htmlFor="position" className="sr-only">Playback position</label><input id="position" type="range" min="0" max={song.duration} step="0.01" value={time} aria-valuetext={`${formatTime(time)} of ${formatTime(song.duration)}`} onChange={e => seek(Number(e.target.value))} className="w-full accent-accent" /><div className="mt-1 flex justify-between font-mono text-xs text-muted"><span>{formatTime(time)}</span><span>{formatTime(song.duration)}</span></div></div>
              <div className="flex flex-wrap items-center justify-between gap-5"><div className="flex flex-wrap items-center gap-2"><Button onClick={() => player.seek(0)} aria-label="Stop and rewind">↤</Button><Button primary className="min-w-28" disabled={busy} onClick={() => void toggle()}>{audioLoading ? 'Cancel play' : playing ? 'Ⅱ Pause' : '▶ Play'}</Button><Button aria-pressed={loop} onClick={changeLoop}>↻ Loop {loop ? 'on' : 'off'}</Button></div><span className="hidden text-xs text-muted sm:block">Space to play / pause</span></div>
              {countingIn > 0 && <p role="status" className="text-sm font-semibold text-accent">Count in: {countingIn} · Get ready</p>}
              {loopRange && <p className="text-xs text-muted">Section A {formatTime(loopRange.start)} → B {formatTime(loopRange.end)} · {loop ? 'Repeating' : 'Loop off'}</p>}
              {audioLoading && <p role="status" className="text-xs text-muted">Preparing playback…</p>}
            </div>
          </section>
          <PracticeControls key={revision} song={song} transpose={transpose} onTranspose={changeTranspose} metronome={metronome} onMetronome={() => changePractice(() => { player.metronome = !metronome; setMetronome(!metronome); })} countIn={countIn} onCountIn={value => { if (player.countingIn) player.pause(); player.countIn = value; setCountIn(value); }} range={loopRange} time={time} loop={loop} onRange={changeRange} />
          <div className="grid gap-5 md:grid-cols-2">
            <Card><div className="space-y-5"><h2 className="text-xl">Playback</h2><div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm" htmlFor="sound-mode">Playback sound</label><select id="sound-mode" className="max-w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" value={soundMode} onChange={e => changeSound(e.target.value as SoundMode)}><option value="sampled">Original instruments</option><option value="piano">Grand piano</option><option value="simple">Simple tones</option></select></div><div className="flex items-center justify-between gap-4"><label htmlFor="speed" className="text-sm">Playback speed</label><select id="speed" className="min-h-11 rounded-lg border border-line bg-paper px-3 text-sm" value={speed} onChange={e => changeSpeed(Number(e.target.value))}>{[...new Set([.25,.5,.75,1,1.25,1.5,2,speed])].sort((a,b) => a-b).map(s => <option key={s} value={s}>{s}×{s === 1 ? ' · Original' : ''}</option>)}</select></div><div><label className="mb-2 flex justify-between text-sm" htmlFor="fine-speed"><span>Fine speed</span><span className="text-muted">{Math.round(speed * 100)}% · {Math.round(rhythmAt(song, time).bpm * speed)} BPM</span></label><input id="fine-speed" aria-label="Speed percentage" type="range" min="25" max="200" step="1" value={Math.round(speed * 100)} onChange={e => changeSpeed(Number(e.target.value) / 100)} className="w-full accent-accent" /></div><div><div className="mb-2 flex justify-between text-sm"><label htmlFor="volume">Volume</label><span className="text-muted">{volume}%</span></div><input id="volume" type="range" min="0" max="100" value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); player.setVolume(v / 100); }} className="w-full accent-accent" /></div><p className="text-xs leading-5 text-muted">Speed changes keep the selected pitch. Loop repeats A–B when a section is set, otherwise the whole piece.</p></div></Card>
            <Card><h2 className="mb-4 text-xl">Listen in layers</h2>{solo !== null && <p role="status" className="mb-3 text-xs text-accent">Solo: {song.tracks[solo]?.name}. Other tracks are silent.</p>}<div className="max-h-56 space-y-3 overflow-y-auto">{song.tracks.map((t, i) => <div key={i} className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${['bg-accent','bg-mint','bg-sky','bg-warning'][i % 4]}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.name}</p><p className="truncate text-xs capitalize text-muted">{t.instrument}</p></div></div><div className="flex shrink-0 flex-wrap gap-2"><Button aria-label={`${muted.has(i) ? 'Unmute' : 'Mute'} ${t.name}`} aria-pressed={muted.has(i)} onClick={() => toggleTrack(i)}>{muted.has(i) ? 'Muted' : 'On'}</Button><Button aria-label={`${solo === i ? 'Unsolo' : 'Solo'} ${t.name}`} aria-pressed={solo === i} onClick={() => toggleSolo(i)}>Solo</Button></div></div>)}</div></Card>
          </div>
        </>}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted"><p>A little less setup. A little more music.</p><button disabled={busy} className="min-h-11 underline underline-offset-4" onClick={() => { clearPieceLink(); void forget(); }}>Clear last opened file</button></footer>
      </>}
    </div>
  </Shell>;
}
