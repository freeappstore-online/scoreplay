import type { LibraryEntry } from './library';
export type Saved = { bytes: ArrayBuffer; name: string; musicxml?: string; pdf?: ArrayBuffer };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scoreplay', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
      if (!request.result.objectStoreNames.contains('library')) request.result.createObjectStore('library', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savedFile(value?: Saved | null): Promise<Saved | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', value === undefined ? 'readonly' : 'readwrite');
    const store = tx.objectStore('files');
    const request = value === undefined ? store.get('last') : value === null ? store.delete('last') : store.put(value, 'last');
    tx.oncomplete = () => { db.close(); resolve(value === undefined ? request.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function libraryEntries(): Promise<LibraryEntry[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('library', 'readonly'); const request = tx.objectStore('library').getAll();
    tx.oncomplete = () => { db.close(); resolve(request.result.sort((a: LibraryEntry, b: LibraryEntry) => a.title.localeCompare(b.title))); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function writeLibrary(entries: LibraryEntry[], removeId?: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('library', 'readwrite'); const store = tx.objectStore('library');
    entries.forEach(entry => store.put(entry)); if (removeId) store.delete(removeId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
