import { useEffect, useState } from 'react';
import { Card } from '@freeappstore/sdk/ui';
import { formatTime, type Song } from './music';
import { pitchLabel, transposeBounds, validLoop, type LoopRange } from './practice';
import { button, selectedButton, control } from './ui';

type Props = {
  song: Song; transpose: number; onTranspose: (value: number) => void;
  metronome: boolean; onMetronome: () => void; countIn: boolean; onCountIn: (value: boolean) => void;
  range: LoopRange | null; time: number; loop: boolean; onRange: (range: LoopRange | null) => void;
};
export function PracticeControls({ song, transpose, onTranspose, metronome, onMetronome, countIn, onCountIn, range, time, loop, onRange }: Props) {
  const bounds = transposeBounds(song), start = range?.start ?? 0, end = range?.end ?? song.duration;
  const [a, setA] = useState(String(start)), [b, setB] = useState(String(end)), [error, setError] = useState('');
  useEffect(() => { setA(String(Number(start.toFixed(3)))); setB(String(Number(end.toFixed(3)))); setError(''); }, [start, end]);
  const apply = () => {
    const value = { start: Number(a), end: Number(b) };
    if (!a.trim() || !b.trim() || !validLoop(value, song.duration)) { setError('Choose A before B, at least 0.1 seconds apart, within this piece.'); return; }
    setError(''); onRange(value);
  };
  return <Card><section aria-label="Practice tools" className="space-y-5"><div><h2 className="text-xl">Make it your practice</h2><p className="mt-1 text-xs text-muted">Change the pitch, find the beat, or repeat a tricky passage. Your original files stay unchanged.</p></div>
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-3"><label className="block text-sm font-semibold" htmlFor="transpose">Transpose</label><div className="flex items-center gap-2"><button className={button} aria-label="Transpose down one semitone" disabled={transpose <= bounds.min} onClick={() => onTranspose(transpose - 1)}>−</button><select id="transpose" className={control} value={transpose} onChange={e => onTranspose(Number(e.target.value))}>{Array.from({ length: 25 }, (_, i) => i - 12).map(value => <option key={value} value={value} disabled={value < bounds.min || value > bounds.max}>{pitchLabel(value)}</option>)}</select><button className={button} aria-label="Transpose up one semitone" disabled={transpose >= bounds.max} onClick={() => onTranspose(transpose + 1)}>+</button></div><button className={button} disabled={transpose === 0} onClick={() => onTranspose(0)}>Reset pitch</button><p className="text-xs leading-5 text-muted">Playback, sheet notation and piano roll move together. Drums keep their original pitches.</p></div>
      <div className="min-w-0 space-y-3"><p className="text-sm font-semibold">Keep the beat</p><button className={metronome ? selectedButton : button} aria-pressed={metronome} onClick={onMetronome}>Metronome {metronome ? 'on' : 'off'}</button><label className="block text-sm" htmlFor="count-in">Count-in</label><select id="count-in" className={control} value={countIn ? 'bar' : 'off'} onChange={e => onCountIn(e.target.value === 'bar')}><option value="off">Off · start immediately</option><option value="bar">One bar before playback</option></select><p className="text-xs leading-5 text-muted">Follows MIDI tempo and time-signature changes. Compound meters such as 6/8 use grouped beats. Count-in plays once, not on each loop.</p></div>
      <div className="min-w-0 space-y-3"><p className="text-sm font-semibold">Repeat a section</p><p className="text-sm text-muted">{range ? `A ${formatTime(start)} → B ${formatTime(end)} · ${loop ? 'Looping' : 'Loop off'}` : 'Set A and B with the playhead, or enter exact times.'}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={end - time < .1} onClick={() => onRange({ start: time, end })}>Set A here</button><button className={button} disabled={time - start < .1} onClick={() => onRange({ start, end: time })}>Set B here</button><button className={button} disabled={!range} onClick={() => onRange(null)}>Clear section</button></div><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Edit A–B times</summary><div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted">A · seconds<input aria-label="Loop start in seconds" type="number" step="0.1" min="0" max={song.duration} value={a} onChange={e => setA(e.target.value)} className={control} /></label><label className="text-xs text-muted">B · seconds<input aria-label="Loop end in seconds" type="number" step="0.1" min="0" max={song.duration} value={b} onChange={e => setB(e.target.value)} className={control} /></label></div><button className={`${button} mt-3`} onClick={apply}>Apply section loop</button>{error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}</details></div>
    </div>
  </section></Card>;
}
