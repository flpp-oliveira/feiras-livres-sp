# -*- coding: utf-8 -*-
"""
Gera site/feiras-data.js a partir do CSV (feiras_geo.csv se existir, senao feiras_limpo.csv).
Formato: window.FEIRAS = [ {id, dia, categoria, tipo, logradouro, numero, bairro,
                            referencia, cep, subprefeitura, lat, lng}, ... ]
Embutido em JS para o site abrir direto do arquivo (file://) sem servidor.
"""
import csv, json, os

SRC = 'feiras_geo.csv' if os.path.exists('feiras_geo.csv') else 'feiras_limpo.csv'
OUT = os.path.join('..', 'site', 'feiras-data.js')
CAMPOS = ['id', 'dia', 'categoria', 'logradouro', 'numero', 'bairro',
          'referencia', 'cep', 'subprefeitura', 'distrito', 'lat', 'lng']

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
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('window.FEIRAS = ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    com = sum(1 for o in out if o['lat'] is not None)
    print(f'{OUT}: {len(out)} feiras ({com} com coordenada) a partir de {SRC}')

if __name__ == '__main__':
    main()
