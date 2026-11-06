import { expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { demoBytes, parseMidi } from './music';
import { metronomeBeats, rhythmAt, transposeBounds, transposeSong, validLoop } from './practice';
import { sampledSequence } from './sampled-sequence';
it('transposes pitched notes without changing drums, timing, instruments or source data', () => {
  const midi = new Midi();
  const melody = midi.addTrack(); melody.instrument.number = 40; melody.addNote({ midi: 60, time: 0, duration: 4, velocity: .7 });
  melody.addNote({ midi: 67, time: 3, duration: 1, velocity: .7 });
  const drums = midi.addTrack(); drums.channel = 9; drums.addNote({ midi: 36, time: 1.5, duration: .2, velocity: .7 });
  const song = parseMidi(Uint8Array.from(midi.toArray()).buffer, 'Practice');
  const shifted = transposeSong(song, 2);
  expect(shifted.notes.map(n => n.midi)).toEqual([62, 36, 69]);
  expect(song.notes.map(n => n.midi)).toEqual([60, 36, 67]);
  expect(shifted.tracks).toBe(song.tracks); expect(shifted.tempos).toBe(song.tempos);
  const rendered = new Midi(sampledSequence(song, 1, new Set(), false, 2, 2).binary);
  const violin = rendered.tracks.find(t => t.instrument.number === 40)!;
  expect(violin.notes).toHaveLength(1); expect(violin.notes[0].midi).toBe(62);
  expect(violin.notes[0].time).toBe(0); expect(violin.notes[0].duration).toBeCloseTo(1);
  expect(rendered.tracks.find(t => t.channel === 9)!.notes[0].midi).toBe(36);
});
it('restricts transposition to MIDI range instead of flattening out-of-range notes', () => {
  const song = parseMidi(demoBytes(), 'Demo'); song.notes[0] = { ...song.notes[0], midi: 126 };
  expect(transposeBounds(song).max).toBe(1);
  expect(() => transposeSong(song, 2)).toThrow('range');
  expect(validLoop({ start: 2, end: 1 }, 10)).toBe(false);
  expect(validLoop({ start: 2, end: 11 }, 10)).toBe(false);
  expect(validLoop({ start: 2, end: 3 }, 10)).toBe(true);
});
it('places compound-meter beats and accents through tempo and meter changes', () => {
  const song = { ...parseMidi(demoBytes(), 'Demo'), duration: 6,
    tempos: [{ beat: 0, time: 0, bpm: 120 }, { beat: 3, time: 1.5, bpm: 60 }],
    meters: [{ beat: 0, numerator: 6, denominator: 8 }, { beat: 6, numerator: 3, denominator: 4 }],
  };
  expect(rhythmAt(song, 0)).toMatchObject({ beatsPerBar: 2, secondsPerBeat: .75 });
  expect(metronomeBeats(song)).toEqual([
    { time: 0, accent: true }, { time: .75, accent: false }, { time: 1.5, accent: true },
    { time: 3, accent: false }, { time: 4.5, accent: true }, { time: 5.5, accent: false },
  ]);
});
