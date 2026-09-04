# -*- coding: utf-8 -*-
"""
Gera feiras_geo.csv usando o painel oficial da Prefeitura (Power BI) como
lista-base -- nao mais a planilha antiga (feiras.xlsx / feiras_limpo.csv).

Substitui merge_coords.py: aqui nao ha cascata de fallback entre fontes de
coordenada. So entra feira que o painel da prefeitura tem hoje.

Para cada feira do painel (pbi_feiras.csv, ver atualizar_pbi_coords.py):
  - Se o N.Feira bate com uma linha de feiras_limpo.csv (planilha antiga),
    usa os campos bem formatados de la (logradouro/numero/bairro/referencia/
    cep/subprefeitura/categoria/dia) + a coordenada do painel.
  - Se nao bate (feira nova, aberta depois da planilha de set/2024), usa os
    campos crus do proprio painel (categoria/dia/endereco/subprefeitura) --
    sem bairro/cep/numero/referencia, que o painel nao tem.

Reexecutavel: rode de novo apos atualizar_pbi_coords.py.
"""
import csv, re

TIPO = {
    'RUA': 'Rua', 'AV': 'Avenida', 'AVENIDA': 'Avenida', 'PRACA': 'Praça',
    'PRAÇA': 'Praça', 'ALAMEDA': 'Alameda', 'TRAVESSA': 'Travessa',
    'LARGO': 'Largo', 'ESTRADA': 'Estrada',
}

# "Rua Fulano, 120 - Bairro - São Paulo , 03511-020"  (numero pode faltar,
# aparecendo so "Rua Fulano - Bairro - Sao Paulo , CEP")
PADRAO_ENDERECO_PBI = re.compile(
    r'^(?P<via>[^,]+?)(?:,\s*(?P<numero>[^-]*))?\s*-\s*(?P<bairro>.+?)\s*-\s*S.o Paulo\s*,\s*(?P<cep>\d{5}-\d{3})$'
)

def parse_endereco_pbi(endereco):
    """Extrai tipo/logradouro/numero/bairro/cep do texto cru do painel.
    Retorna None se nao bater o padrao (ai o chamador usa o texto inteiro
    como logradouro, sem quebrar em campos)."""
    m = PADRAO_ENDERECO_PBI.match(endereco or '')
    if not m:
        return None
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
    return {
        'tipo_logradouro': tipo, 'logradouro': logradouro, 'numero': numero,
        'bairro': m.group('bairro').strip(), 'cep': m.group('cep'),
    }

def in_sp(lat, lng):
    try: lat, lng = float(lat), float(lng)
    except: return False
    return -24.02 <= lat <= -23.35 and -46.84 <= lng <= -46.36

pbi = list(csv.DictReader(open('pbi_feiras.csv', encoding='utf-8-sig')))
antiga = {r['id']: r for r in csv.DictReader(open('feiras_limpo.csv', encoding='utf-8-sig'))}

cols = ['id', 'dia', 'categoria', 'tipo_logradouro', 'logradouro', 'numero',
        'bairro', 'referencia', 'cep', 'subprefeitura', 'lat', 'lng', 'geocode_status']

saida = []
so_painel = 0
for p in pbi:
    i = p['id']
    if not in_sp(p['lat'], p['lng']):
        continue  # coordenada fora do municipio -> nao plota
    a = antiga.get(i)
    if a:
        row = {
            'id': i, 'dia': a['dia'], 'categoria': a['categoria'],
            'tipo_logradouro': a['tipo_logradouro'], 'logradouro': a['logradouro'],
            'numero': a['numero'], 'bairro': a['bairro'], 'referencia': a['referencia'],
            'cep': a['cep'], 'subprefeitura': a['subprefeitura'],
            'lat': p['lat'], 'lng': p['lng'], 'geocode_status': 'painel_prefeitura',
        }
    else:
        extraido = parse_endereco_pbi(p['endereco_pbi'])
        if extraido:
            row = {
                'id': i, 'dia': p['dia_pbi'], 'categoria': p['categoria_pbi'],
                'tipo_logradouro': extraido['tipo_logradouro'], 'logradouro': extraido['logradouro'],
                'numero': extraido['numero'], 'bairro': extraido['bairro'], 'referencia': '',
                'cep': extraido['cep'], 'subprefeitura': p['subprefeitura_pbi'],
                'lat': p['lat'], 'lng': p['lng'], 'geocode_status': 'painel_prefeitura_sem_planilha',
            }
        else:
            # nao bateu o padrao (2 dos 15 casos) -- usa o endereco cru inteiro
            row = {
                'id': i, 'dia': p['dia_pbi'], 'categoria': p['categoria_pbi'],
                'tipo_logradouro': '', 'logradouro': p['endereco_pbi'],
                'numero': '', 'bairro': '', 'referencia': '',
                'cep': '', 'subprefeitura': p['subprefeitura_pbi'],
                'lat': p['lat'], 'lng': p['lng'], 'geocode_status': 'painel_prefeitura_sem_planilha',
            }
        so_painel += 1
    saida.append(row)

saida.sort(key=lambda r: r['id'])

with open('feiras_geo.csv', 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=cols)
    w.writeheader()
    w.writerows(saida)

print(f'feiras_geo.csv gerado: {len(saida)} feiras (todas do painel oficial da prefeitura)')
print(f'  com dado completo (bate com a planilha antiga): {len(saida) - so_painel}')
print(f'  so com dado do painel (novas, sem bairro/cep/numero): {so_painel}')
