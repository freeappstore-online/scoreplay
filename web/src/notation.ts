import type { Song } from './music';

// MusicXML divisions per quarter; both sixteenths and triplet eighths are integral.
export const DIVISIONS = 24;
export const PAGE_MEASURES = 4;
export type Measure = { start: number; end: number; numerator: number; denominator: number; number: number };
type WrittenNote = { pitch: number; start: number; end: number };
export function measuresFor(song: Song, quantum = 6): Measure[] {
  const end = song.notes.reduce((v, n) => Math.max(v, Math.round(n.beat * DIVISIONS / quantum) * quantum + quantum, Math.round((n.beat + n.beats) * DIVISIONS / quantum) * quantum), 1);
  const meters = song.meters.filter(m => m.numerator > 0 && m.numerator <= 32 && [1,2,4,8,16,32].includes(m.denominator));
  const measures: Measure[] = [];
  let start = 0, index = 0;
  while (start < end && measures.length < 20000) {
    while (index + 1 < meters.length && Math.round(meters[index + 1].beat * DIVISIONS) <= start) index++;
    const meter = meters[index] ?? { numerator: 4, denominator: 4 };
    const nextChange = meters[index + 1] ? Math.round(meters[index + 1].beat * DIVISIONS) : Infinity;
    const barEnd = Math.min(start + meter.numerator * 4 / meter.denominator * DIVISIONS, nextChange);
    measures.push({ start, end: barEnd, numerator: meter.numerator, denominator: meter.denominator, number: measures.length + 1 });
    start = barEnd;
  }
  return measures;
}
const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]!);
const lengths: [number, string, boolean, boolean][] = [
  [144,'whole',true,false],[96,'whole',false,false],[72,'half',true,false],[48,'half',false,false],
  [36,'quarter',true,false],[24,'quarter',false,false],[18,'eighth',true,false],[16,'quarter',false,true],
  [12,'eighth',false,false],[9,'16th',true,false],[8,'eighth',false,true],[6,'16th',false,false],
  [4,'16th',false,true],[3,'32nd',false,false],[2,'32nd',false,true],[1,'64th',false,true],
];
function pitchXml(midi: number) {
  const steps = ['C','C','D','D','E','F','F','G','G','A','A','B'];
  const alter = [1,3,6,8,10].includes(midi % 12) ? '<alter>1</alter>' : '';
  return `<pitch><step>${steps[midi % 12]}</step>${alter}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
}
// Split a polyphonic stream at each note boundary, using tied chords to retain
// independent note lengths without inventing voice assignments absent from MIDI.
function staffXml(notes: WrittenNote[], measure: Measure, staff: number) {
  const local = notes.filter(n => n.start < measure.end && n.end > measure.start);
  const boundaries = [...new Set([measure.start, measure.end, ...local.flatMap(n => [Math.max(n.start, measure.start), Math.min(n.end, measure.end)])])].sort((a,b) => a-b);
  let result = '';
  for (let i = 0; i < boundaries.length - 1; i++) {
    let pos = boundaries[i]; const end = boundaries[i + 1];
    const active = local.filter(n => n.start <= pos && n.end > pos).filter((n, index, all) => all.findIndex(o => o.pitch === n.pitch) === index).sort((a,b) => a.pitch-b.pitch);
    while (pos < end) {
      const [duration, type, dot, triplet] = lengths.find(l => l[0] <= end - pos)!;
      const rhythm = `<duration>${duration}</duration><voice>${staff}</voice><type>${type}</type>${dot ? '<dot/>' : ''}${triplet ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : ''}<staff>${staff}</staff>`;
      if (!active.length) result += `<note><rest/>${rhythm}</note>`;
      active.forEach((note, chord) => {
        const stop = note.start < pos, start = note.end > pos + duration;
        const ties = `${stop ? '<tie type="stop"/>' : ''}${start ? '<tie type="start"/>' : ''}`;
        // MusicXML tie belongs before voice/type; the notations counterpart is last.
        const tiedRhythm = rhythm.replace('</duration>', `</duration>${ties}`);
        result += `<note>${chord ? '<chord/>' : ''}${pitchXml(note.pitch)}${tiedRhythm}${start || stop ? `<notations>${stop ? '<tied type="stop"/>' : ''}${start ? '<tied type="start"/>' : ''}</notations>` : ''}</note>`;
      });
      pos += duration;
    }
  }
  return result;
}

export function scoreXml(song: Song, measures: Measure[], page: number, track: number, quantum = 6) {
  const selected = song.notes.filter(n => (track < 0 ? !song.tracks[n.track].percussion : n.track === track));
  const written = selected.map(n => { const start = Math.round(n.beat * DIVISIONS / quantum) * quantum; return { pitch: n.midi, start, end: Math.max(start + quantum, Math.round((n.beat + n.beats) * DIVISIONS / quantum) * quantum) }; });
  const bass = written.some(n => n.pitch < 60), treble = written.some(n => n.pitch >= 60);
  const grand = bass && treble;
  const pageMeasures = measures.slice(page * PAGE_MEASURES, (page + 1) * PAGE_MEASURES);
  const bars = pageMeasures.map((m, index) => {
    const attributes = `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key><time><beats>${m.numerator}</beats><beat-type>${m.denominator}</beat-type></time>${grand ? '<staves>2</staves>' : ''}${grand || !bass ? '<clef number="1"><sign>G</sign><line>2</line></clef>' : '<clef number="1"><sign>F</sign><line>4</line></clef>'}${grand ? '<clef number="2"><sign>F</sign><line>4</line></clef>' : ''}</attributes>`;
    const previous = pageMeasures[index - 1];
    const changed = !previous || previous.numerator !== m.numerator || previous.denominator !== m.denominator;
    return `<measure number="${m.number}">${changed ? attributes : ''}${staffXml(grand ? written.filter(n => n.pitch >= 60) : written, m, 1)}${grand ? `<backup><duration>${m.end - m.start}</duration></backup>${staffXml(written.filter(n => n.pitch < 60), m, 2)}` : ''}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(song.title)}</work-title></work><part-list><score-part id="P1"><part-name>${escape(track < 0 ? 'Combined score' : song.tracks[track].name)}</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`;
}
