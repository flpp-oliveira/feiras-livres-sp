# -*- coding: utf-8 -*-
"""Resgata as feiras sem coordenada usando o CEP via BrasilAPI (v2) e ViaCEP+Nominatim como fallback."""
import csv, json, re, urllib.request, time, os

def in_sp(lat, lng):
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

def get(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'feiras-sp/1.0 (contato felippeprofissionalsi@gmail.com)'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

def brasilapi(cep):
    d = re.sub(r'\D', '', cep)
    try:
        j = get(f'https://brasilapi.com.br/api/cep/v2/{d}')
        c = (j.get('location') or {}).get('coordinates') or {}
        lat, lng = c.get('latitude'), c.get('longitude')
        if lat and lng:
            return float(lat), float(lng), 'brasilapi_cep'
        return None, None, j.get('street', '')  # devolve rua canonica p/ fallback
    except Exception:
        return None, None, ''

def nominatim_rua(rua, bairro, cep):
    try:
        import urllib.parse
        q = f'{rua}, {bairro}, São Paulo, SP, {cep}, Brasil'
        j = get('https://nominatim.openstreetmap.org/search?' +
                urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': '1', 'countrycodes': 'br'}))
        if j:
            return float(j[0]['lat']), float(j[0]['lon'])
    except Exception:
        pass
    return None, None

def main():
    rows = list(csv.DictReader(open('feiras_geo.csv', encoding='utf-8-sig')))
    sem = [r for r in rows if not r['lat']]
    res = json.load(open('cep_coords.json', encoding='utf-8')) if os.path.exists('cep_coords.json') else {}
    for r in sem:
        if r['id'] in res:
            continue
        lat, lng, extra = brasilapi(r['cep'])
        fonte = 'brasilapi_cep'
        if lat is None or not in_sp(lat, lng):
            # fallback: rua canonica da BrasilAPI (ou a nossa) via Nominatim + CEP
            rua = extra or r['logradouro']
            lat, lng = nominatim_rua(rua, r['bairro'], r['cep'])
            fonte = 'nominatim_cep'
            time.sleep(1.1)
        if lat is not None and in_sp(lat, lng):
            res[r['id']] = {'lat': lat, 'lng': lng, 'fonte': fonte}
        else:
            res[r['id']] = {'lat': '', 'lng': '', 'fonte': 'falhou'}
        json.dump(res, open('cep_coords.json', 'w', encoding='utf-8'), ensure_ascii=False)
        print(f"[{r['id']}] {res[r['id']]['fonte']}: {res[r['id']]['lat']},{res[r['id']]['lng']}", flush=True)
    ok = sum(1 for v in res.values() if v['lat'])
    print(f'\nResgatadas: {ok}/{len(sem)}')

if __name__ == '__main__':
    main()
