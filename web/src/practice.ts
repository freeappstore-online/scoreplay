import { beatAtTime, timeAtBeat, formatTime, type Song } from './music';
export type LoopRange = { start: number; end: number };
export function transposeBounds(song: Song) {
  let low = 127, high = 0, pitched = false;
  for (const note of song.notes) if (!song.tracks[note.track].percussion) { pitched = true; low = Math.min(low, note.midi); high = Math.max(high, note.midi); }
  return pitched ? { min: Math.max(-12, -low), max: Math.min(12, 127 - high) } : { min: 0, max: 0 };
}
export function transposeSong(song: Song, semitones: number): Song {
  if (!semitones) return song;
  const bounds = transposeBounds(song);
  if (!Number.isInteger(semitones) || semitones < bounds.min || semitones > bounds.max) throw new Error('That transposition exceeds this piece’s MIDI note range.');
  return { ...song, notes: song.notes.map(note => song.tracks[note.track].percussion ? note : { ...note, midi: note.midi + semitones }) };
}
export const pitchLabel = (value: number) => value === 0 ? 'Original pitch' : `${value > 0 ? '+' : '−'}${Math.abs(value)} semitone${Math.abs(value) === 1 ? '' : 's'}`;
export function validLoop(range: LoopRange, duration: number) {
  return Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end <= duration && range.end - range.start >= .1 - 1e-9;
}
export function formatLoopTime(seconds: number) {
  const milliseconds = Math.round(seconds * 1000);
  return `${formatTime(milliseconds / 1000)}.${String(milliseconds % 1000).padStart(3, '0')}`;
}
export function rhythmAt(song: Song, time: number) {
  const beat = beatAtTime(song, time);
  const meter = [...song.meters].reverse().find(m => m.beat <= beat && m.numerator > 0 && m.numerator <= 32 && [1,2,4,8,16,32].includes(m.denominator)) ?? { beat: 0, numerator: 4, denominator: 4 };
  const compound = meter.denominator >= 8 && meter.numerator > 3 && meter.numerator % 3 === 0;
  const step = 4 / meter.denominator * (compound ? 3 : 1);
  const bpm = ([...song.tempos].reverse().find(t => t.time <= time)?.bpm ?? 120);
  return { meter, step, beatsPerBar: meter.numerator / (compound ? 3 : 1), secondsPerBeat: 60 / bpm * step, bpm };
}
const clicks = new WeakMap<Song, { time: number; accent: boolean }[]>();
export function metronomeBeats(song: Song) {
  const cached = clicks.get(song); if (cached) return cached;
  const result: { time: number; accent: boolean }[] = [];
  let beat = 0, index = 0;
  while (timeAtBeat(song, beat) < song.duration && index < 250000) {
    const time = timeAtBeat(song, beat), { meter, step, beatsPerBar } = rhythmAt(song, time + .000001);
    result.push({ time, accent: Math.abs((beat - meter.beat) / step % beatsPerBar) < .00001 });
    const nextMeter = song.meters.find(m => m.beat > beat + .00001 && m.beat < beat + step);
    beat = nextMeter?.beat ?? beat + step; index++;
  }
  clicks.set(song, result); return result;
}
