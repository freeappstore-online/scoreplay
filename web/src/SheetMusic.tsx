import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { beatAtTime, timeAtBeat, type Song } from './music';
import { DIVISIONS, measuresFor, PAGE_MEASURES, scoreXml } from './notation';

export default function SheetMusic({ song, time, playing, onSeek }: { song: Song; time: number; playing: boolean; onSeek: (time: number) => void }) {
  const [track, setTrack] = useState(-1), [quantum, setQuantum] = useState(6), [page, setPage] = useState(0);
  const [follow, setFollow] = useState(true), [loading, setLoading] = useState(true), [error, setError] = useState(''), [version, setVersion] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<OpenSheetMusicDisplay | null>(null);
  const positions = useRef<number[]>([]), cursorIndex = useRef(0);
  const measures = useMemo(() => measuresFor(song, quantum), [song, quantum]);
  const beat = beatAtTime(song, time);
  const foundMeasure = measures.findIndex(m => m.end > beat * DIVISIONS);
  const currentMeasure = foundMeasure < 0 ? measures.length - 1 : foundMeasure;
  const totalPages = Math.ceil(measures.length / PAGE_MEASURES);
  const safePage = Math.min(page, totalPages - 1);
  const visible = measures.slice(safePage * PAGE_MEASURES, (safePage + 1) * PAGE_MEASURES);
  const selectedTrack = track < song.tracks.length ? track : -1;
  const xml = useMemo(() => scoreXml(song, measures, safePage, selectedTrack, quantum), [song, measures, safePage, selectedTrack, quantum]);
  const pitchedTracks = song.tracks.map((t, i) => ({ ...t, i })).filter(t => !t.percussion);
  useEffect(() => { setTrack(-1); setPage(0); }, [song]);
  useEffect(() => { if (follow) setPage(Math.floor(currentMeasure / PAGE_MEASURES)); }, [currentMeasure, follow, playing]);
  useEffect(() => {
    const el = container.current;
    if (!el || !pitchedTracks.length) { setLoading(false); return; }
    let cancelled = false, observer: ResizeObserver | undefined, osmd: OpenSheetMusicDisplay | undefined, frame = 0;
    setLoading(true); setError(''); renderer.current = null;
    void import('opensheetmusicdisplay').then(async ({ OpenSheetMusicDisplay }) => {
      if (cancelled) return;
      el.replaceChildren();
      osmd = new OpenSheetMusicDisplay(el, { autoResize: false, backend: 'svg', drawTitle: false, drawSubtitle: false, drawComposer: false, drawPartNames: false, drawMeasureNumbers: true, drawMeasureNumbersOnlyAtSystemStart: false, followCursor: false });
      osmd.setLogLevel('error');
      await osmd.load(xml);
      if (cancelled) return;
      osmd.render();
      const cursor = osmd.cursor;
      positions.current = [];
      while (!cursor.Iterator.EndReached && positions.current.length < 20000) {
        positions.current.push(cursor.Iterator.CurrentSourceTimestamp.RealValue * 4);
        cursor.next();
      }
      cursor.reset(); cursor.show(); cursorIndex.current = 0;
      renderer.current = osmd;
      setLoading(false); setVersion(v => v + 1);
      let previousWidth = el.clientWidth;
      observer = new ResizeObserver(() => {
        if (el.clientWidth === previousWidth) return;
        previousWidth = el.clientWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { if (!cancelled && osmd) { osmd.render(); osmd.cursor.update(); } });
      });
      observer.observe(el);
    }).catch(() => { if (!cancelled) { setError('This score could not be drawn. Try another rhythm setting or track, or use the piano roll.'); setLoading(false); } });
    return () => { cancelled = true; cancelAnimationFrame(frame); observer?.disconnect(); osmd?.cursor?.Dispose(); osmd?.clear(); renderer.current = null; };
  }, [xml, pitchedTracks.length]);
  useEffect(() => {
    const osmd = renderer.current;
    if (!osmd || !visible.length) return;
    const localBeat = beat - visible[0].start / DIVISIONS;
    if (localBeat < 0 || localBeat >= (visible[visible.length - 1].end - visible[0].start) / DIVISIONS) { osmd.cursor.hide(); return; }
    let index = positions.current.findIndex(p => p > localBeat + .001);
    index = index < 0 ? positions.current.length - 1 : Math.max(0, index - 1);
    if (index < cursorIndex.current) { osmd.cursor.reset(); cursorIndex.current = 0; }
    while (cursorIndex.current < index) { osmd.cursor.next(); cursorIndex.current++; }
    osmd.cursor.show();
  }, [beat, safePage, version, visible]);
  const button = 'min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink disabled:opacity-40';
  return <div className="space-y-4 p-4 sm:p-5" aria-label="Sheet music viewer">
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">Score tracks<select aria-label="Score tracks" className={button} value={track} onChange={e => setTrack(Number(e.target.value))}><option value={-1}>All melodic tracks</option>{pitchedTracks.map(t => <option key={t.i} value={t.i}>{t.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-muted">Rhythm<select aria-label="Notation rhythm" className={button} value={quantum} onChange={e => setQuantum(Number(e.target.value))}><option value={6}>Sixteenth notes</option><option value={12}>Eighth notes</option><option value={8}>Eighth-note triplets</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} className="accent-accent" />Follow playback</label>
    </div>
    <p className="text-xs leading-5 text-muted">Transcribed from MIDI with estimated rhythms and sharps. Original beaming, key spelling, and hand assignments may differ. Percussion stays in the piano roll.</p>
    {!pitchedTracks.length ? <p className="rounded-lg bg-panel p-5 text-sm">This file contains percussion only. Use Piano roll to see its drum notes.</p> : <>
      {loading && <p role="status" className="text-sm text-muted">Engraving sheet music…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-score-paper" tabIndex={0} aria-label="Scrollable sheet music. Use the measure buttons below to seek.">
        <div ref={container} className="relative min-h-40 min-w-[640px] text-score-ink" role="img" aria-label={`Staff notation for ${song.title}, measures ${visible[0]?.number} to ${visible[visible.length - 1]?.number}`} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><button className={button} disabled={safePage <= 0} onClick={() => { setFollow(false); setPage(safePage - 1); }}>← Previous</button><p className="text-sm text-muted">Measures {visible[0]?.number}–{visible[visible.length - 1]?.number} of {measures.length}</p><button className={button} disabled={safePage >= totalPages - 1} onClick={() => { setFollow(false); setPage(safePage + 1); }}>Next →</button></div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Play from measure</span>{visible.map(m => <button key={m.number} className={`${button} ${m.number === currentMeasure + 1 ? 'border-accent bg-accent-soft' : ''}`} aria-label={`Seek to measure ${m.number}`} aria-current={m.number === currentMeasure + 1 ? 'step' : undefined} onClick={() => onSeek(timeAtBeat(song, m.start / DIVISIONS))}>{m.number}</button>)}</div>
    </>}
  </div>;
}
