// Requires ffmpeg with libvorbis. Pins and verifies the freely redistributable source.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { SoundBankLoader } from '../web/node_modules/spessasynth_core/dist/index.js';
const ffmpeg = process.env.SCOREPLAY_FFMPEG || 'ffmpeg';
const encoders = spawnSync(ffmpeg, ['-hide_banner','-encoders'], { encoding:'utf8' });
if (!encoders.stdout?.includes('libvorbis')) throw new Error('Set SCOREPLAY_FFMPEG to an ffmpeg build with libvorbis.');
const revision = '684543d5e5efaef08d02be50dcda8d552478fa60';
const sourceUrl = `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${revision}/GeneralUser-GS.sf2`;
const bytes = process.argv[2] ? await readFile(process.argv[2]) : Buffer.from(await (await fetch(sourceUrl)).arrayBuffer());
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
if (sourceSha256 !== '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe') throw new Error('Unexpected sound bank source.');
const bank = SoundBankLoader.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength));
let count = 0;
await bank.setSampleFormat({ format: 'compressed', compressionFunction: async (pcm, rate) => {
  const result = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-f','f32le','-ar',String(rate),'-ac','1','-i','pipe:0','-c:a','libvorbis','-q:a','5','-f','ogg','pipe:1'], { input:Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength), maxBuffer: 16*1024*1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  if (++count % 100 === 0) console.log(`Encoded ${count} instrument samples`);
  return new Uint8Array(result.stdout);
} });
if (count !== bank.samples.length) throw new Error('Not every instrument sample was encoded.');
const output = Buffer.from(bank.writeSF2());
if (output.length > 20 * 1024 * 1024) throw new Error('Compressed sound bank exceeded the download budget.');
const meta = { name:'GeneralUser GS', version:'2.0.3', author:'S. Christian Collins', source:'https://github.com/mrbumpy409/GeneralUser-GS', revision, sourceUrl, url:'/sounds/generaluser-gs-2.0.3-'+createHash('sha256').update(output).digest('hex').slice(0,12)+'.sf3', bytes:output.length, sha256:createHash('sha256').update(output).digest('hex'), sourceSha256, license:'/sounds/GeneralUser-LICENSE.txt', modification:'Converted from SF2 to SF3 using Ogg Vorbis quality 5; instrument mappings, envelopes and sample loops preserved.', presets:bank.presets.length, samples:bank.samples.length };
await writeFile(new URL('../web/public'+meta.url,import.meta.url),output);
await writeFile(new URL('../web/src/sound-bank.json',import.meta.url),JSON.stringify(meta,null,2)+'\n');
console.log(meta);
