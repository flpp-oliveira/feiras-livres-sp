# -*- coding: utf-8 -*-
"""
Monta feiras_geo.csv (a base do site) a partir da planilha da Prefeitura e das
posicoes ja tratadas.

Entradas:
  1. a planilha "lista corrida de feiras" da SESANA (xlsx), a lista OFICIAL e
     mais nova: quais feiras existem, dia, categoria, endereco, referencia e
     quantidade de feirantes;
  2. posicoes_final.csv: posicao e nome tratado de cada feira (esquina citada
     na planilha cruzada com as ruas do mapa + revisao manual dos casos dificeis;
     ver revisao/decisoes_revisao.csv);
  3. a base anterior (feiras_geo.csv): bairro, CEP e subprefeitura ja arrumados
     das feiras que continuam existindo;
  4. distritos.geojson: os 96 distritos oficiais (GeoSampa), para dizer em que
     distrito cada ponto cai.

Uso (na pasta data/):
  python montar_base.py PLANILHA.xlsx ../revisao/posicoes_final.csv
"""
import csv, json, re, sys, unicodedata
import openpyxl
from shapely.geometry import shape, Point

PLANILHA, POSICOES = sys.argv[1:3]
BASE_ANTIGA = 'feiras_geo.csv'
SAIDA = 'feiras_geo.csv'

TIPOS = {'Rua', 'Avenida', 'Praça', 'Travessa', 'Alameda', 'Estrada', 'Largo', 'Viaduto', 'Parque',
         'Viela', 'Calçadão', 'Passagem', 'Ladeira', 'Rodovia', 'Acesso', 'Via'}
CONECT = {'de', 'da', 'do', 'das', 'dos', 'e'}
SUBPREF = {  # nome da planilha (maiusculo, abreviado) -> nome usado no site
    'FREGUESIA / BRASILANDIA': 'Freguesia/Brasilândia', 'PINHEIROS': 'Pinheiros',
}


def titulo(s):
    return ' '.join(w if w in CONECT else w.capitalize() for w in s.lower().split())


def norm_id(n):
    s = str(n).strip()
    return s if '-' in s else s[:-1] + '-' + s[-1]


def separa_tipo(nome):
    p = nome.split(' ', 1)
    return (p[0], p[1]) if len(p) == 2 and p[0] in TIPOS else ('', nome)


def numero(v):
    s = str(v if v is not None else '').strip()
    return 'S/N' if s in ('', '0', 'None') else s


def main():
    wb = openpyxl.load_workbook(PLANILHA, read_only=True, data_only=True)
    plan = {norm_id(r[0]): r for r in list(wb['FEIRAS'].iter_rows(values_only=True))[1:] if r[0]}
    pos = {r['id']: r for r in csv.DictReader(open(POSICOES, encoding='utf-8-sig'))}
    antiga = {r['id']: r for r in csv.DictReader(open(BASE_ANTIGA, encoding='utf-8-sig'))}
    distritos = [(titulo(f['properties']['nm_distrito_municipal']), shape(f['geometry']))
                 for f in json.load(open('distritos.geojson', encoding='utf-8'))['features']]

    saida, mudou_distrito = [], []
    for fid, r in sorted(plan.items()):
        p = pos[fid]
        a = antiga.get(fid, {})
        tipo, logradouro = separa_tipo(p['logradouro_tratado'])
        lat, lng = float(p['lat_nova']), float(p['lng_nova'])
        distrito = next((n for n, poly in distritos if poly.contains(Point(lng, lat))), '')
        if a and a.get('distrito') and distrito and a['distrito'] != distrito:
            mudou_distrito.append((fid, a['distrito'], distrito))
        saida.append({
            'id': fid, 'dia': r[1], 'categoria': r[2],
            'tipo_logradouro': tipo, 'logradouro': logradouro, 'numero': numero(r[5]),
            'referencia': p['referencia_tratada'], 'feirantes': r[3] or '',
            'bairro': a.get('bairro') or titulo(str(r[6] or '')),
            'cep': a.get('cep', ''),
            'subprefeitura': a.get('subprefeitura') or SUBPREF.get(str(r[8]).strip(), titulo(str(r[8] or ''))),
            'lat': round(lat, 7), 'lng': round(lng, 7),
            'geocode_status': p['status'], 'distrito': distrito,
            'endereco_planilha': ' '.join(str(r[4] or '').split()),
        })

    cols = list(saida[0].keys())
    with open(SAIDA, 'w', newline='', encoding='utf-8-sig') as fp:
        w = csv.DictWriter(fp, fieldnames=cols)
        w.writeheader()
        w.writerows(saida)

    novas = sorted(set(plan) - set(antiga))
    sairam = sorted(set(antiga) - set(plan))
    print(f'{SAIDA}: {len(saida)} feiras | novas: {novas} | sairam: {sairam}')
    print(f'sem distrito: {sum(1 for s in saida if not s["distrito"])} | mudaram de distrito: {len(mudou_distrito)}')
    for m in mudou_distrito:
        print('  ', *m)


if __name__ == '__main__':
    main()
