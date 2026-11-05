// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { demoBytes } from './music';
import { prepareLibrary } from './library';
import { readMusicXml } from './original-score';
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="0"><attributes><divisions>4</divisions><key><fifths>-2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type><lyric><text>Example</text></lyric></note></measure><measure number="1"><note><rest/><duration>12</duration><type>half</type><dot/></note></measure></part></score-partwise>`;
it('pairs MIDI, MusicXML and PDF by filename regardless of input order', async () => {
  const entries = await prepareLibrary([
    new File([xml], 'Belle-melody.musicxml'), new File(['%PDF-1.4\n'], 'Belle-melody.pdf'), new File([demoBytes()], 'Belle-melody.mid'),
  ], []);
  expect(entries).toHaveLength(1); expect(entries[0].id).toBe('belle-melody');
  expect(entries[0].musicxml).toContain('<fifths>-2</fifths>'); expect(entries[0].pdf).toBeInstanceOf(ArrayBuffer);
  const update = await prepareLibrary([new File([xml], 'Belle-melody.musicxml')], entries);
  expect(update[0].bytes).toEqual(entries[0].bytes); expect(update[0].pdf).toEqual(entries[0].pdf);
});
it('refuses orphan scores, malformed XML, fake PDFs and invalid MIDI before saving', async () => {
  await expect(prepareLibrary([new File([xml], 'alone.musicxml')], [])).rejects.toThrow('matching MIDI');
  await expect(prepareLibrary([new File(['<bad>'], 'bad.musicxml')], [])).rejects.toThrow('MusicXML');
  await expect(prepareLibrary([new File(['not PDF'], 'bad.pdf')], [])).rejects.toThrow('valid PDF');
  await expect(prepareLibrary([new File(['not MIDI'], 'bad.mid')], [])).rejects.toThrow('MIDI');
});
it('preserves original notation and pickup timing, and strips external images', () => {
  const parsed = readMusicXml(xml.replace('<part-list>', '<credit><credit-image source="https://example.org/image.png"/></credit><part-list>'));
  expect(parsed.xml).toContain('<lyric>'); expect(parsed.xml).toContain('<alter>-1</alter>');
  expect(parsed.xml).not.toContain('example.org');
  expect(parsed.measures.map(m => [m.label, m.start, m.end])).toEqual([['0',0,1],['1',1,4]]);
  expect(() => readMusicXml('<!DOCTYPE score-partwise [<!ENTITY a "test">]>' + xml)).toThrow('entity');
});

it('keeps a saved arrangement title and date when attaching a score', async () => {
  const [entry] = await prepareLibrary([new File([demoBytes()], 'piece.mid')], []);
  entry.title = 'My piano lesson'; entry.added = 123;
  const [updated] = await prepareLibrary([new File([xml], 'piece.musicxml')], [entry]);
  expect(updated.title).toBe('My piano lesson');
  expect(updated.added).toBe(123);
  expect(entry.musicxml).toBeUndefined();
});
