#!/usr/bin/env python3
"""Import cached, reviewed Mutopia originals. Writes static assets and review JSON; does not replace the catalog.
See README.md for the fetch, review, measurement and validation steps.
"""
import json,pathlib,hashlib,zipfile,io,re,html,collections,argparse
from datetime import date
parser=argparse.ArgumentParser();parser.add_argument('--index',required=True);parser.add_argument('--cache',required=True);parser.add_argument('--output',required=True);parser.add_argument('--root',default=str(pathlib.Path(__file__).resolve().parents[1]));args=parser.parse_args();output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
root=pathlib.Path(args.root);cache=pathlib.Path(args.cache);index=json.load(open(args.index));catalogfile=root/'web/src/catalog-data.json';old=json.loads(catalogfile.read_text());oldids={p['id'] for p in old}
# Match original files, preserving existing public links, curated titles and saved arrangements.
legacy={(p['sourceUrl'],p.get('archiveMembers',{}).get('midi','')):p for p in old if p['source']=='Mutopia Project'}
silent={p['id']:p['sha256'] for p in json.loads((root/'scripts/mutopia-silent-files.json').read_text())}
records=[];provenance=[];problems=[];missing=[];composerfull={}
def fetch(url):return (cache/hashlib.sha256(url.encode()).hexdigest()).read_bytes()
def unpack(url,ext):
 b=fetch(url)
 if url.endswith('.zip'):
  z=zipfile.ZipFile(io.BytesIO(b));return {n:z.read(n) for n in z.namelist() if n.lower().endswith(ext) and not n.startswith('__MACOSX/')}
 return {url.split('/')[-1]:b}
def stem(name):return re.sub(r'(?:-a4|-let)?\.(?:pdf|midi?)$','',pathlib.PurePosixPath(name).name,flags=re.I)
def pair(mid,pdfs,pid):
 s=stem(mid).lower();parent=str(pathlib.PurePosixPath(mid).parent)
 scoped={n:b for n,b in pdfs.items() if str(pathlib.PurePosixPath(n).parent)==parent}
 if scoped:pdfs=scoped
 same=[n for n in pdfs if stem(n).lower()==s]
 if len(same)==1:return same[0]
 if len(pdfs)==1:return next(iter(pdfs))
 # LilyPond's successive unnamed MIDI blocks are -1, -2, ... within the same score.
 base=s
 while re.search(r'-\d+$',base):
  base=re.sub(r'-\d+$','',base);same=[n for n in pdfs if stem(n).lower()==base]
  if len(same)==1:return same[0]
 full=[n for n in pdfs if re.search(r'(?:^|[-_])(score|conductor|fullscore|full-score|partitur)(?:[-_]|$)',stem(n),re.I)]
 if len(full)==1:return full[0]
 manual={'mutopia-833':'Piano-a4.pdf','mutopia-757':'a4-PS-chopin-25-02-i-a4.pdf','mutopia-943':'Envoi_orgue01-a4.pdf','mutopia-902':'Piano-a4.pdf','mutopia-1574':'Piano-a4.pdf','mutopia-459':'combined-score-a4.pdf','mutopia-1734':'27-tmeiskin.mod-a4.pdf','mutopia-2089':'Romance-et-Rondo.pdf','mutopia-612':'MendelssohnOctet-a4.pdf','mutopia-423':'k401-four-hands1-a4.pdf','mutopia-852':'Partitura-a4.pdf','mutopia-1056':'Piano-a4.pdf','mutopia-1055':'Piano-a4.pdf','mutopia-1272':'piano-a4.pdf','mutopia-1575':'piano-a4.pdf'}
 if pid in manual and manual[pid] in pdfs:return manual[pid]
 if pid in ['mutopia-1644','mutopia-1635']:return 'Score-'+re.search(r'-(\d+)\.mid',mid)[1]+'-a4.pdf'
 if pid=='mutopia-2229':return mid.replace('-midi-','-movement-').replace('.mid','-a4.pdf')
 return None
