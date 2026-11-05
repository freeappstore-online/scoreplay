import { useEffect, useRef, useState } from 'react';
import type { Player } from './audio';
import { demoBytes, MAX_FILE_SIZE, parseMidi, type Song } from './music';
import { libraryId, LibraryFullError, type LibraryEntry } from './library';
import { libraryEntries, savedFile, writeLibrary, type Saved } from './storage';
import { pwa } from './fas-capabilities/pwa';

/** Owns the selected document and serializes persistence, so old reads cannot replace a newer selection. */
export function useMusicFile(player: Player) {
  const [song, setSong] = useState<Song | null>(null);
  const [musicxml, setMusicxml] = useState<string>(), [pdf, setPdf] = useState<ArrayBuffer>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const generation = useRef(0), busyRef = useRef(true), writes = useRef(Promise.resolve()), pendingWrites = useRef(0);
  const setLoading = (value: boolean) => { busyRef.current = value; setBusy(value); };
  const apply = (file: Saved, parsed = parseMidi(file.bytes, file.name)) => {
    if (file.displayTitle) parsed.title = file.displayTitle;
    player.load(parsed); setSong(parsed); setMusicxml(file.musicxml); setPdf(file.pdf);
    setRevision(value => value + 1); setError('');
  };
  const persist = (id: number, operation: () => Promise<unknown>) => {
    pendingWrites.current++;
    const next = writes.current.then(async () => { if (id === generation.current) await operation(); }).finally(() => { pendingWrites.current--; });
    writes.current = next.catch(() => {});
    return next;
  };
  useEffect(() => {
    const id = ++generation.current;
    const release = pwa.addBusyGuard(() => busyRef.current || pendingWrites.current > 0);
    void savedFile().then(saved => {
      if (id !== generation.current) return;
      apply(saved ?? { bytes: demoBytes(), name: 'Ode to Joy.mid' });
      setNotice(saved ? 'Restored your last MIDI file from this device.' : 'Demo ready · Beethoven’s Ode to Joy');
    }).catch(() => {
      if (id !== generation.current) return;
      apply({ bytes: demoBytes(), name: 'Ode to Joy.mid' });
      setNotice('Demo ready. The last-opened file could not be restored.');
    }).finally(() => { if (id === generation.current) setLoading(false); });
    return () => { generation.current++; release(); };
  }, [player]);
  const open = async (file?: File) => {
    if (!file || busyRef.current) return;
    const id = ++generation.current;
    setLoading(true); setError(''); setNotice('');
    try {
      if (file.size > MAX_FILE_SIZE) throw new Error('Please choose a MIDI file smaller than 5 MB.');
      const bytes = await file.arrayBuffer();
      if (id !== generation.current) return;
      const parsed = parseMidi(bytes, file.name);
      let existing: LibraryEntry | undefined;
      try { existing = (await libraryEntries()).find(entry => entry.id === libraryId(file.name)); } catch { /* Still open without storage. */ }
      if (id !== generation.current) return;
      const entry: LibraryEntry = { ...existing, id: libraryId(file.name), bytes, name: file.name, title: existing?.title ?? file.name.replace(/\.midi?$/i, '').replace(/[-_]/g, ' '), added: existing?.added ?? Date.now() };
      apply(entry, parsed);
      try {
        await persist(id, () => writeLibrary([entry], entry));
        if (id === generation.current) setNotice('Saved on this device and added to your library. Your MIDI file is never uploaded.');
      } catch (error) {
        if (id === generation.current) setNotice(`File opened. ${error instanceof LibraryFullError ? error.message : 'This browser could not save it for next time.'}`);
      }
    } catch (error) { if (id === generation.current) setError(error instanceof Error ? error.message : 'Could not open this file.'); }
    finally { if (id === generation.current) setLoading(false); }
  };
  const demo = () => {
    generation.current++; setLoading(false);
    apply({ bytes: demoBytes(), name: 'Ode to Joy.mid' });
    setNotice('Demo ready · Beethoven’s Ode to Joy');
  };
  const forget = async () => {
    const id = ++generation.current; setLoading(true); setError('');
    try {
      await persist(id, () => savedFile(null));
      if (id !== generation.current) return;
      apply({ bytes: demoBytes(), name: 'Ode to Joy.mid' });
      setNotice('Last-opened file cleared. Manage saved arrangements in Library.');
    } catch { if (id === generation.current) setError('Could not remove the saved file. Please try again.'); }
    finally { if (id === generation.current) setLoading(false); }
  };
  const openEntry = (entry: LibraryEntry) => {
    const parsed = parseMidi(entry.bytes, entry.name);
    const id = ++generation.current; setLoading(false); apply(entry, parsed); setNotice('Music and score ready.');
    return persist(id, () => savedFile(entry)).then(() => {
      if (id === generation.current) setNotice('Music and score ready. Saved as your last-opened piece on this device.');
    }).catch(() => { if (id === generation.current) setNotice('Opened. Could not save the last-opened selection.'); });
  };
  return { song, musicxml, pdf, revision, busy, error, notice, setError, open, demo, forget, openEntry };
}
