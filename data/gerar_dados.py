# -*- coding: utf-8 -*-
"""
Gera site/feiras-data.js a partir de feiras_geo.csv.
Formato: window.FEIRAS = [ {id, dia, categoria, tipo, logradouro, numero, bairro,
                            cep, subprefeitura, lat, lng}, ... ]
         window.FEIRAS_BASE = "AAAA-MM"   (mes da base, mostrado no rodape do mapa)
Embutido em JS para o site abrir direto do arquivo (file://) sem servidor.

Depois de ler a base, aplica correcoes.csv: pontos corrigidos a mao a partir
dos reports enviados pela populacao (ver README, "Conferência dos reports").
A base (feiras_geo.csv) continua sendo a da Prefeitura: so o que vai para o
site muda.
"""
import csv, json, math, os, sys

SRC = 'feiras_geo.csv'
CORRECOES = 'correcoes.csv'
OUT = os.path.join('..', 'site', 'feiras-data.js')
CAMPOS = ['id', 'dia', 'categoria', 'logradouro', 'numero', 'bairro',
          'cep', 'subprefeitura', 'distrito', 'lat', 'lng']

# Mes em que a base foi conferida com o painel da Prefeitura pela ultima vez.
# ATUALIZAR sempre que feiras_geo.csv for regenerado: e a data que o site mostra.
DATA_BASE = '2026-09'

# A cidade de Sao Paulo com folga: correcao fora disto e digito trocado.
LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX = -24.1, -23.2, -47.0, -46.2
CABECALHO_CORRECOES = ['id', 'lat', 'lng', 'data', 'motivo']
# acima disto a correcao e aplicada, mas marcada para conferencia: uma feira
# raramente esta a mais de 1 km de onde a Prefeitura a declara
ALERTA_KM = 1.0


def dist_km(la1, lo1, la2, lo2):
    r, rad = 6371.0, math.pi / 180
    dla, dlo = (la2 - la1) * rad, (lo2 - lo1) * rad
    a = math.sin(dla / 2) ** 2 + math.cos(la1 * rad) * math.cos(la2 * rad) * math.sin(dlo / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def para(msg):
    sys.exit(f'{CORRECOES}: {msg}')


def aplica_correcoes(out):
    """Move os pontos listados em correcoes.csv. Para, com a linha indicada,
    diante de cabecalho errado, id repetido ou coordenada invalida/fora da cidade."""
    if not os.path.exists(CORRECOES):
        return
    with open(CORRECOES, encoding='utf-8-sig', newline='') as f:
        leitor = csv.reader(f, delimiter=';')
        cab = next(leitor, None)
        if cab != CABECALHO_CORRECOES:
            para(f'cabeçalho deve ser {";".join(CABECALHO_CORRECOES)} (veio: {cab})')
        por_id = {o['id']: o for o in out}
        vistos = set()
        for n, lin in enumerate(leitor, start=2):
            if not lin or not ''.join(lin).strip():
                continue
            if len(lin) != len(CABECALHO_CORRECOES):
                para(f'linha {n}: esperados {len(CABECALHO_CORRECOES)} campos separados por ";", vieram {len(lin)}')
            fid, lat, lng, data, motivo = [c.strip() for c in lin]
            if fid in vistos:
                para(f'linha {n}: feira {fid} repetida (uma linha por feira)')
            vistos.add(fid)
            try:
                lat, lng = float(lat), float(lng)
            except ValueError:
                para(f'linha {n}: coordenada inválida (use ponto decimal: -23.55052)')
            if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
                para(f'linha {n}: ponto ({lat}, {lng}) fora da cidade de São Paulo — dígito trocado?')
            if not motivo:
                para(f'linha {n}: falta o motivo (é o registro permanente da decisão)')
            o = por_id.get(fid)
            if o is None:
                print(f'  correção NÃO aplicada, linha {n}: feira {fid} não está na base atual')
                continue
            if o['lat'] is None:
                andou = None
            else:
                andou = dist_km(o['lat'], o['lng'], lat, lng)
            if andou is not None and andou < 0.03:
                print(f'  correção dispensável, linha {n}: a base já declara a feira {fid} a {andou * 1000:.0f} m deste ponto — pode sair do arquivo')
            o['lat'], o['lng'] = lat, lng
            quanto = 'sem ponto anterior' if andou is None else f'moveu {andou * 1000:.0f} m'
            alerta = '  <-- CONFIRA' if andou is not None and andou > ALERTA_KM else ''
            print(f'  correção aplicada: feira {fid} ({quanto}){alerta}')


def main():
    rows = list(csv.DictReader(open(SRC, encoding='utf-8-sig')))
    out = []
    for r in rows:
        o = {k: r.get(k, '') for k in CAMPOS}
        o['tipo'] = r.get('tipo_logradouro', '')  # "Rua", "Avenida"... (exibicao)
        for c in ('lat', 'lng'):
            v = (o.get(c) or '').strip()
            o[c] = float(v) if v else None
        out.append(o)
    aplica_correcoes(out)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('window.FEIRAS = ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
        f.write(f'window.FEIRAS_BASE = "{DATA_BASE}";\n')
    com = sum(1 for o in out if o['lat'] is not None)
    print(f'{OUT}: {len(out)} feiras ({com} com coordenada) a partir de {SRC}, base de {DATA_BASE}')


if __name__ == '__main__':
    main()