seasons={'mutopia-301':('Spring','La Primavera',['Allegro','Largo e pianissimo sempre','Allegro']),'mutopia-336':('Summer','L’estate',['Allegro non molto','Adagio e piano – Presto e forte','Presto']),'mutopia-350':('Autumn','L’autunno',['Allegro','Adagio molto','Allegro']),'mutopia-351':('Winter','L’inverno',['Allegro non molto','Largo','Allegro'])}
for p in index:
 pid=p['id'];links=p['links'];sourceUrl=links['More Information'];urls={k:next((links[l] for l in labels if l in links),None) for k,labels in [('midi',['.mid file','.mid files (zipped)']),('pdf',['A4 .pdf file','A4 .pdf files (zipped)']),('source',['.ly file','.ly files (zipped)'])]}
 try:
  mids={} if pid in ['mutopia-1829','mutopia-1830','mutopia-2207','mutopia-2241'] and not (cache/hashlib.sha256(urls['midi'].encode()).hexdigest()).exists() else unpack(urls['midi'],('.mid','.midi'));pdfs=unpack(urls['pdf'],('.pdf',));src=fetch(urls['source'])
 except Exception as e:missing.append([pid,str(e)]);continue
 if not pdfs:problems.append([pid,'empty archive']);continue
 texts=list(unpack(urls['source'],('.ly','.ily','.lyi')).values()) if urls['source'].endswith('.zip') else [src]
 sourceText='\n'.join(b.decode('utf8',errors='replace') for b in texts)
 creditText='\n'.join(line.split('%',1)[0] for line in sourceText.splitlines())
 maintainers=sorted(set(re.findall(r'\b(?:mutopia)?maintainer\s*=\s*"([^"\n]+)"',creditText)))
 if not maintainers:maintainers=re.findall(r'\benteredby\s*=\s*"([^"\n]+)"',creditText)
 credit=', '.join(maintainers) or 'Mutopia contributors (credits retained in the original score)'
 compnames=re.findall(r'^\s*composer\s*=\s*"([^"\n]+)"',sourceText,re.M)
 if compnames:
  name=re.sub(r'\s*\([^)]*\)\s*','',compnames[0]).strip()
  if name and '\\' not in name and len(name)<100:composerfull.setdefault(p['composer'],name)
 if p['rights']=='Public Domain':rights='Public domain dedication';rightsUrl=p['rightsUrl']
 else:
  assert p['rights'].startswith('Creative Commons Attribution'),p['rights'];rights=p['rights'];version=rights.split()[-1];rightsUrl=f'https://creativecommons.org/licenses/{"by-sa" if "ShareAlike" in rights else "by"}/{version}/'
 folder=root/f'web/public/music/{pid}';folder.mkdir(parents=True,exist_ok=True);extras=[];files={}
 for kind,items in [('midi',mids),('pdf',pdfs)]:
  for name,b in items.items():
   assert b.startswith(b'MThd' if kind=='midi' else b'%PDF'),(pid,name)
   digest=hashlib.sha256(b).hexdigest();filename=digest[:20]+('.mid' if kind=='midi' else '.pdf');asset=f'/music/{pid}/{filename}';(folder/filename).write_bytes(b) if not (folder/filename).exists() else None
   record=dict(kind=kind,name=name,asset=asset,url=urls[kind],sha256=digest)
   if urls[kind].endswith('.zip'):record['archiveMember']=name
   extras.append(record);files[(kind,name)]=record
 sourcefile='source.zip' if urls['source'].endswith('.zip') else 'source.ly';(folder/sourcefile).write_bytes(src) if not (folder/sourcefile).exists() else None
 extras.append(dict(kind='source',name=sourcefile,asset=f'/music/{pid}/{sourcefile}',url=urls['source'],sha256=hashlib.sha256(src).hexdigest()))
 creditsUrl=f'/music/{pid}/credits.html'
 doc='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(p['title'])+' — files and credits</title><style>html{color-scheme:light dark}body{font:18px/1.6 system-ui;max-width:70ch;margin:2em auto;padding:0 1em}a{color:light-dark(#1656a0,#9bc8ff)}li{margin:.5em 0;overflow-wrap:anywhere}</style><body><a href="/library">← Scoreplay library</a><h1>'+html.escape(p['title'])+'</h1><p>'+html.escape(p['composer']+' · '+p['opus'])+'</p><p>Edition: '+html.escape(p['edition'])+'. Typesetting: '+html.escape(credit)+'.</p><p><a href="'+html.escape(rightsUrl,quote=True)+'">'+html.escape(rights)+'</a>. Original files are redistributed unchanged. Copyright and attribution notices remain in the scores. Any adaptations of a ShareAlike edition must retain its license.</p><p><a href="'+html.escape(sourceUrl,quote=True)+'">Mutopia source edition</a></p>'
 for kind,label in [('midi','Playback files'),('pdf','Scores and instrumental parts'),('source','Editable LilyPond source')]:
  doc+='<h2>'+label+'</h2><ul>'+''.join('<li><a download href="'+r['asset']+'">'+html.escape(r['name'])+'</a></li>' for r in extras if r['kind']==kind)+'</ul>'
 (folder/'credits.html').write_text(doc+'</body></html>')
 provenance.append(dict(id=pid,title=p['title'],sourceUrl=sourceUrl,rights=rights,rightsUrl=rightsUrl,credit=credit,creditsUrl=creditsUrl,files=extras))
 if not mids:
  pdf=next(iter(pdfs));v=files[('pdf',pdf)]
  records.append(dict(id=pid,title=p['title']+(', '+p['opus'] if p['opus'] else ''),composer=p['composer'],category='Classical',difficulty='Not rated',instruments=[p['instrument']],tags=[p['style'].lower(),'score only'],description='This Mutopia edition provides a PDF and editable LilyPond source, but its published MIDI link is unavailable.',source='Mutopia Project',sourceUrl=sourceUrl,rights=rights,rightsUrl=rightsUrl,edition=p['edition']+'. Typesetting: '+credit+'. Original files unchanged.',creditsUrl=creditsUrl,urls={'pdf':urls['pdf']},assets={'pdf':v['asset']},sha256={'pdf':v['sha256']},verified=date.today().isoformat(),duration=0,bpm=0,playbackUnavailable='Mutopia does not provide a working MIDI for this edition. The PDF and editable source are available.'))
 for mid,b in mids.items():
  pdf=pair(mid,pdfs,pid)
  if not pdf:problems.append([pid,mid,list(pdfs)]);continue
  oldp=legacy.get((sourceUrl,mid if urls['midi'].endswith('.zip') else ''))
  if oldp:
   # Keep previously verified assets and the original ids. Add the complete edition download page.
   assert oldp['sha256']['midi']==files[('midi',mid)]['sha256'],f'Existing MIDI source changed: {oldp["id"]}'
   q=dict(oldp);q['creditsUrl']=creditsUrl;records.append(q);continue
  id=pid if len(mids)==1 else pid+'-'+re.sub(r'[^a-z0-9]+','-',re.sub(r'\.midi?$','',mid).lower()).strip('-')
  assert id not in oldids,(id,'unmatched legacy id')
  title=p['title'];opus=p['opus']
  if opus and opus.lower() not in title.lower():title+=', '+opus
  if len(mids)>1:title+=' — '+stem(mid).replace('_',' ').replace('-',' ')
  if pid in seasons:
   season,italian,movements=seasons[pid];match=re.search(r'-(\d+)\.mid$',mid);movement=int(match[1])+1 if match else 1
   title=f'The Four Seasons — {season}: '+['I','II','III'][movement-1]+'. '+movements[movement-1]
  instrument=p['instrument'];instruments=[label for label,pat in [('Piano',r'piano|pianoforte'),('Organ',r'\borgan'),('Harpsichord',r'harpsichord|cembalo'),('Violin',r'violin'),('Viola',r'viola'),('Cello',r'cello'),('Double bass',r'double bass'),('Guitar',r'guitar'),('Lute',r'\blute'),('Mandolin',r'mandolin'),('Harp',r'\bharp\b'),('Flute',r'flute'),('Recorder',r'recorder'),('Oboe',r'oboe'),('Clarinet',r'clarinet'),('Bassoon',r'bassoon'),('Horn',r'\bhorn'),('Trumpet',r'trumpet'),('Trombone',r'trombone'),('Tuba',r'tuba'),('Saxophone',r'saxophone'),('Voice',r'voice|vocal|choir|chorus|soprano|tenor|satb|ssa|ttbb'),('Orchestra',r'orchestra|strings|string ensemble') ] if re.search(pat,instrument,re.I)]
  if not instruments:instruments=[instrument or 'Ensemble']
  tags=[p['style'].lower()];category='Classical'
  if p['style'] in ['Folk']:category='Traditional'
  if p['style'] in ['Jazz','Popular / Dance']:category='Jazz & dance'
  if p['style']=='Modern':category='Contemporary'
  if p['style']=='Song':category='Songs & vocal'
  if p['style'] in ['Hymn','Gospel']:category='Hymns & choral'
  if re.search(r'child|nursery|kinder|jeunesse|album for the young',title,re.I):category='Children & learning';tags+=['children','learning']
  if re.search(r'study|studies|etude|étude|exercise|lesson|leçon',title,re.I) or p['style']=='Technique':tags+=['study','practice','learning']
  if re.search(r'lullaby|berceuse|wiegenlied',title,re.I):tags+=['lullaby','gentle']
  if pid in seasons:tags+=['four seasons',seasons[pid][0].lower(),seasons[pid][1].lower(),'concerto'];category='Classical'
  if len(instruments)==1 and instrument.strip().lower() in {'piano','organ','harpsichord','guitar','lute','flute','recorder','violin','viola','cello','double bass','mandolin','harp','accordion'}:tags+=['solo']
  if len(mids)>1:tags+=['collection']
  a=files[('midi',mid)];v=files[('pdf',pdf)];q=dict(id=id,title=title,composer=p['composer'],category=category,difficulty='Not rated',instruments=instruments,tags=list(dict.fromkeys(tags)),description=f'{instrument}. '+('This playback file is one movement or part of a larger edition. ' if len(mids)>1 else '')+f'PDF: {pdf}. All original parts and editable sources are available under “Edition files & credits”.',source='Mutopia Project',sourceUrl=sourceUrl,rights=rights,rightsUrl=rightsUrl,edition=p['edition']+'. Typesetting: '+credit+'. Original files unchanged.',creditsUrl=creditsUrl,urls={'midi':urls['midi'],'pdf':urls['pdf']},assets={'midi':a['asset'],'pdf':v['asset']},sha256={'midi':a['sha256'],'pdf':v['sha256']},verified=date.today().isoformat())
  for kind,file in [('midi',a),('pdf',v)]:
   if 'archiveMember' in file:q.setdefault('archiveMembers',{})[kind]=file['archiveMember']
  if id in silent:
   assert q['sha256']['midi']==silent[id],f'Silent source changed: {id}'
  else:records.append(q)
# Preserve curated entries absent from today's listing and the separate nursery collection.
ids={p['id'] for p in records};result=[p for p in old if p['id'] not in ids and p['id'] not in silent]+records
report={'source':'https://www.mutopiaproject.org/cgibin/make-table.cgi','verified':date.today().isoformat(),'listedEditions':len(index),'importedEditions':len(provenance),'playableEntries':sum(bool(p['assets'].get('midi')) for p in result),'catalogEntries':len(result),'scoreOnlyEntries':sum(not p['assets'].get('midi') for p in result),'missing':missing,'unpaired':problems}
(output/'problems.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps({**report,'unpairedCount':len(problems),'unpaired':problems[:5],'catalogEntries':len(result)},indent=2))
# Intermediate output allows review before replacing the shipped catalog.
(output/'catalog.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
(output/'provenance.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n')
(output/'composers.json').write_text(json.dumps(composerfull,indent=2,ensure_ascii=False)+'\n')
