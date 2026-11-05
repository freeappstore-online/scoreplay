import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Player } from './audio';
import { demoBytes, parseMidi } from './music';
let clock = 0;
const starts: number[] = [];
let stopped = 0;
let failStart = false;
let resume = () => Promise.resolve();
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
class Context {
  get currentTime() { return clock; }
  destination = {};
  resume() { return resume(); }
  close() { return Promise.resolve(); }
  createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
  createOscillator() { return { frequency: param(), type: '', onended: null, connect() {}, disconnect() {}, start(t: number) { if (failStart) { failStart = false; throw new Error('Audio failed'); } starts.push(t); }, stop() { stopped++; } }; }
}
let player: Player;
beforeEach(() => { clock = 0; failStart = false; starts.length = 0; stopped = 0; resume = () => Promise.resolve(); vi.useFakeTimers(); vi.stubGlobal('AudioContext', Context); player = new Player(); player.sound = 'simple'; player.load(parseMidi(demoBytes(), 'demo.mid')); });
afterEach(() => { player.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('advances at selected speed, pauses, resumes held notes, and rewinds', async () => {
  player.speed = .5; await player.play();
  expect(starts.length).toBeGreaterThan(0);
  clock = 2; expect(player.time).toBeCloseTo(1);
  player.pause(); clock = 9; expect(player.time).toBeCloseTo(1);
  expect(stopped).toBeGreaterThan(0);
  await player.play(); clock = 11; expect(player.time).toBeCloseTo(2);
  player.seek(0); expect(player.time).toBe(0); expect(player.playing).toBe(false);
});
it('cancels pending audio start when paused or navigating away', async () => {
  let resolve!: () => void;
  resume = () => new Promise<void>(r => { resolve = r; });
  const pending = player.play(); player.pause(); resolve(); await pending;
  expect(player.playing).toBe(false); expect(starts).toHaveLength(0);
});
it('honours muting and repeats when looping', async () => {
  player.muted = new Set([0, 1]); player.loop = true; await player.play();
  expect(starts).toHaveLength(0);
  clock = player.song!.duration + 1; await vi.advanceTimersByTimeAsync(25);
  expect(player.playing).toBe(true); expect(player.time).toBeCloseTo(0);
});

it('cleans up a failed start and allows the next Play to retry', async () => {
  failStart = true;
  await expect(player.play()).rejects.toThrow('Audio failed');
  expect(player.playing).toBe(false);
  expect(player.loading).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  await player.play();
  expect(player.playing).toBe(true);
  expect(starts.length).toBeGreaterThan(0);
});
