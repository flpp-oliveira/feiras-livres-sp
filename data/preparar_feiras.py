# -*- coding: utf-8 -*-
"""
Gera feiras_geo.csv a partir de pbi_feiras.csv -- unica fonte de dados do
site (painel oficial da Prefeitura). Sem planilha antiga, sem geocodificacao
por terceiros: tudo vem do painel.

O campo "Endereco" do painel chega como texto unico (ex.: "Rua Fulano, 120 -
Bairro - Sao Paulo , 01234-567"). Esse script separa tipo de logradouro,
nome da rua e numero desse texto -- Bairro e CEP ja vem como colunas
proprias do painel, nao precisam ser extraidos.

Reexecutavel: rode de novo apos atualizar_pbi_coords.py.
"""
import csv, re

TIPO = {
    'RUA': 'Rua', 'AV': 'Avenida', 'AVENIDA': 'Avenida', 'PRACA': 'Praça',
    'PRAÇA': 'Praça', 'PC': 'Praça', 'PÇ': 'Praça', 'ALAMEDA': 'Alameda',
    'AL': 'Alameda', 'TRAVESSA': 'Travessa', 'TV': 'Travessa', 'LARGO': 'Largo',
    'LG': 'Largo', 'ESTRADA': 'Estrada', 'ES': 'Estrada', 'PARQUE': 'Parque',
    'PQ': 'Parque', 'CALCADAO': 'Calçadão', 'CALÇADÃO': 'Calçadão',
}

# "Rua Fulano, 120 - Bairro - Sao Paulo , CEP"  (numero pode faltar: so
# "Rua Fulano - Bairro - Sao Paulo , CEP"). So usamos a parte antes do
# primeiro " - " (via + numero); bairro/cep vem direto das colunas do painel.
PADRAO_VIA = re.compile(r'^(?P<via>[^,]+?)(?:,\s*(?P<numero>[^-]*))?\s*-')

def parse_via_numero(endereco):
    """Extrai tipo/logradouro/numero do texto de endereco do painel.
    Se nao bater o padrao, devolve o texto inteiro como logradouro."""
    m = PADRAO_VIA.match(endereco or '')
    if not m:
        return {'tipo_logradouro': '', 'logradouro': (endereco or '').strip(), 'numero': 'S/N'}
    via = m.group('via').strip()
    partes = via.split(' ', 1)
    tipo_raw = partes[0].upper().rstrip('.')
    if tipo_raw in TIPO and len(partes) > 1:
        tipo, logradouro = TIPO[tipo_raw], partes[1]
    else:
        tipo, logradouro = '', via
    numero = (m.group('numero') or '').strip()
    if not numero:
        numero = 'S/N'
    return {'tipo_logradouro': tipo, 'logradouro': logradouro, 'numero': numero}

def in_sp(lat, lng):
    try: lat, lng = float(lat), float(lng)
    except: return False
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

pbi = list(csv.DictReader(open('pbi_feiras.csv', encoding='utf-8-sig')))

cols = ['id', 'dia', 'categoria', 'tipo_logradouro', 'logradouro', 'numero',
        'bairro', 'referencia', 'cep', 'subprefeitura', 'lat', 'lng', 'geocode_status']

saida = []
for p in pbi:
    if not in_sp(p['lat'], p['lng']):
        continue  # coordenada fora do municipio -> nao plota
    via = parse_via_numero(p['endereco_pbi'])
    saida.append({
        'id': p['id'], 'dia': p['dia'], 'categoria': p['categoria'],
        'tipo_logradouro': via['tipo_logradouro'], 'logradouro': via['logradouro'],
        'numero': via['numero'], 'bairro': p['bairro'], 'referencia': '',
        'cep': p['cep'], 'subprefeitura': p['subprefeitura'],
        'lat': p['lat'], 'lng': p['lng'], 'geocode_status': 'painel_prefeitura',
    })

saida.sort(key=lambda r: r['id'])

with open('feiras_geo.csv', 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=cols)
    w.writeheader()
    w.writerows(saida)

print(f'feiras_geo.csv gerado: {len(saida)} feiras, todas do painel oficial da prefeitura')
