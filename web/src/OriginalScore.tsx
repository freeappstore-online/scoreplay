import { useEffect, useMemo, useRef, useState } from 'react';
import { beatAtTime, timeAtBeat, type Song } from './music';
import { readMusicXml } from './original-score';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
const PAGE_SIZE = 4;
export default function OriginalScore({ xml, song, time, onSeek }: { xml: string; song: Song; time: number; onSeek: (time: number) => void }) {
  const score = useMemo(() => readMusicXml(xml), [xml]);
  const [page, setPage] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [follow, setFollow] = useState(true);
  const [ready, setReady] = useState(0), [rendered, setRendered] = useState(0);
  const container = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const renderer = useRef<OpenSheetMusicDisplay | null>(null);
  const positions = useRef<number[]>([]), cursorIndex = useRef(0), redraw = useRef(() => {});
  const pages = Math.ceil(score.measures.length / PAGE_SIZE), safePage = Math.min(page, pages - 1);
  const visible = score.measures.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const beat = beatAtTime(song, time);
  const found = score.measures.findIndex(m => m.end > beat);
  const current = found < 0 ? score.measures.length - 1 : found;
  useEffect(() => { if (follow) setPage(Math.floor(current / PAGE_SIZE)); }, [current, follow]);
  useEffect(() => {
    let cancelled = false, osmd: OpenSheetMusicDisplay | undefined, observer: ResizeObserver | undefined, frame = 0;
    setLoading(true); setError(''); renderer.current = null;
    const el = container.current!;
    void import('opensheetmusicdisplay').then(async ({ OpenSheetMusicDisplay }) => {
      if (cancelled) return;
      el.replaceChildren();
      osmd = new OpenSheetMusicDisplay(el, { autoResize: false, backend: 'svg', drawTitle: false, drawSubtitle: false, drawComposer: false, drawPartNames: true, drawMeasureNumbers: true, drawMeasureNumbersOnlyAtSystemStart: false, followCursor: false });
      osmd.setLogLevel('error');
      await osmd.load(new DOMParser().parseFromString(score.xml, 'application/xml'));
      if (cancelled) return;
      renderer.current = osmd; setReady(value => value + 1);
      let width = el.clientWidth;
      observer = new ResizeObserver(() => {
        if (el.clientWidth === width) return;
        width = el.clientWidth; cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { if (!cancelled) redraw.current(); });
      });
      observer.observe(el);
    }).catch(() => { if (!cancelled) { setLoading(false); setError('The original score could not be displayed. Try the MIDI transcription or PDF score.'); } });
    return () => { cancelled = true; observer?.disconnect(); cancelAnimationFrame(frame); osmd?.cursor?.Dispose(); osmd?.clear(); renderer.current = null; };
  }, [score]);
  useEffect(() => {
    const osmd = renderer.current;
    if (!osmd) return;
    const draw = () => {
      try {
        // Page by source index. OSMD renumbers pickup measures to zero, so its
        // printed-measure options otherwise skip a bar at page boundaries.
        osmd.EngravingRules.MinMeasureToDrawNumber = 0;
        osmd.EngravingRules.MaxMeasureToDrawNumber = 0;
        osmd.EngravingRules.MinMeasureToDrawIndex = safePage * PAGE_SIZE;
        osmd.EngravingRules.MaxMeasureToDrawIndex = Math.min((safePage + 1) * PAGE_SIZE - 1, score.measures.length - 1);
        osmd.render(); osmd.cursor.hide(); osmd.cursor.reset();
        const iterator = osmd.cursor.Iterator.clone();
        positions.current = [];
        while (!iterator.EndReached && positions.current.length < 20000) {
          positions.current.push(iterator.CurrentSourceTimestamp.RealValue * 4);
          iterator.moveToNext();
        }
        cursorIndex.current = 0;
        osmd.cursor.cursorElement.alt = 'Playback cursor';
        setLoading(false); setError(''); setRendered(value => value + 1);
      } catch { setLoading(false); setError('The original score could not be displayed. Try the MIDI transcription or PDF score.'); }
    };
    redraw.current = draw; draw();
    return () => { redraw.current = () => {}; };
  }, [score, safePage, ready]);
  useEffect(() => {
    const cursor = renderer.current?.cursor;
    if (!cursor || !positions.current.length || !visible.length) return;
    if (beat < visible[0].start || beat >= visible[visible.length - 1].end) { cursor.hide(); return; }
    let index = positions.current.findIndex(value => value > beat + .001);
    index = index < 0 ? positions.current.length - 1 : Math.max(0, index - 1);
    if (index < cursorIndex.current) { cursor.reset(); cursorIndex.current = 0; }
    while (cursorIndex.current < index) { cursor.next(); cursorIndex.current++; }
    cursor.show();
    cursor.cursorElement.dataset.scoreBeat = String(positions.current[index]);
    cursor.cursorElement.dataset.measure = String(cursor.Iterator.CurrentMeasureIndex + 1);
    if (follow && viewport.current) {
      const mark = cursor.cursorElement.getBoundingClientRect(), view = viewport.current.getBoundingClientRect();
      if (mark.right > view.right - 20 || mark.left < view.left + 20) viewport.current.scrollLeft += mark.left - view.left - 40;
    }
  }, [beat, safePage, rendered, follow, visible]);
  const button = 'min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink disabled:opacity-40';
  return <section className="space-y-4 p-4 sm:p-5" aria-label="Original MusicXML score">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">Original MusicXML notation</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />Follow playback</label></div>
    <p className="text-xs leading-5 text-muted">Original notes, clefs, keys, voices and lyrics. The cursor follows MIDI timing; scores with repeats or a different arrangement may not line up.</p>
    {loading && <p role="status" className="text-sm text-muted">Loading original score…</p>}{error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div ref={viewport} className="overflow-x-auto rounded-xl border border-line bg-score-paper" tabIndex={0} aria-label="Scrollable original sheet music"><div ref={container} className="relative min-h-40 min-w-[640px] text-score-ink" role="img" aria-label={`Original score, measures ${visible[0]?.label} to ${visible[visible.length - 1]?.label}`} /></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><button className={button} disabled={safePage === 0} onClick={() => { setFollow(false); setPage(safePage - 1); }}>← Previous score page</button><span className="text-sm text-muted">Score page {safePage + 1} of {pages}</span><button className={button} disabled={safePage >= pages - 1} onClick={() => { setFollow(false); setPage(safePage + 1); }}>Next score page →</button></div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Play from measure</span>{visible.map((m,i) => <button key={m.number} className={`${button} ${safePage * PAGE_SIZE + i === current ? 'border-accent bg-accent-soft' : ''}`} aria-label={`Seek to score measure ${m.label}`} aria-current={safePage * PAGE_SIZE + i === current ? 'step' : undefined} onClick={() => onSeek(timeAtBeat(song, m.start))}>{m.label}</button>)}</div>
  </section>;
}
