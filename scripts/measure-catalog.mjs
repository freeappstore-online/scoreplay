// Validate staged MIDI using the exact player parser and record measured timing.
// Usage: node scripts/measure-catalog.mjs /tmp/review/catalog.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const root = new URL('../',import.meta.url), require = createRequire(new URL('web/package.json',root));
const ts = require('typescript'), exports = {};
new Function('exports','require',ts.transpileModule(readFileSync(new URL('web/src/music.ts',root),'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText)(exports,require);
const path = process.argv[2];
if (!path) throw new Error('Pass the staged catalog JSON path.');
const catalog = JSON.parse(readFileSync(path,'utf8')), cache = new Map(), failures = [];
for (const [index,piece] of catalog.entries()) {
  if (!piece.assets.midi || piece.playbackUnavailable) continue;
  try {
    let timing = cache.get(piece.assets.midi);
    if (!timing) {
      const bytes = readFileSync(new URL(`web/public${piece.assets.midi}`,root));
      const song = exports.parseMidi(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),piece.title);
      timing = { duration:Math.round(song.duration*100)/100,bpm:Math.round(song.bpm*100)/100 }; cache.set(piece.assets.midi,timing);
    }
    Object.assign(piece,timing);
  } catch (error) { failures.push({ id:piece.id,error:error.message }); }
  if (index % 500 === 0) console.log(`Measured ${index+1}/${catalog.length}`);
}
if (failures.length) throw new Error(JSON.stringify(failures,null,2));
writeFileSync(path,JSON.stringify(catalog,null,2)+'\n');
console.log(`Validated timing for ${catalog.length} entries.`);
