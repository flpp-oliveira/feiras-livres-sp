# -*- coding: utf-8 -*-
"""2a passada de resgate: AwesomeAPI (retorna lat/lng por CEP) para as feiras ainda sem coordenada.
Fallback final: centroide do bairro (marcado como baixa precisao)."""
import csv, json, re, urllib.request, os, time

def in_sp(lat, lng):
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

def get(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'feiras-sp/1.0'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

def awesome(cep):
    d = re.sub(r'\D', '', cep)
    try:
        j = get(f'https://cep.awesomeapi.com.br/json/{d}')
        lat, lng = j.get('lat'), j.get('lng')
        if lat and lng:
            return float(lat), float(lng)
    except Exception:
        pass
    return None, None

def main():
    rows = list(csv.DictReader(open('feiras_geo.csv', encoding='utf-8-sig')))
    prev = json.load(open('cep_coords.json', encoding='utf-8')) if os.path.exists('cep_coords.json') else {}
    # ids ainda sem coordenada (nem no csv, nem resgatados antes)
    sem = [r for r in rows if not r['lat'] and not (prev.get(r['id'], {}).get('lat'))]
    res = json.load(open('cep_coords2.json', encoding='utf-8')) if os.path.exists('cep_coords2.json') else {}
    for r in sem:
        if r['id'] in res:
            continue
        lat, lng = awesome(r['cep'])
        if lat is not None and in_sp(lat, lng):
            res[r['id']] = {'lat': lat, 'lng': lng, 'fonte': 'awesomeapi_cep'}
        else:
            res[r['id']] = {'lat': '', 'lng': '', 'fonte': 'falhou'}
        json.dump(res, open('cep_coords2.json', 'w', encoding='utf-8'), ensure_ascii=False)
        print(f"[{r['id']}] CEP {r['cep']} -> {res[r['id']]['fonte']}: {res[r['id']]['lat']},{res[r['id']]['lng']}", flush=True)
        time.sleep(0.3)
    ok = sum(1 for v in res.values() if v['lat'])
    print(f'\nAwesomeAPI resgatou: {ok}/{len(sem)}')

if __name__ == '__main__':
    main()
