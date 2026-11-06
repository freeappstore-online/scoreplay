// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMusicFile } from './useMusicFile';
import { demoBytes } from './music';
import type { Player } from './audio';
import type { LibraryEntry } from './library';
import { libraryEntry, savedFile, writeLibrary } from './storage';
vi.mock('./storage', () => ({ libraryEntry: vi.fn(), savedFile: vi.fn(), writeLibrary: vi.fn() }));
vi.mock('./fas-capabilities/pwa', () => ({ pwa: { addBusyGuard: () => () => {} } }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const entry = (name: string): LibraryEntry => ({ id: name, name: `${name}.mid`, title: name, displayTitle: name, bytes: demoBytes(), added: 1 });
let root: Root, state: ReturnType<typeof useMusicFile>, player: Player;
function Probe() { state = useMusicFile(player); return null; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(libraryEntry).mockResolvedValue(undefined); vi.mocked(savedFile).mockResolvedValue(undefined); vi.mocked(writeLibrary).mockResolvedValue(undefined);
  player = { load: vi.fn() } as unknown as Player;
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('ignores a slow file read after a newer library selection', async () => {
  await act(async () => root.render(<Probe />));
  const read = deferred<ArrayBuffer>(), file = new File([], 'old.mid');
  Object.defineProperty(file, 'arrayBuffer', { value: () => read.promise });
  let pending!: Promise<void>;
  await act(async () => { pending = state.open(file); });
  await act(async () => { await state.openEntry(entry('New piece')); });
  await act(async () => { read.resolve(demoBytes()); await pending; });
  expect(state.song?.title).toBe('New piece'); expect(state.busy).toBe(false);
  expect(writeLibrary).not.toHaveBeenCalled();
  expect(vi.mocked(savedFile).mock.lastCall?.[0]).toMatchObject({ displayTitle: 'New piece' });
});
it('ignores a slow startup restore after the user chooses another piece', async () => {
  const restore = deferred<LibraryEntry | undefined>();
  vi.mocked(savedFile).mockImplementation(value => value === undefined ? restore.promise : Promise.resolve(undefined));
  await act(async () => root.render(<Probe />));
  await act(async () => { await state.openEntry(entry('Chosen piece')); });
  await act(async () => { restore.resolve(entry('Old selection')); });
  expect(state.song?.title).toBe('Chosen piece'); expect(state.busy).toBe(false);
});
it('orders last-opened writes even when an earlier save finishes late', async () => {
  await act(async () => root.render(<Probe />));
  const first = deferred<undefined>();
  vi.mocked(savedFile).mockImplementation(value => value?.name === 'First.mid' ? first.promise : Promise.resolve(undefined));
  let a!: Promise<void>, b!: Promise<void>;
  await act(async () => { a = state.openEntry(entry('First')); });
  await act(async () => { b = state.openEntry(entry('Second')); });
  expect(state.song?.title).toBe('Second');
  expect(vi.mocked(savedFile).mock.lastCall?.[0]).toMatchObject({ name: 'First.mid' });
  await act(async () => { first.resolve(undefined); await Promise.all([a, b]); });
  expect(vi.mocked(savedFile).mock.lastCall?.[0]).toMatchObject({ name: 'Second.mid' });
  expect(state.song?.title).toBe('Second');
});
