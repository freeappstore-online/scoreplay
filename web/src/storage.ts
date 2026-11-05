type Saved = { bytes: ArrayBuffer; name: string };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scoreplay', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
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
