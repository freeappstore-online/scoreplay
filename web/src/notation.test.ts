// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { beatAtTime, demoBytes, parseMidi, timeAtBeat } from './music';
import { DIVISIONS, measuresFor, scoreXml } from './notation';
function xmlDoc(xml: string) { return new DOMParser().parseFromString(xml, 'application/xml'); }
it('engraves a grand staff with the right pitches and complete measures', () => {
  const song = parseMidi(demoBytes(), 'demo.mid');
  const xml = xmlDoc(scoreXml(song, measuresFor(song), 0, -1));
  expect(xml.querySelector('parsererror')).toBeNull();
  expect(xml.querySelectorAll('clef')).toHaveLength(2);
  expect(xml.querySelector('note pitch step')?.textContent).toBe('E');
  expect(xml.querySelector('note pitch octave')?.textContent).toBe('4');
  expect(xml.querySelectorAll('measure')).toHaveLength(4);
  for (const measure of xml.querySelectorAll('measure')) {
    for (const staff of ['1', '2']) {
      const total = [...measure.querySelectorAll('note')].filter(n => n.querySelector('staff')?.textContent === staff && !n.querySelector('chord')).reduce((sum, n) => sum + Number(n.querySelector('duration')?.textContent), 0);
      expect(total).toBe(4 * DIVISIONS);
    }
  }
});
it('retains overlapping note lengths using tied chords and splits across bars', () => {
  const midi = new Midi(); const track = midi.addTrack();
  track.addNote({ midi: 60, ticks: 0, durationTicks: 6 * 480 });
  track.addNote({ midi: 64, ticks: 480, durationTicks: 480 });
  const song = parseMidi(Uint8Array.from(midi.toArray()).buffer, 'poly.mid');
  const xml = xmlDoc(scoreXml(song, measuresFor(song), 0, 0));
  expect(xml.querySelector('chord')).not.toBeNull();
  const bars = xml.querySelectorAll('measure');
  expect(bars).toHaveLength(2);
  expect(bars[0].querySelector('tie[type="start"]')).not.toBeNull();
  expect(bars[1].querySelector('tie[type="stop"]')).not.toBeNull();
  expect(bars[1].querySelector('rest')).not.toBeNull();
});
it('supports meter changes and maps playback through tempo changes', () => {
  const midi = new Midi();
  midi.header.tempos = [{ ticks: 0, bpm: 120 }, { ticks: 1920, bpm: 60 }];
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4,4] }, { ticks: 1920, timeSignature: [3,4] }]; midi.header.update();
  midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 3360 });
  const song = parseMidi(Uint8Array.from(midi.toArray()).buffer, 'meters.mid');
  const measures = measuresFor(song);
  expect(measures.map(m => m.end - m.start)).toEqual([96,72]);
  expect(timeAtBeat(song, 5)).toBeCloseTo(3);
  expect(beatAtTime(song, 3)).toBeCloseTo(5);
  const xml = xmlDoc(scoreXml(song, measures, 0, 0));
  expect([...xml.querySelectorAll('time beats')].map(n => n.textContent)).toEqual(['4','3']);
});
it('keeps a short final note quantized across a bar boundary and escapes titles', () => {
  const midi = new Midi(); midi.name = 'A & <B>';
  midi.addTrack().addNote({ midi: 60, ticks: 1919, durationTicks: 1 });
  const song = parseMidi(Uint8Array.from(midi.toArray()).buffer, 'short.mid');
  const measures = measuresFor(song);
  expect(measures).toHaveLength(2);
  const xml = xmlDoc(scoreXml(song, measures, 0, -1));
  expect(xml.querySelector('work-title')?.textContent).toBe('A & <B>');
  expect(xml.querySelector('pitch')).not.toBeNull();
});
