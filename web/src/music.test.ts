import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { demoBytes, notesAt, parseMidi } from './music';
const bytes = (m: Midi) => Uint8Array.from(m.toArray()).buffer;
describe('MIDI import', () => {
  it('round trips a multitrack playable demo', () => {
    const song = parseMidi(demoBytes(), 'demo.mid');
    expect(song.title).toBe('Ode to Joy');
    expect(song.tracks).toHaveLength(2);
    expect(song.notes.length).toBeGreaterThan(30);
    expect(song.bpm).toBeCloseTo(108, 2);
    expect(song.duration).toBeGreaterThan(15);
  });
  it('preserves chords, velocity, tempo changes and sustain releases', () => {
    const m = new Midi();
    m.header.tempos = [{ ticks: 0, bpm: 120 }, { ticks: 480, bpm: 60 }]; m.header.update();
    const t = m.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: .5 });
    t.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: .8 });
    t.addNote({ midi: 67, ticks: 480, durationTicks: 480, velocity: .8 });
    t.addCC({ number: 64, ticks: 0, value: 1 }); t.addCC({ number: 64, ticks: 960, value: 0 });
    const s = parseMidi(bytes(m), 'timing.mid');
    expect(s.notes[0].duration).toBeCloseTo(1.5);
    expect(s.notes[1].time).toBeCloseTo(.5);
    expect(s.notes[1].duration).toBeCloseTo(1);
    expect(s.notes[0].velocity).toBeCloseTo(.5, 1);
    expect(notesAt(s.notes, .7, new Set())).toHaveLength(3);
    expect(notesAt(s.notes, .7, new Set([0]))).toHaveLength(0);
  });
  it('rejects non-MIDI, empty MIDI and unsupported time bases', () => {
    expect(() => parseMidi(new ArrayBuffer(3), 'fake.mid')).toThrow('not a MIDI');
    expect(() => parseMidi(bytes(new Midi()), 'empty.mid')).toThrow('no playable notes');
    const smpte = demoBytes(); new DataView(smpte).setUint16(12, 0xe728);
    expect(() => parseMidi(smpte, 'smpte.mid')).toThrow('SMPTE');
  });
});

it('uses the default tempo until a later first tempo change', () => {
  const midi = new Midi();
  midi.header.tempos = [{ ticks: 480, bpm: 60 }]; midi.header.update();
  const track = midi.addTrack();
  track.addNote({ midi: 60, ticks: 0, durationTicks: 960 });
  track.addNote({ midi: 64, ticks: 480, durationTicks: 480 });
  const song = parseMidi(bytes(midi), 'late-tempo.mid');
  expect(song.bpm).toBe(120);
  expect(song.notes[0].duration).toBeCloseTo(1.5);
  expect(song.notes[1].time).toBeCloseTo(.5);
});
