import { LIBRARY_LIMIT, LibraryFullError, libraryId, type LibraryEntry } from './library';
export type Saved = { bytes: ArrayBuffer; name: string; displayTitle?: string; musicxml?: string; pdf?: ArrayBuffer; catalogId?: string };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scoreplay', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
      if (!request.result.objectStoreNames.contains('library')) request.result.createObjectStore('library', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}
// Resolve only after commit, and close the connection on every outcome.
async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, fail: (error: Error) => void) => () => T): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let failure: Error | null = null;
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('Local storage could not finish the operation.'));
      try {
        const result = work(tx, error => { failure = error; tx.abort(); });
        tx.oncomplete = () => { try { resolve(result()); } catch (error) { reject(error); } };
      } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export function savedFile(value?: Saved | null): Promise<Saved | undefined> {
  return transaction(['files'], value === undefined ? 'readonly' : 'readwrite', tx => {
    const store = tx.objectStore('files');
    const request = value === undefined ? store.get('last') : value === null ? store.delete('last') : store.put(value, 'last');
    return () => value === undefined ? request.result : undefined;
  });
}
export function libraryEntries(): Promise<LibraryEntry[]> {
  return transaction(['library'], 'readonly', tx => {
    const request = tx.objectStore('library').getAll();
    return () => (request.result as LibraryEntry[]).sort((a, b) => a.title.localeCompare(b.title));
  });
}
export function libraryEntry(id: string): Promise<LibraryEntry | undefined> {
  return transaction(['library'], 'readonly', tx => {
    const request = tx.objectStore('library').get(id);
    return () => request.result;
  });
}
export function writeLibrary(entries: LibraryEntry[], lastOpened?: Saved): Promise<void> {
  return transaction(lastOpened ? ['library', 'files'] : ['library'], 'readwrite', (tx, fail) => {
    const store = tx.objectStore('library');
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const combined = new Set([...keys.result, ...entries.map(entry => entry.id)]);
      // The limit and writes share one transaction, including concurrent tabs.
      if (combined.size > LIBRARY_LIMIT) { fail(new LibraryFullError()); return; }
      entries.forEach(entry => {
        if (!entry.catalogId) { store.put(entry); return; }
        const existing = store.get(entry.id);
        existing.onsuccess = () => {
          if (existing.result && existing.result.catalogId !== entry.catalogId) {
            fail(new Error('A personal arrangement already uses this filename. You can open this catalog edition without replacing your saved file.'));
          } else store.put(entry);
        };
      });
      if (lastOpened) tx.objectStore('files').put(lastOpened, 'last');
    };
    return () => undefined;
  });
}
export function removeLibraryEntry(id: string): Promise<void> {
  return transaction(['library', 'files'], 'readwrite', tx => {
    tx.objectStore('library').delete(id);
    const files = tx.objectStore('files'), last = files.get('last');
    last.onsuccess = () => { if (last.result && libraryId(last.result.name) === id) files.delete('last'); };
    return () => undefined;
  });
}
