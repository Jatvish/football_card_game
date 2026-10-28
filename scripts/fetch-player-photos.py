"""Fetch reusable Wikimedia portraits and keep attribution beside each card.

Run with Python 3 and Pillow. Existing portraits are reused unless removed.
The game's server never depends on Wikipedia being online.
"""
import concurrent.futures
import html
import io
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/players.json'
ASSETS = ROOT / 'public/players'
ASSETS.mkdir(exist_ok=True)
DB = json.loads(DATA.read_text(encoding='utf-8'))
TITLES = {
    'A02': 'Neymar', 'A03': 'Luis Suárez (footballer, born 1987)', 'A04': 'Xavi', 'A08': 'Javier Mascherano',
    'B09': 'Marcelo (footballer, born 1988)',
    'P13': "N'Golo Kanté", 'P26': 'Alisson Becker',
}
HEADERS = {'User-Agent': 'FinalWhistleGame/2.1 (https://github.com/Jatvish/football_card_game; Wikimedia photo credits)'}

def get(url, parse=False):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=25) as r:
                value = r.read()
                return json.loads(value) if parse else value
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)

def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value or '')).strip()

def fetch(card):
    if card.get('photo') and (ROOT/'public'/card['photo']['src'].lstrip('/')).exists():
        return card['id'], card['photo']
    if card['id'] == 'A04':
        filename = 'Xavi Hernandez (31521652051).jpg'
        original = ''
    else:
        title = TITLES.get(card['id'], card['name'])
        summary = get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_')), True)
        original = summary.get('originalimage', {}).get('source')
        if not original or '/commons/' not in original:
            raise ValueError(f'{card["name"]}: no Commons portrait found')
        filename = urllib.parse.unquote(urllib.parse.urlparse(original).path.rsplit('/', 1)[1])
    query = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo',
        'iiprop': 'extmetadata|url', 'titles': 'File:' + filename, 'iiurlwidth': 480})
    info = next(iter(get('https://commons.wikimedia.org/w/api.php?' + query, True)['query']['pages'].values()))['imageinfo'][0]
    meta = {key: value['value'] for key, value in info['extmetadata'].items()}
    license_name = clean(meta.get('LicenseShortName'))
    if not any(x in license_name.lower() for x in ['cc by', 'cc0', 'public domain', 'gfdl']):
        raise ValueError(f'{card["name"]}: review license {license_name}')
    raw = get(info.get('thumburl', original))
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    image.thumbnail((640, 800))
    image.save(ASSETS/(card['id']+'.webp'), 'WEBP', quality=86)
    return card['id'], {'src': '/players/'+card['id']+'.webp',
        'source': info['descriptionurl'], 'author': clean(meta.get('Attribution') or meta.get('Artist')),
        'license': license_name, 'licenseUrl': meta.get('LicenseUrl', ''),
        'changes': 'Resized and converted to WebP; displayed with a crop.',
        'title': clean(meta.get('ObjectName', filename))}

errors = []
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    pending = {pool.submit(fetch, card): card for card in DB['cards']}
    for job in concurrent.futures.as_completed(pending):
        card = pending[job]
        try:
            _, photo = job.result()
            card['photo'] = photo
            print(card['id'] + ' photo ready', flush=True)
        except Exception as error:
            errors.append(card['id'])
            print(card['id'] + ' ERROR ' + str(error), flush=True)
DATA.write_text(json.dumps(DB, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
credits = ['# Player photo credits', '', 'Photos are distributed under their individual licenses, independently of game code. Resized to WebP; the interface crops the display. Card peak ratings do not imply the photograph is from that season.', '']
for card in DB['cards']:
    if not card.get('photo'):
        continue
    p = card['photo']
    credits.append(f'- **{card["name"]}**: {p["author"]}. [{p["license"]}]({p["licenseUrl"] or p["source"]}). [Original and attribution]({p["source"]}).')
(ROOT/'PHOTO_CREDITS.md').write_text('\n'.join(credits)+'\n', encoding='utf-8')
if errors:
    raise SystemExit('Missing portraits: ' + ', '.join(errors))
