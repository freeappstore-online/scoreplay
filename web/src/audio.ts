import { notesAt, type Note, type Song } from './music';

export class Player {
  private context?: AudioContext;
  private master?: GainNode;
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
    if (!this.song || this.playing) return;
    const generation = ++this.generation;
    this.context ??= new AudioContext();
    if (!this.master) { this.master = this.context.createGain(); this.master.connect(this.context.destination); }
    await this.context.resume();
    if (generation !== this.generation) return;
    if (this.offset >= this.song.duration) this.offset = 0;
    this.master.gain.value = this.volume * .22;
    this.origin = this.context.currentTime;
    this.index = this.song.notes.findIndex(n => n.time >= this.offset);
    if (this.index < 0) this.index = this.song.notes.length;
    this.playing = true;
    for (const n of notesAt(this.song.notes, this.offset, this.muted)) {
      if (n.time < this.offset) this.sound(n, this.origin, (n.time + n.duration - this.offset) / this.speed);
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }
  pause() {
    this.generation++;
    this.offset = this.time; this.playing = false;
    clearInterval(this.timer);
    this.voices.forEach(o => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); });
    this.voices.clear();
    this.onUpdate(this.offset, false);
  }
  seek(time: number) { this.pause(); this.offset = Math.max(0, Math.min(time, this.song?.duration ?? 0)); this.onUpdate(this.offset, false); }
  setVolume(value: number) { this.volume = value; this.master?.gain.setTargetAtTime(value * .22, this.context!.currentTime, .015); }
  destroy() { this.pause(); void this.context?.close(); }
  private tick() {
    if (!this.playing || !this.song || !this.context) return;
    const now = this.time;
    if (now >= this.song.duration) {
      this.pause();
      if (this.loop) { this.offset = 0; void this.play(); }
      return;
    }
    while (this.index < this.song.notes.length && this.song.notes[this.index].time < now + .12 * this.speed) {
      const n = this.song.notes[this.index++];
      const when = this.origin + (n.time - this.offset) / this.speed;
      const end = when + n.duration / this.speed;
      if (!this.muted.has(n.track) && end > this.context.currentTime) this.sound(n, Math.max(when, this.context.currentTime), end - Math.max(when, this.context.currentTime));
    }
    this.onUpdate(now, true);
  }
  private sound(note: Note, when: number, duration: number) {
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
