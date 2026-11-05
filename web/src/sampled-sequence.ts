import { MIDIBuilder } from 'spessasynth_core';
import type { Song } from './music';
/** Rebuild the audible remainder on seek/resume, including held notes. Timing is already resolved from the source tempo map. */
export function sampledSequence(song: Song, offset: number, muted: Set<number>, pianoOnly: boolean) {
  const midi = new MIDIBuilder({ format: 1, timeDivision: 480, initialTempo: 120, name: song.title });
  const channels: { channel: number; port: number }[] = [];
  let melodic = 0, drums = 0;
  const drumPortStart = Math.ceil(song.tracks.filter(t => !t.percussion).length / 15);
  song.tracks.forEach((track, i) => {
    const slot = melodic % 15;
    const channel = track.percussion ? 9 : slot >= 9 ? slot + 1 : slot;
    const port = track.percussion ? drumPortStart + drums++ : Math.floor(melodic++ / 15);
    channels.push({ channel, port }); midi.addTrack(track.name, port);
    midi.programChange(0, i + 1, channel, pianoOnly && !track.percussion ? 0 : track.program ?? 0);
    midi.controllerChange(0, i + 1, channel, 91, 28); // A little room ambience.
    midi.controllerChange(0, i + 1, channel, 93, 0);
  });
  let count = 0;
  for (const note of song.notes) {
    if (muted.has(note.track) || note.time + note.duration <= offset) continue;
    const { channel } = channels[note.track];
    const start = Math.max(0, Math.round((note.time - offset) * 960));
    const end = Math.max(start + 1, Math.round((note.time + note.duration - offset) * 960));
    midi.noteOn(start, note.track + 1, channel, note.midi, Math.max(1, Math.round(note.velocity * 127)));
    midi.noteOff(end, note.track + 1, channel, note.midi); count++;
  }
  midi.flush();
  return { binary: midi.writeMIDI(), count, channels };
}
