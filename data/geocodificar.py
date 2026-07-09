# -*- coding: utf-8 -*-
"""
Geocodifica feiras_limpo.csv usando Nominatim (OpenStreetMap).
- Respeita 1 req/s (politica de uso do Nominatim publico)
- Cache resumivel em geocode_cache.json (pode interromper e retomar)
- Estrategia em cascata: estruturada -> CEP -> free-form
- Marca geocode_status: ok | ok_cep | ok_freeform | fora_sp | nao_encontrado
Saida: feiras_geo.csv
"""
import csv, json, os, re, time, urllib.request, urllib.parse

IN, OUT, CACHE = 'feiras_limpo.csv', 'feiras_geo.csv', 'geocode_cache.json'
UA = 'feiras-livres-sp/1.0 (mapa feiras livres SP; contato felippeprofissionalsi@gmail.com)'
SLEEP = 1.1
# bbox do municipio de Sao Paulo
def in_sp(lat, lng):
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

def via1(logr):
    return re.split(r'\s+com\s+', logr, flags=re.I)[0].strip()

def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.load(resp)

def query(params):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            d = _get(url)
            if d:
                return float(d[0]['lat']), float(d[0]['lon'])
            return None
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None

def geocode(r):
    cep = r['cep'] if re.match(r'\d{5}-\d{3}', r['cep']) else ''
    rua = f"{r['tipo_logradouro']} {via1(r['logradouro'])}".strip()
    street = f"{r['numero']} {rua}" if r['numero'] != 'S/N' else rua
    base = {'city': 'São Paulo', 'state': 'São Paulo', 'country': 'Brazil',
            'format': 'json', 'limit': '1', 'countrycodes': 'br'}

    # 1) estruturada (rua + cep)
    p = dict(base, street=street)
    if cep:
        p['postalcode'] = cep
    res = query(p)
    if res and in_sp(*res):
        return res[0], res[1], 'ok'

    # 2) estruturada sem cep (as vezes o cep atrapalha)
    if cep:
        res2 = query(dict(base, street=street))
        if res2 and in_sp(*res2):
            return res2[0], res2[1], 'ok'

    # 3) free-form rua + bairro
    q = f"{rua}, {r['bairro']}, São Paulo, SP, Brasil"
    res3 = query({'q': q, 'format': 'json', 'limit': '1', 'countrycodes': 'br'})
    if res3 and in_sp(*res3):
        return res3[0], res3[1], 'ok_freeform'

    # 4) so o CEP
    if cep:
        res4 = query({'postalcode': cep, 'country': 'Brazil',
                      'format': 'json', 'limit': '1', 'countrycodes': 'br'})
        if res4 and in_sp(*res4):
            return res4[0], res4[1], 'ok_cep'

    # se achou algo mas fora de SP, registra pra revisao
    if res:
        return res[0], res[1], 'fora_sp'
    return '', '', 'nao_encontrado'

def main():
    rows = list(csv.DictReader(open(IN, encoding='utf-8-sig')))
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    total = len(rows)
    done = 0
    for i, r in enumerate(rows, 1):
        k = r['id']
        if k not in cache:
            lat, lng, st = geocode(r)
            cache[k] = {'lat': lat, 'lng': lng, 'geocode_status': st}
            done += 1
            if done % 10 == 0:
                json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
                ok = sum(1 for v in cache.values() if str(v['geocode_status']).startswith('ok'))
                print(f'[{i}/{total}] processadas={len(cache)} ok={ok}', flush=True)
            time.sleep(SLEEP)
        r['lat'] = cache[k]['lat']
        r['lng'] = cache[k]['lng']
        r['geocode_status'] = cache[k]['geocode_status']

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    with open(OUT, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    stt = Counter(r['geocode_status'] for r in rows)
    print('\n=== FIM ===')
    print('Status:', dict(stt))
    ok = sum(v for k, v in stt.items() if k.startswith('ok'))
    print(f'Geocodificadas com sucesso: {ok}/{total} ({100*ok//total}%)')

if __name__ == '__main__':
    main()
