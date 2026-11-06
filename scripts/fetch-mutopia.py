#!/usr/bin/env python3
"""Cache Mutopia's complete published index and original files for review.
Requires requests and beautifulsoup4. No application files are modified.
Usage: python3 scripts/fetch-mutopia.py --cache /tmp/scoreplay-mutopia
"""
import argparse, concurrent.futures, hashlib, json, pathlib, re, threading, time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
parser = argparse.ArgumentParser(); parser.add_argument('--cache', required=True); args = parser.parse_args()
cache = pathlib.Path(args.cache); (cache/'pages').mkdir(parents=True, exist_ok=True); (cache/'assets').mkdir(exist_ok=True)
local = threading.local()
def get(url):
    if not hasattr(local, 'session'): local.session = requests.Session()
    for attempt in range(4):
        try:
            response = local.session.get(url, timeout=45); response.raise_for_status(); return response.content
        except requests.HTTPError as error:
            if error.response.status_code == 404 or attempt == 3: raise
        except requests.RequestException:
            if attempt == 3: raise
        time.sleep(2 * (attempt + 1))
def page(start):
    url = f'https://www.mutopiaproject.org/cgibin/make-table.cgi?startat={start}'
    path = cache/'pages'/f'{start}.html'
    if not path.exists(): path.write_bytes(get(url))
    soup = BeautifulSoup(path.read_bytes(), 'html.parser'); records = []
    for table in soup.select('table.result-table'):
        rows = [[cell.get_text(' ', strip=True) for cell in row.find_all('td', recursive=False)] for row in table.find_all('tr', recursive=False)]
        links = {a.get_text(' ', strip=True): urljoin(url, a['href']) for a in table.select('a[href]')}
        rights = table.find_all('tr', recursive=False)[2].find_all('td', recursive=False)[1].a
        records.append(dict(id='mutopia-'+links['More Information'].split('id=')[1], title=rows[0][0], composer=re.sub(r' \([^)]*\)$', '', rows[0][1].removeprefix('by ')), opus=rows[0][2], instrument=rows[1][0].removeprefix('for '), style=rows[1][2], edition=rows[2][0], rights=rows[2][1], rightsUrl=urljoin(url, rights['href']), links=links))
    return records
records = []; done = False
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    for first in range(1, 100001, 200):
        for result in pool.map(page, range(first, first+200, 10)):
            records.extend(result)
            if len(result) < 10: done = True; break
        print(f'Indexed {len(records)} editions', flush=True)
        if done: break
if not done: raise RuntimeError('Index pagination did not terminate')
# The published index points to missing filenames, but these unchanged original
# files are present in the corresponding official FTP directories (reviewed 2026-11-06).
corrections = {'mutopia-1714': ('BuxWV69.mid','BuxWV69_score.mid'), 'mutopia-1715': ('Sonataduodecima.mid','Sonataduodecima_Score.mid'), 'mutopia-665': ('16-berceuse-mids.zip','16-berceuse.mid')}
for record in records:
    if record['id'] in corrections:
        old, new = corrections[record['id']]; key = next((k for k,v in record['links'].items() if v.endswith(old)), None)
        if key: record['links']['.mid file'] = record['links'].pop(key).replace(old,new)
(cache/'index.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n')
def download(record):
    failures = []
    for labels in [('.mid file','.mid files (zipped)'),('A4 .pdf file','A4 .pdf files (zipped)'),('.ly file','.ly files (zipped)')]:
        url = next((record['links'][key] for key in labels if key in record['links']), None)
        if not url: failures.append(dict(id=record['id'], error=f'Missing link: {labels}')); continue
        path = cache/'assets'/hashlib.sha256(url.encode()).hexdigest()
        if path.exists(): continue
        try: path.write_bytes(get(url))
        except requests.RequestException as error: failures.append(dict(id=record['id'],url=url,error=str(error)))
    return failures
failures = []
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for count, result in enumerate(pool.map(download,records), 1):
        failures.extend(result)
        if count % 100 == 0: print(f'Cached {count}/{len(records)} editions',flush=True)
(cache/'download-errors.json').write_text(json.dumps(failures,indent=2)+'\n')
print(f'Cached {len(records)} editions; {len(failures)} missing source files. Review download-errors.json before importing.')
