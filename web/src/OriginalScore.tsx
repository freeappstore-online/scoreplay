import { useEffect, useMemo, useRef, useState } from 'react';
import { beatAtTime, timeAtBeat, type Song } from './music';
import { readMusicXml } from './original-score';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
export default function OriginalScore({ xml, song, time, onSeek }: { xml: string; song: Song; time: number; onSeek: (time: number) => void }) {
  const score = useMemo(() => readMusicXml(xml), [xml]);
  const [page, setPage] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [follow, setFollow] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const pages = Math.ceil(score.measures.length / 4), safePage = Math.min(page, pages - 1);
  const visible = score.measures.slice(safePage * 4, safePage * 4 + 4);
  const beat = beatAtTime(song, time);
  const found = score.measures.findIndex(m => m.end > beat);
  const current = found < 0 ? score.measures.length - 1 : found;
  useEffect(() => { if (follow) setPage(Math.floor(current / 4)); }, [current, follow]);
  useEffect(() => {
    let cancelled = false, osmd: OpenSheetMusicDisplay | undefined, observer: ResizeObserver | undefined, frame = 0;
    setLoading(true); setError('');
    const el = container.current!;
    void import('opensheetmusicdisplay').then(async ({ OpenSheetMusicDisplay }) => {
      if (cancelled) return;
      el.replaceChildren();
      osmd = new OpenSheetMusicDisplay(el, { autoResize: false, backend: 'svg', drawTitle: false, drawSubtitle: false, drawComposer: false, drawPartNames: true, drawMeasureNumbers: true, drawMeasureNumbersOnlyAtSystemStart: false, disableCursor: true, drawFromMeasureNumber: safePage * 4 + 1, drawUpToMeasureNumber: safePage * 4 + 4 });
      // Pass a parsed document: OSMD otherwise treats declaration-free XML as a URL.
      osmd.setLogLevel('error'); await osmd.load(new DOMParser().parseFromString(score.xml, 'application/xml'));
      if (cancelled) return;
      osmd.render(); setLoading(false);
      let width = el.clientWidth;
      observer = new ResizeObserver(() => { if (el.clientWidth === width) return; width = el.clientWidth; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!cancelled) osmd?.render(); }); }); observer.observe(el);
    }).catch(() => { if (!cancelled) { setLoading(false); setError('The original score could not be displayed. Try the MIDI transcription or PDF score.'); } });
    return () => { cancelled = true; observer?.disconnect(); cancelAnimationFrame(frame); osmd?.clear(); };
  }, [score, safePage]);
  const button = 'min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink disabled:opacity-40';
  return <section className="space-y-4 p-4 sm:p-5" aria-label="Original MusicXML score">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">Original MusicXML notation</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />Follow MIDI timing</label></div>
    <p className="text-xs leading-5 text-muted">Notes, clefs, keys, voices, and lyrics come from your score. Timing links assume the same arrangement and starting point; repeats in the score can differ from MIDI playback.</p>
    {loading && <p role="status" className="text-sm text-muted">Loading original score…</p>}{error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-line bg-score-paper" tabIndex={0} aria-label="Scrollable original sheet music"><div ref={container} className="min-h-40 min-w-[640px] text-score-ink" role="img" aria-label={`Original score, measures ${visible[0]?.label} to ${visible[visible.length - 1]?.label}`} /></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><button className={button} disabled={safePage === 0} onClick={() => { setFollow(false); setPage(safePage - 1); }}>← Previous score page</button><span className="text-sm text-muted">Score page {safePage + 1} of {pages}</span><button className={button} disabled={safePage >= pages - 1} onClick={() => { setFollow(false); setPage(safePage + 1); }}>Next score page →</button></div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Seek MIDI to score measure</span>{visible.map(m => <button key={m.number} className={button} onClick={() => onSeek(timeAtBeat(song, m.start))}>{m.label}</button>)}</div>
  </section>;
}
