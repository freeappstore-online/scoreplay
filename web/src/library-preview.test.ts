import { expect, it, vi } from 'vitest';
import type { Player } from './audio';
import { demoBytes, parseMidi } from './music';
import { LibraryPreview, type PreviewSource } from './library-preview';
const song = (title: string) => ({ ...parseMidi(demoBytes(), title), title });
function setup() {
  const original = song('Original');
  const player = {
    song: original, time: 7, playing: false, loading: false, speed: .5, loop: true, muted: new Set([1]), volume: .3, sound: 'simple',
    onUpdate: vi.fn(), onLoading: vi.fn(),
    pause() { this.playing = false; this.onLoading(false); this.onUpdate(this.time, false); },
    load(value: typeof original) { this.pause(); this.song = value; this.time = 0; this.muted = new Set(); this.onUpdate(0, false); },
    seek(time: number) { this.pause(); this.time = time; this.onUpdate(time, false); },
    setVolume(value: number) { this.volume = value; },
    unlock: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(async function(this: { playing: boolean; onUpdate: (time: number, playing: boolean) => void; time: number }) { this.playing = true; this.onUpdate(this.time, true); }),
  };
  return { player, original, preview: new LibraryPreview(player as unknown as Player) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const source = (id: string): PreviewSource => ({ id, title: id, load: async () => song(id) });
it('ignores stale downloads, reuses one player, and restores the original document and practice settings', async () => {
  const { player, original, preview } = setup(), first = deferred<ReturnType<typeof song>>();
  const mainUpdate = player.onUpdate; let signal!: AbortSignal;
  const pending = preview.toggle({ id: 'First', title: 'First', load: async s => { signal = s; return first.promise; } });
  expect(player.unlock).toHaveBeenCalledOnce();
  await preview.toggle(source('Second')); first.resolve(song('First')); await pending;
  expect(signal.aborted).toBe(true); expect(player.song.title).toBe('Second'); expect(player.play).toHaveBeenCalledOnce();
  expect(player.speed).toBe(1); expect(player.loop).toBe(false); expect(player.muted.size).toBe(0);
  player.time = 3; player.onUpdate(3, true); expect(preview.getSnapshot().time).toBe(3);
  preview.stop();
  expect(player.song).toBe(original); expect(player.time).toBe(7); expect(player.speed).toBe(.5); expect(player.loop).toBe(true);
  expect(player.muted).toEqual(new Set([1])); expect(player.volume).toBe(.3); expect(player.sound).toBe('simple');
  expect(player.onUpdate).toBe(mainUpdate); expect(player.playing).toBe(false); expect(preview.getSnapshot().phase).toBe('idle');
});
it('cancels a pending preview on navigation and cannot start it later', async () => {
  const { player, original, preview } = setup(), loading = deferred<ReturnType<typeof song>>();
  const pending = preview.toggle({ id: 'Slow', title: 'Slow', load: () => loading.promise });
  preview.stop(); loading.resolve(song('Slow')); await pending;
  expect(player.song).toBe(original); expect(player.play).not.toHaveBeenCalled(); expect(preview.getSnapshot().phase).toBe('idle');
});
it('pauses and resumes without downloading again, and retries after a download failure', async () => {
  const { player, preview } = setup();
  const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(song('Retry'));
  const item = { id: 'Retry', title: 'Retry', load };
  await preview.toggle(item); expect(preview.getSnapshot()).toMatchObject({ phase: 'error', error: 'Offline' });
  await preview.toggle(item); expect(preview.getSnapshot().phase).toBe('playing');
  await preview.toggle(item); expect(preview.getSnapshot().phase).toBe('paused'); expect(player.playing).toBe(false);
  await preview.toggle(item); expect(preview.getSnapshot().phase).toBe('playing'); expect(load).toHaveBeenCalledTimes(2);
  preview.stop();
});
it('recovers from an audio failure without leaving a preview playing', async () => {
  const { player, preview } = setup(); player.play.mockRejectedValueOnce(new Error('Audio unavailable'));
  await preview.toggle(source('Piece')); expect(preview.getSnapshot()).toMatchObject({ phase: 'error', error: 'Audio unavailable' });
  expect(player.playing).toBe(false); await preview.toggle(source('Piece')); expect(preview.getSnapshot().phase).toBe('playing'); preview.stop();
});
