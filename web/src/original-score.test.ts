// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMidi } from './music';
import { readMusicXml } from './original-score';
it('keeps Aiken Drum’s pickup, page boundaries and all 131 MIDI notes aligned with the original score', () => {
  const text=readFileSync(resolve('public/music/nursery-aikendrum/score.musicxml'),'utf8');
  const midi=readFileSync(resolve('public/music/nursery-aikendrum/score.mid'));
  const song=parseMidi(Uint8Array.from(midi).buffer,'Aiken Drum.mid');
  const score=readMusicXml(text);
  expect(score.measures).toHaveLength(17);
  expect(score.measures[0]).toMatchObject({start:0,end:.5});
  expect(score.measures[4].start).toBe(6.5);
  expect(score.measures[16].start).toBe(30.5);
  const doc=new DOMParser().parseFromString(score.xml,'application/xml');
  const notes: number[][]=[];let divisions=1;
  [...doc.querySelectorAll('part > measure')].forEach((measure,i)=>{
    divisions=Number(measure.querySelector('attributes > divisions')?.textContent)||divisions;
    let cursor=0,previous=0;
    for(const element of measure.children){
      const duration=Number(element.querySelector('duration')?.textContent)/divisions;
      if(element.tagName==='backup')cursor-=duration;
      else if(element.tagName==='forward')cursor+=duration;
      else if(element.tagName==='note'){
        const start=element.querySelector('chord')?previous:cursor;
        const pitch=element.querySelector('pitch');
        if(pitch){const step=pitch.querySelector('step')!.textContent!;notes.push([12*(Number(pitch.querySelector('octave')!.textContent)+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step as 'C'])+Number(pitch.querySelector('alter')?.textContent||0),score.measures[i].start+start,duration]);}
        if(!element.querySelector('chord')){previous=start;cursor+=duration;}
      }
    }
  });
  const sort=(a:number[],b:number[])=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2];
  expect(notes).toHaveLength(131);
  expect(notes.sort(sort)).toEqual(song.notes.map(n=>[n.midi,n.beat,n.beats]).sort(sort));
});
