import { useSyncExternalStore } from 'react';
import { formatTime } from './music';
import type { LibraryPreview, PreviewSource } from './library-preview';
const button = 'min-h-11 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel disabled:opacity-40';

export function PreviewButton({ preview, source, disabled }: { preview: LibraryPreview; source: PreviewSource; disabled?: boolean }) {
  const phase = useSyncExternalStore(preview.subscribe, () => preview.getSnapshot().id === source.id ? preview.getSnapshot().phase : 'idle');
  const action = phase === 'loading' ? 'Cancel preview' : phase === 'playing' ? 'Pause preview' : phase === 'paused' ? 'Resume preview' : 'Preview';
  return <button className={phase === 'playing' ? 'min-h-11 rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-semibold text-paper' : button} disabled={disabled} aria-label={`${action} ${source.title}`} aria-pressed={phase === 'playing'} onClick={() => void preview.toggle(source)}>{phase === 'loading' ? 'Cancel' : phase === 'playing' ? 'Ⅱ Pause' : phase === 'paused' ? '▶ Resume' : '▶ Preview'}</button>;
}

export function PreviewBar({ preview }: { preview: LibraryPreview }) {
  const state = useSyncExternalStore(preview.subscribe, preview.getSnapshot);
  if (state.phase === 'idle') return null;
  return <><div aria-hidden="true" className="h-40" /><section aria-label="Music preview" className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-4xl rounded-2xl border-2 border-accent bg-paper p-4 shadow-lg">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><p role="status" className="text-xs font-semibold text-accent">{state.phase === 'loading' ? 'Preparing preview…' : state.phase === 'playing' ? 'Playing preview' : state.phase === 'ended' ? 'Preview finished' : state.phase === 'error' ? 'Preview unavailable' : 'Preview paused'}</p><p className="mt-1 truncate text-sm font-bold" title={state.title}>{state.title}</p></div><div className="flex shrink-0 gap-2">
      {state.phase !== 'loading' && <button className={button} onClick={preview.toggleCurrent} aria-label={state.phase === 'playing' ? 'Pause preview' : state.phase === 'error' ? 'Retry preview' : 'Resume preview'}>{state.phase === 'playing' ? 'Ⅱ Pause' : state.phase === 'error' ? 'Retry' : '▶ Play'}</button>}
      <button className={button} onClick={preview.stop} aria-label="Stop preview">■ Stop</button>
    </div></div>
    {state.error ? <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p> : <div className="mt-2 flex items-center gap-3"><progress aria-label="Preview position" value={state.time} max={state.duration || 1} className="h-1.5 min-w-0 flex-1 accent-accent" /><span className="text-xs tabular-nums text-muted">{formatTime(state.time)} / {formatTime(state.duration)}</span></div>}
  </section></>;
}
