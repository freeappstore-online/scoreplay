// Re-fetch reviewed editions. Hash mismatches require an explicit source review.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('web/src/catalog-data.json', root), 'utf8'));
const ids = process.argv.slice(2);
for (const id of ids) if (!catalog.some(piece => piece.id === id)) throw new Error(`Unknown piece: ${id}`);
// Reuse archives shared by multiple movements; Python's standard ZIP reader only
// reads the named member into memory, never extracts archive paths to disk.
const archives = new Map();
for (const piece of catalog.filter(piece => !ids.length || ids.includes(piece.id))) {
  for (const [kind, url] of Object.entries(piece.urls)) {
    const member = piece.archiveMembers?.[kind];
    let source = archives.get(url);
    if (!source) {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      source = Buffer.from(await response.arrayBuffer());
      if (member) archives.set(url, source);
    }
    const bytes = member ? execFileSync('python3', ['-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); i=z.getinfo(sys.argv[1]); assert i.file_size <= 25*1024*1024; sys.stdout.buffer.write(z.read(i))', member], { input: source, maxBuffer: 25 * 1024 * 1024 }) : source;
    if (createHash('sha256').update(bytes).digest('hex') !== piece.sha256[kind]) throw new Error(`Source changed: ${piece.id}/${kind}. Review the edition and rights before updating.`);
    const path = new URL(`web/public${piece.assets[kind]}`, root);
    await mkdir(new URL('./', path), { recursive: true });
    await writeFile(path, bytes);
  }
  console.log(`Verified ${piece.title}`);
}
