import { notesAt, type Note, type Song } from './music';
import type { SampledAudio } from './sampled-audio';
import { metronomeBeats, rhythmAt, validLoop, transposeBounds, type LoopRange } from './practice';
export type SoundMode = 'sampled' | 'piano' | 'simple';

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
  private clickGain?: GainNode;
  private clicks = new Set<OscillatorNode>();
  private clickIndex = 0;
  private beats: { time: number; accent: boolean }[] = [];
  private started = false;
  private countInterval = 0;
  private sampled?: SampledAudio;
  private sampledPromise?: Promise<SampledAudio>;
  private compressor?: DynamicsCompressorNode;
  private destroyed = false;
  sound: SoundMode = 'sampled';
  loading = false;
  onLoading: (loading: boolean) => void = () => {};
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
  loopRange: LoopRange | null = null;
  transpose = 0;
  metronome = false;
  countIn = false;
  countingIn = 0;
  onCountIn: (remaining: number) => void = () => {};
  onError: (message: string) => void = () => {};
  muted = new Set<number>();
  onUpdate: (time: number, playing: boolean) => void = () => {};

  get time() {
    return this.playing && this.started && this.context ? Math.min(this.song?.duration ?? 0, this.offset + Math.max(0, this.context.currentTime - this.origin) * this.speed) : this.offset;
  }
  private get range() { return this.loop && this.loopRange && this.song && validLoop(this.loopRange, this.song.duration) ? this.loopRange : { start: 0, end: this.song?.duration ?? 0 }; }
  load(song: Song) { this.pause(); this.song = song; this.offset = 0; this.muted = new Set(); this.onUpdate(0, false); }
  /** Unlock on the click itself, before a preview's MIDI fetch awaits the network. */
  unlock() {
    if (this.destroyed) return Promise.reject(new Error('Player closed.'));
    this.context ??= new AudioContext();
    return this.context.resume();
  }
  async play(skipCountIn = false) {
    if (!this.song || this.playing || this.destroyed) return;
    const generation = ++this.generation, song = this.song;
    this.loading = true; this.onLoading(true);
    try {
      const bounds = transposeBounds(song);
      if (!Number.isInteger(this.transpose) || this.transpose < bounds.min || this.transpose > bounds.max) throw new Error('That transposition exceeds this piece’s MIDI note range.');
      this.context ??= new AudioContext();
      if (!this.master) { this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination); }
      if (!this.clickGain) { this.clickGain = this.context.createGain(); this.clickGain.connect(this.context.destination); }
      // Resume within the user's gesture, before loading the audio engine.
      await this.context.resume();
      if (generation !== this.generation) return;
      if (this.offset >= this.range.end || (this.loop && this.offset < this.range.start)) this.offset = this.range.start;
      if (this.sound !== 'simple') {
        if (!this.sampledPromise) {
          this.compressor ??= this.context.createDynamicsCompressor();
          this.compressor.threshold.value = -8; this.compressor.knee.value = 12; this.compressor.ratio.value = 4;
          this.compressor.disconnect(); this.compressor.connect(this.master);
          this.sampledPromise = import('./sampled-audio').then(({ SampledAudio }) => SampledAudio.create(this.context!, this.compressor!))
            .then(engine => { if (this.destroyed) { engine.destroy(); throw new Error('Player closed.'); } this.sampled = engine; return engine; })
            .catch(error => { this.sampledPromise = undefined; throw error; });
        }
        const engine = await this.sampledPromise;
        if (generation !== this.generation) return;
        await engine.prepare(song, this.offset, new Set(this.muted), this.sound === 'piano', this.transpose, this.range.end);
        if (generation !== this.generation) return;
      }
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.value = song.tracks.every((_,i) => this.muted.has(i)) ? 0 : this.volume * (this.sound === 'simple' ? .22 : .8);
      this.clickGain.gain.value = this.volume * .35;
      this.origin = this.context.currentTime;
      this.started = false;
      this.beats = this.metronome ? metronomeBeats(song) : [];
      this.clickIndex = this.beats.findIndex(beat => beat.time >= this.offset - .00001);
      if (this.clickIndex < 0) this.clickIndex = this.beats.length;
      if (this.countIn && !skipCountIn) {
        const rhythm = rhythmAt(song, this.offset);
        this.countInterval = rhythm.secondsPerBeat / this.speed;
        for (let i = 0; i < rhythm.beatsPerBar; i++) this.click(this.origin + i * this.countInterval, i === 0);
        this.origin += rhythm.beatsPerBar * this.countInterval;
      }
      this.playing = true;
      this.tick(); this.timer = setInterval(() => this.tick(), 25);
    } catch (error) { if (generation === this.generation) { this.pause(); throw error; } }
    finally { if (generation === this.generation) { this.loading = false; this.onLoading(false); } }
  }
  pause() {
    this.generation++;
    this.offset = this.time; this.playing = false;
    this.started = false; this.countingIn = 0; this.onCountIn(0);
    this.loading = false; this.onLoading(false);
    clearInterval(this.timer);
    this.sampled?.pause();
    if (this.master) { this.master.gain.cancelScheduledValues(this.context!.currentTime); this.master.gain.value = 0; }
    this.voices.forEach(o => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); });
    this.voices.clear();
    this.clicks.forEach(o => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); }); this.clicks.clear();
    this.onUpdate(this.offset, false);
  }
  seek(time: number) { this.pause(); this.offset = Math.max(0, Math.min(time, this.song?.duration ?? 0)); this.onUpdate(this.offset, false); }
  setVolume(value: number) { this.volume = value; if (!this.playing) return; this.clickGain?.gain.setTargetAtTime(value * .35, this.context!.currentTime, .015); if (this.song?.tracks.every((_,i) => this.muted.has(i))) return; this.master?.gain.setTargetAtTime(value * (this.sound === 'simple' ? .22 : .8), this.context!.currentTime, .015); }
  destroy() { this.destroyed = true; this.pause(); this.sampled?.destroy(); void this.context?.close(); }
  private tick() {
    if (!this.playing || !this.song || !this.context) return;
    if (!this.started) {
      if (this.context.currentTime < this.origin) {
        const remaining = Math.ceil((this.origin - this.context.currentTime) / this.countInterval);
        if (remaining !== this.countingIn) { this.countingIn = remaining; this.onCountIn(remaining); }
        this.onUpdate(this.offset, true); return;
      }
      this.countingIn = 0; this.onCountIn(0); this.started = true; this.origin = this.context.currentTime;
      if (this.loop) this.master!.gain.setValueAtTime(0, this.origin + (this.range.end - this.offset) / this.speed);
      if (this.sound !== 'simple') this.sampled!.play(this.speed);
      else {
        this.index = this.song.notes.findIndex(n => n.time >= this.offset);
        if (this.index < 0) this.index = this.song.notes.length;
        for (const n of notesAt(this.song.notes, this.offset, this.muted)) if (n.time < this.offset) this.soundNote(n, this.origin, (Math.min(this.range.end, n.time + n.duration) - this.offset) / this.speed);
      }
    }
    const now = this.time;
    if (now >= this.range.end) {
      if (this.loop) { const start = this.range.start; this.pause(); this.offset = start; void this.play(true).catch(error => { this.pause(); this.onError(error instanceof Error ? error.message : 'Playback could not restart.'); }); }
      else {
        this.offset = this.song.duration; this.playing = false; clearInterval(this.timer);
        this.sampled?.finish(); this.onUpdate(this.offset, false);
      }
      return;
    }
    while (this.clickIndex < this.beats.length && this.beats[this.clickIndex].time < Math.min(this.range.end, now + .12 * this.speed)) {
      const beat = this.beats[this.clickIndex++];
      const when = this.origin + (beat.time - this.offset) / this.speed;
      if (when >= this.context.currentTime - .02) this.click(Math.max(when, this.context.currentTime), beat.accent);
    }
    if (this.sound !== 'simple') { this.onUpdate(now, true); return; }
    while (this.index < this.song.notes.length && this.song.notes[this.index].time < Math.min(this.range.end, now + .12 * this.speed)) {
      const n = this.song.notes[this.index++];
      const when = this.origin + (n.time - this.offset) / this.speed;
      const end = this.origin + (Math.min(this.range.end, n.time + n.duration) - this.offset) / this.speed;
      if (!this.muted.has(n.track) && end > this.context.currentTime) this.soundNote(n, Math.max(when, this.context.currentTime), end - Math.max(when, this.context.currentTime));
    }
    this.onUpdate(now, true);
  }
  private click(when: number, accent: boolean) {
    if (!this.context || !this.clickGain) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(accent ? 1500 : 1000, when);
    gain.gain.setValueAtTime(.65, when); gain.gain.exponentialRampToValueAtTime(.001, when + .035);
    osc.connect(gain); gain.connect(this.clickGain); this.clicks.add(osc);
    osc.onended = () => { this.clicks.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(when); osc.stop(when + .04);
  }
  private soundNote(note: Note, when: number, duration: number) {
    if (!this.context || !this.master || this.voices.size >= 256) return;
    const drum = this.song?.tracks[note.track].percussion;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440 * 2 ** ((note.midi + (drum ? 0 : this.transpose) - 69) / 12), when);
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
