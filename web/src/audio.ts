import { notesAt, type Note, type Song } from './music';
import type { SampledAudio } from './sampled-audio';
import type { SoundStatus } from './sound-cache';
export type SoundMode = 'sampled' | 'piano' | 'simple';

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
  private sampled?: SampledAudio;
  private sampledPromise?: Promise<SampledAudio>;
  private compressor?: DynamicsCompressorNode;
  private destroyed = false;
  sound: SoundMode = 'sampled';
  loading = false;
  onLoading: (loading: boolean) => void = () => {};
  onSoundStatus: (status: SoundStatus) => void = () => {};
  private voices = new Set<OscillatorNode>();
  private timer?: ReturnType<typeof setInterval>;
  private origin = 0;
  private offset = 0;
  private index = 0;
  private generation = 0;
  song: Song | null = null;
  playing = false;
  speed = 1;
  volume = .65;
  loop = false;
  muted = new Set<number>();
  onUpdate: (time: number, playing: boolean) => void = () => {};

  get time() {
    return this.playing && this.context ? Math.min(this.song?.duration ?? 0, this.offset + (this.context.currentTime - this.origin) * this.speed) : this.offset;
  }
  load(song: Song) { this.pause(); this.song = song; this.offset = 0; this.muted = new Set(); this.onUpdate(0, false); }
  async play() {
    if (!this.song || this.playing || this.destroyed) return;
    const generation = ++this.generation, song = this.song;
    this.loading = true; this.onLoading(true);
    try {
      this.context ??= new AudioContext();
      if (!this.master) { this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination); }
      // Resume within the user's gesture, before downloading any sounds.
      await this.context.resume();
      if (generation !== this.generation) return;
      if (this.offset >= song.duration) this.offset = 0;
      if (this.sound !== 'simple') {
        if (!this.sampledPromise) {
          this.compressor ??= this.context.createDynamicsCompressor();
          this.compressor.threshold.value = -8; this.compressor.knee.value = 12; this.compressor.ratio.value = 4;
          this.compressor.disconnect(); this.compressor.connect(this.master);
          this.sampledPromise = import('./sampled-audio').then(({ SampledAudio }) => SampledAudio.create(this.context!, this.compressor!, status => this.onSoundStatus(status)))
            .then(engine => { if (this.destroyed) { engine.destroy(); throw new Error('Player closed.'); } this.sampled = engine; return engine; })
            .catch(error => { this.sampledPromise = undefined; throw error; });
        }
        const engine = await this.sampledPromise;
        if (generation !== this.generation) return;
        await engine.prepare(song, this.offset, new Set(this.muted), this.sound === 'piano');
        if (generation !== this.generation) return;
      }
      this.master.gain.value = song.tracks.every((_,i) => this.muted.has(i)) ? 0 : this.volume * (this.sound === 'simple' ? .22 : .8);
      this.origin = this.context.currentTime;
      this.playing = true;
      if (this.sound !== 'simple') this.sampled!.play(this.speed);
      else {
        this.index = song.notes.findIndex(n => n.time >= this.offset);
        if (this.index < 0) this.index = song.notes.length;
        for (const n of notesAt(song.notes, this.offset, this.muted)) {
          if (n.time < this.offset) this.soundNote(n, this.origin, (n.time + n.duration - this.offset) / this.speed);
        }
      }
      this.tick(); this.timer = setInterval(() => this.tick(), 25);
    } catch (error) { if (generation === this.generation) { if (this.sound !== 'simple') this.onSoundStatus({ message: 'Instrument sounds unavailable. Retry Play or choose Simple tones.' }); throw error; } }
    finally { if (generation === this.generation) { this.loading = false; this.onLoading(false); } }
  }
  pause() {
    this.generation++;
    this.offset = this.time; this.playing = false;
    this.loading = false; this.onLoading(false);
    clearInterval(this.timer);
    this.sampled?.pause();
    if (this.master) { this.master.gain.cancelScheduledValues(this.context!.currentTime); this.master.gain.value = 0; }
    this.voices.forEach(o => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); });
    this.voices.clear();
    this.onUpdate(this.offset, false);
  }
  seek(time: number) { this.pause(); this.offset = Math.max(0, Math.min(time, this.song?.duration ?? 0)); this.onUpdate(this.offset, false); }
  setVolume(value: number) { this.volume = value; if (!this.playing || this.song?.tracks.every((_,i) => this.muted.has(i))) return; this.master?.gain.setTargetAtTime(value * (this.sound === 'simple' ? .22 : .8), this.context!.currentTime, .015); }
  destroy() { this.destroyed = true; this.pause(); this.sampled?.destroy(); void this.context?.close(); }
  private tick() {
    if (!this.playing || !this.song || !this.context) return;
    const now = this.time;
    if (now >= this.song.duration) {
      if (this.loop) { this.pause(); this.offset = 0; void this.play().catch(() => this.pause()); }
      else {
        this.offset = this.song.duration; this.playing = false; clearInterval(this.timer);
        this.sampled?.finish(); this.onUpdate(this.offset, false);
      }
      return;
    }
    if (this.sound !== 'simple') { this.onUpdate(now, true); return; }
    while (this.index < this.song.notes.length && this.song.notes[this.index].time < now + .12 * this.speed) {
      const n = this.song.notes[this.index++];
      const when = this.origin + (n.time - this.offset) / this.speed;
      const end = when + n.duration / this.speed;
      if (!this.muted.has(n.track) && end > this.context.currentTime) this.soundNote(n, Math.max(when, this.context.currentTime), end - Math.max(when, this.context.currentTime));
    }
    this.onUpdate(now, true);
  }
  private soundNote(note: Note, when: number, duration: number) {
    if (!this.context || !this.master || this.voices.size >= 256) return;
    const drum = this.song?.tracks[note.track].percussion;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440 * 2 ** ((note.midi - 69) / 12), when);
    if (drum) { duration = Math.min(duration, .15); osc.frequency.exponentialRampToValueAtTime(40, when + duration); }
    const level = Math.max(.001, note.velocity * (drum ? .7 : .5));
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + Math.min(.008, duration / 2));
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, level * .35), when + duration);
    gain.gain.linearRampToValueAtTime(0, when + duration + .035);
    osc.connect(gain); gain.connect(this.master);
    this.voices.add(osc);
    osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(when); osc.stop(when + duration + .04);
  }
}
