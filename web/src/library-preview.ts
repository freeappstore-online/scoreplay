import type { Player } from './audio';
import type { Song } from './music';

export type PreviewSource = { id: string; title: string; load: (signal: AbortSignal) => Promise<Song> };
type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type PreviewState = { id: string; title: string; phase: Phase; time: number; duration: number; error: string };
const idle: PreviewState = { id: '', title: '', phase: 'idle', time: 0, duration: 0, error: '' };

/** Temporarily borrows the app's one audio engine without changing its document or saved selection. */
export class LibraryPreview {
  private state = idle;
  private listeners = new Set<() => void>();
  private generation = 0;
  private request?: AbortController;
  private source?: PreviewSource;
  private saved?: Pick<Player, 'song' | 'speed' | 'loop' | 'muted' | 'volume' | 'sound' | 'onUpdate' | 'onLoading'> & { time: number };
  constructor(private player: Player) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: PreviewState) { this.state = next; this.listeners.forEach(listener => listener()); }
  private onUpdate = (time: number, playing: boolean) => {
    if (!this.state.id) return;
    const duration = this.player.song?.duration ?? 0;
    const phase = playing ? 'playing' : time >= duration && duration > 0 ? 'ended' : 'paused';
    // Only the preview bar needs progress updates; the search results do not rerender every audio tick.
    if (phase !== this.state.phase || Math.abs(time - this.state.time) >= .25 || phase === 'ended') {
      this.publish({ ...this.state, time, duration, phase });
    }
  };
  private onLoading = (loading: boolean) => { if (loading) this.publish({ ...this.state, phase: 'loading' }); };
  private borrow() {
    if (this.saved) return;
    const p = this.player;
    this.saved = { song: p.song, time: p.time, speed: p.speed, loop: p.loop, muted: new Set(p.muted), volume: p.volume, sound: p.sound, onUpdate: p.onUpdate, onLoading: p.onLoading };
    p.pause(); p.onUpdate = this.onUpdate; p.onLoading = this.onLoading;
    p.speed = 1; p.loop = false; p.muted = new Set();
  }
  async toggle(source: PreviewSource) {
    if (this.state.id === source.id) {
      if (this.state.phase === 'loading') { this.stop(); return; }
      if (this.state.phase === 'playing') { this.player.pause(); return; }
      if (this.state.phase === 'paused' || this.state.phase === 'ended') {
        const id = ++this.generation;
        try { await this.player.play(); }
        catch (error) { if (id === this.generation) this.fail(error); }
        return;
      }
    }
    const id = ++this.generation;
    this.request?.abort(); this.borrow(); this.player.pause();
    const request = new AbortController(); this.request = request; this.source = source;
    this.publish({ ...idle, id: source.id, title: source.title, phase: 'loading' });
    try {
      // Start resume synchronously in the click handler (required by Safari).
      const unlocked = this.player.unlock();
      const [song] = await Promise.all([source.load(request.signal), unlocked]);
      if (id !== this.generation || request.signal.aborted) return;
      this.player.load(song);
      this.publish({ ...this.state, duration: song.duration, phase: 'loading' });
      await this.player.play();
    } catch (error) { if (id === this.generation && !request.signal.aborted) this.fail(error); }
  }
  private fail(error: unknown) {
    this.request?.abort(); this.player.pause();
    this.publish({ ...this.state, phase: 'error', error: error instanceof Error ? error.message : 'Could not preview this piece. Please try again.' });
  }
  toggleCurrent = () => { if (this.source) void this.toggle(this.source); };
  stop = () => {
    this.generation++; this.request?.abort(); this.request = undefined; this.source = undefined;
    const saved = this.saved; this.saved = undefined;
    if (saved) {
      this.player.pause();
      this.player.onUpdate = saved.onUpdate; this.player.onLoading = saved.onLoading;
      this.player.sound = saved.sound; this.player.speed = saved.speed; this.player.loop = saved.loop;
      this.player.setVolume(saved.volume);
      if (saved.song) this.player.load(saved.song); else this.player.song = null;
      this.player.seek(saved.time); this.player.muted = saved.muted;
    }
    this.publish(idle);
  };
}
