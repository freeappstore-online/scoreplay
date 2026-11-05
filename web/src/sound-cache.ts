import bank from './sound-bank.json';
export const SOUND_CACHE = 'scoreplay-instruments-v1';
export const SOUND_BANK = bank;
export type SoundStatus = { message: string; progress?: number; cached?: boolean };
async function valid(bytes: ArrayBuffer) {
  if (bytes.byteLength !== bank.bytes) return false;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') === bank.sha256;
}
export async function loadSoundBank(report: (status: SoundStatus) => void): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(SOUND_CACHE);
    const stored = await cache.match(bank.url);
    if (stored) {
      const bytes = await stored.arrayBuffer();
      if (await valid(bytes)) { report({ message: 'Instrument sounds loaded from this device.', cached: true }); return bytes; }
      await cache.delete(bank.url);
    }
  } catch { /* Playback still works when browser storage is unavailable. */ }
  report({ message: 'Downloading instrument sounds…', progress: 0 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(bank.url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error('download');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let received = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      received += value.byteLength;
      if (received > bank.bytes) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value); report({ message: 'Downloading instrument sounds…', progress: Math.min(99, Math.round(received / bank.bytes * 100)) });
    }
    const joined = new Uint8Array(received); let at = 0;
    for (const chunk of chunks) { joined.set(chunk, at); at += chunk.length; }
    bytes = joined.buffer;
    if (!await valid(bytes)) throw new Error('integrity');
  } catch { throw new Error('Instrument sounds could not be downloaded. Check your connection and try Play again, or choose Simple tones.'); }
  finally { clearTimeout(timeout); }
  let cached = false;
  try { if (cache) { await cache.put(bank.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); cached = true; } } catch { /* Optional cache quota may be exhausted. */ }
  report({ message: cached ? 'Instrument sounds saved on this device.' : 'Instrument sounds ready. This browser could not save them for offline use.', cached });
  return bytes;
}
