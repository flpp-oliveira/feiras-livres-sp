# -*- coding: utf-8 -*-
"""Adiciona a coluna 'distrito' a feiras_geo.csv cruzando lat/lng com os
poligonos dos 96 distritos oficiais de SP (GeoSampa via codigourbano/distritos-sp).
"""
import csv, json
from shapely.geometry import shape, Point

CONECT = {'de', 'da', 'do', 'das', 'dos', 'e'}
def titulo(s):
    return ' '.join(w if w in CONECT else w.capitalize() for w in s.lower().split())

def main():
    g = json.load(open('distritos.geojson', encoding='utf-8'))
    distritos = []
    for f in g['features']:
        distritos.append((f['properties']['ds_nome'], shape(f['geometry'])))

    rows = list(csv.DictReader(open('feiras_geo.csv', encoding='utf-8-sig')))
    achou = 0
    for r in rows:
        r['distrito'] = ''
        if not r['lat']:
            continue
        p = Point(float(r['lng']), float(r['lat']))   # GeoJSON = (lng, lat)
        for nome, poly in distritos:
            if poly.contains(p):
                r['distrito'] = titulo(nome)
                achou += 1
                break

    cols = list(rows[0].keys())
    with open('feiras_geo.csv', 'w', newline='', encoding='utf-8-sig') as fp:
        w = csv.DictWriter(fp, fieldnames=cols)
        w.writeheader(); w.writerows(rows)

    from collections import Counter
    print(f'Feiras com distrito atribuido: {achou}/{len(rows)}')
    sem = [r['id'] for r in rows if r['lat'] and not r['distrito']]
    print(f'Com coordenada mas fora de todos os distritos: {len(sem)} {sem[:8]}')
    print('Top distritos:', Counter(r['distrito'] for r in rows if r['distrito']).most_common(8))
    # confere a Moema
    moema = [r for r in rows if r['distrito'] == 'Moema']
    print(f'\nFeiras no DISTRITO Moema: {len(moema)}')
    for r in moema:
        print(f"  [{r['id']}] {r['dia']:12s} {r['logradouro'][:26]:26s} | bairro cadastral={r['bairro']}")

if __name__ == '__main__':
    main()
