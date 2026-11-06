// Keep source verification hashes and upstream URLs out of the browser bundle.
// Repeated edition credits are stored once while movements remain independently searchable.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { catalogKind } from './catalog-kind.mjs';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('web/src/catalog-data.json', root), 'utf8'));
const sharedKeys = ['composer','category','difficulty','instruments','tags','source','sourceUrl','rights','rightsUrl','edition','creditsUrl'];
const editions = [], seen = new Map();
const pieces = catalog.map(piece => {
  const shared = Object.fromEntries(sharedKeys.filter(key => piece[key] !== undefined).map(key => [key,piece[key]]));
  const key = JSON.stringify(shared);
  if (!seen.has(key)) { seen.set(key, editions.length); editions.push(shared); }
  return { editionIndex: seen.get(key), kind: catalogKind(piece), ...Object.fromEntries(['id','title','description','assets','duration','bpm','playbackUnavailable'].filter(key => piece[key] !== undefined).map(key => [key,piece[key]])) };
});
const path = new URL('web/src/catalog-runtime.json', root), content = JSON.stringify({ editions, pieces }) + '\n';
if (await readFile(path, 'utf8').catch(() => '') !== content) {
  const temporary = new URL(`web/src/catalog-runtime.json.${process.pid}.tmp`, root);
  await writeFile(temporary, content); await rename(temporary, path);
}
console.log(`Prepared ${pieces.length} entries with ${editions.length} shared credit records.`);
