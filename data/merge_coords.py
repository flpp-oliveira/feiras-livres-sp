# -*- coding: utf-8 -*-
"""
Combina as coordenadas de duas fontes em feiras_geo.csv:
  1) mymaps_coords.csv  -> geocoder do GOOGLE (extraido do My Maps) [prioridade]
  2) geocode_cache.json -> Nominatim/OSM (tapa os buracos)
Valida bbox de Sao Paulo e marca a coluna 'fonte'.
Re-executavel: rode de novo apos o Nominatim terminar pra completar.
"""
import csv, json, os

def in_sp(lat, lng):
    try: lat, lng = float(lat), float(lng)
    except: return False
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

feiras = list(csv.DictReader(open('feiras_limpo.csv', encoding='utf-8-sig')))
google = {r['id']: (r['lat'], r['lng']) for r in csv.DictReader(open('mymaps_coords.csv', encoding='utf-8'))}
cache = json.load(open('geocode_cache.json', encoding='utf-8')) if os.path.exists('geocode_cache.json') else {}

# resgates por CEP (BrasilAPI/Nominatim e AwesomeAPI) - tier 3
cep = {}
for arq in ('cep_coords.json', 'cep_coords2.json'):
    if os.path.exists(arq):
        for k, v in json.load(open(arq, encoding='utf-8')).items():
            if v.get('lat'):
                cep[k] = v

from collections import Counter
cont = Counter()
for f in feiras:
    i = f['id']
    lat = lng = ''
    fonte = 'sem_coordenada'
    if i in google and in_sp(*google[i]):
        lat, lng = google[i]; fonte = 'google'
    elif i in cache and str(cache[i].get('geocode_status', '')).startswith('ok') and in_sp(cache[i]['lat'], cache[i]['lng']):
        lat, lng = cache[i]['lat'], cache[i]['lng']; fonte = 'nominatim'
    elif i in cep and in_sp(cep[i]['lat'], cep[i]['lng']):
        lat, lng = cep[i]['lat'], cep[i]['lng']; fonte = cep[i]['fonte']
    elif i in google:  # google achou mas fora de SP -> revisao, nao plota
        lat, lng = '', ''; fonte = 'google_fora_sp'
    f['lat'], f['lng'], f['geocode_status'] = lat, lng, fonte
    cont[fonte] += 1

cols = list(feiras[0].keys())
with open('feiras_geo.csv', 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=cols); w.writeheader(); w.writerows(feiras)

com = sum(v for k, v in cont.items() if k not in ('sem_coordenada', 'google_fora_sp'))
print('feiras_geo.csv gerado.')
print('Fontes:', dict(cont))
print(f'Com coordenada valida: {com}/{len(feiras)} ({100*com//len(feiras)}%)')
