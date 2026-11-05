import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Midi } from '@tonejs/midi';
import { SoundBankLoader } from 'spessasynth_core';
import { sampledSequence } from './sampled-sequence';
import { parseMidi } from './music';
import bank from './sound-bank.json';
it('retains instruments, independent drum channels, velocities, held notes and exact timing when seeking', () => {
  const midi = new Midi(); midi.header.setTempo(90);
  const piano = midi.addTrack(); piano.instrument.number = 0; piano.addNote({ midi:60,time:0,duration:4,velocity:.3 });
  const violin = midi.addTrack(); violin.instrument.number = 40; violin.addNote({ midi:67,time:3,duration:2,velocity:.8 });
  for (let i=0;i<2;i++) { const drum=midi.addTrack(); drum.channel=9; drum.addNote({midi:36+i*2,time:3,duration:.2,velocity:.7}); }
  const song=parseMidi(Uint8Array.from(midi.toArray()).buffer,'test.mid');
  const result=sampledSequence(song,2,new Set([1]),false);
  expect(result.count).toBe(3);
  expect(new Set(result.channels.map(c=>c.port*16+c.channel)).size).toBe(4);
  const output=new Midi(result.binary), tracks=output.tracks.filter(t=>t.notes.length);
  expect(tracks[0].notes[0].time).toBe(0); expect(tracks[0].notes[0].duration).toBeCloseTo(2);
  expect(tracks[0].notes[0].velocity).toBeCloseTo(.3,1);
  expect(tracks.filter(t=>t.channel===9)).toHaveLength(2);
  const normal=new Midi(sampledSequence(song,0,new Set(),false).binary);
  expect(normal.tracks.find(t=>t.instrument.number===40)?.notes[0].time).toBeCloseTo(3);
  const pianoOnly=new Midi(sampledSequence(song,0,new Set(),true).binary);
  expect(pianoOnly.tracks.filter(t=>t.notes.length && t.channel!==9).every(t=>t.instrument.number===0)).toBe(true);
  expect(sampledSequence(song,0,new Set([0,1,2,3]),false).count).toBe(0);
});
it('ships the verified sampled bank with all General MIDI instruments and percussion', () => {
  const bytes=readFileSync(resolve('public',`.${bank.url}`));
  expect(bytes.length).toBe(bank.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(bank.sha256);
  const sound=SoundBankLoader.fromArrayBuffer(Uint8Array.from(bytes).buffer);
  expect(sound.presets.length).toBeGreaterThanOrEqual(128);
  expect(sound.samples.length).toBeGreaterThan(100);
  expect(bytes.length).toBeLessThan(20*1024*1024);
});
