# -*- coding: utf-8 -*-
"""
Limpa e normaliza a planilha oficial de feiras livres de SP (set/2024)
gerando feiras_limpo.csv pronto para geocodificação.
Fonte: capital.sp.gov.br/documents/d/abastecimento/feiras_livres_sp_setembro_2024-xlsx
"""
import openpyxl, csv, re, sys, os

SRC = os.environ.get('XLSX', 'feiras.xlsx')
OUT = 'feiras_limpo.csv'

# --- mapas de normalização ---
TIPO = {
    'RUA': 'Rua', 'AV': 'Avenida', 'PÇ': 'Praça', 'PC': 'Praça',
    'AL': 'Alameda', 'TV': 'Travessa', 'LG': 'Largo', 'ES': 'Estrada',
    'PQ': 'Parque', 'CALCADÃO': 'Calçadão', 'CALÇADÃO': 'Calçadão',
}
# variações de subprefeitura -> nome canônico (uppercase da planilha)
SUBPREF_FIX = {
    'SAO MIGUEL PAULISTA': 'SAO MIGUEL',
    'SÃO MATEUS': 'SAO MATEUS',
}
# nome de exibição das 32 subprefeituras (conjunto fechado, com acentos)
SUBPREF_DISPLAY = {
    'ARICANDUVA I FORMOSA I CARRAO': 'Aricanduva/Formosa/Carrão',
    'BUTANTA': 'Butantã',
    'CAMPO LIMPO': 'Campo Limpo',
    'CAPELA DO SOCORRO': 'Capela do Socorro',
    'CASA VERDE / CACHOEIRINHA': 'Casa Verde/Cachoeirinha',
    'CIDADE ADEMAR': 'Cidade Ademar',
    'CIDADE TIRADENTES': 'Cidade Tiradentes',
    'ERMELINO MATARAZZO': 'Ermelino Matarazzo',
    'FREGUESIA / BRASILANDIA': 'Freguesia/Brasilândia',
    'GUAIANASES': 'Guaianases',
    'IPIRANGA': 'Ipiranga',
    'ITAIM PAULISTA': 'Itaim Paulista',
    'ITAQUERA': 'Itaquera',
    'JABAQUARA': 'Jabaquara',
    'JACANA / TREMENBE': 'Jaçanã/Tremembé',
    'LAPA': 'Lapa',
    'M BOI MIRIM': "M'Boi Mirim",
    'MOOCA': 'Mooca',
    'PARELHEIROS': 'Parelheiros',
    'PENHA': 'Penha',
    'PERUS': 'Perus',
    'PINHEIROS': 'Pinheiros',
    'PIRITUBA / JARAGUA': 'Pirituba/Jaraguá',
    'SANTANA / TUCURUVI': 'Santana/Tucuruvi',
    'SANTO AMARO': 'Santo Amaro',
    'SAO MATEUS': 'São Mateus',
    'SAO MIGUEL': 'São Miguel',
    'SAPOPEMBA': 'Sapopemba',
    'SE': 'Sé',
    'V MARIA / VILA GUILHERME': 'Vila Maria/Vila Guilherme',
    'VILA MARIANA': 'Vila Mariana',
    'VILA PRUDENTE': 'Vila Prudente',
}
# abreviações comuns dentro de logradouros/bairros
ABREV = {
    'PROF': 'Professor', 'PROFA': 'Professora', 'DR': 'Doutor', 'DRA': 'Doutora',
    'CEL': 'Coronel', 'CAP': 'Capitão', 'GEN': 'General', 'MAL': 'Marechal',
    'SGT': 'Sargento', 'PE': 'Padre', 'DOM': 'Dom', 'VER': 'Vereador',
    'DEP': 'Deputado', 'DES': 'Desembargador', 'DESEM': 'Desembargador',
    'ENG': 'Engenheiro', 'CMTE': 'Comandante', 'COMEN': 'Comendador',
    'VISC': 'Visconde', 'MARQ': 'Marquês', 'BR': 'Barão', 'CONS': 'Conselheiro',
    'ALM': 'Almirante', 'BRIG': 'Brigadeiro', 'PRES': 'Presidente',
    'GOV': 'Governador', 'SEN': 'Senador', 'MIN': 'Ministro',
    'STA': 'Santa', 'STO': 'Santo', 'SÃO': 'São', 'SAO': 'São',
    'NSA': 'Nossa', 'SRA': 'Senhora',
    'JD': 'Jardim', 'VL': 'Vila', 'CID': 'Cidade', 'CJ': 'Conjunto',
    'CONJ': 'Conjunto', 'RES': 'Residencial', 'PROL': 'Prolongamento',
}
CONECTIVOS = {'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'a', 'o', 'à'}

def clean_ws(s):
    return re.sub(r'\s+', ' ', str(s).strip()) if s is not None else ''

def title_pt(s, expand=True):
    """Title Case respeitando conectivos; expande abreviações se expand=True."""
    out = []
    for i, tok in enumerate(s.split(' ')):
        if not tok:
            continue
        up = tok.upper().rstrip('.')
        if expand and up in ABREV:
            out.append(ABREV[up])
        elif tok.lower() in CONECTIVOS and i > 0:
            out.append(tok.lower())
        elif re.fullmatch(r'[IVX]+', up):        # numeral romano (Aricanduva I ...)
            out.append(up)
        elif any(ch.isdigit() for ch in tok):    # números / 2A etc
            out.append(tok.upper())
        else:
            out.append(tok.capitalize())
    return ' '.join(out)

def norm_num(s):
    s = clean_ws(s).upper().replace(' ', '')
    if s in ('', 'S/N', 'SN', 'SN.', '0'):
        return 'S/N'
    return s

def norm_cep(s):
    d = re.sub(r'\D', '', clean_ws(s))
    if len(d) == 8:
        return f'{d[:5]}-{d[5:]}'
    return clean_ws(s)  # deixa como está se fora do padrão

def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['Plan1']
    rows = [r for r in ws.iter_rows(values_only=True)]
    data = [r for r in rows[1:] if r[0] not in (None, '')]

    out_rows = []
    for r in data:
        cod   = clean_ws(r[0])
        dia   = clean_ws(r[1])
        cat   = clean_ws(r[2])
        tipo_raw = clean_ws(r[3]).upper()
        logr_raw = clean_ws(r[4])
        num   = norm_num(r[5])
        bairro_raw = clean_ws(r[6])
        ref   = clean_ws(r[7])
        cep   = norm_cep(r[8])
        subp_raw = clean_ws(r[9]).upper()

        tipo = TIPO.get(tipo_raw, title_pt(tipo_raw, expand=False))
        logr_raw = re.sub(r'\s*C/\s*', ' com ', logr_raw, flags=re.I)  # esquina
        logradouro = title_pt(logr_raw)
        bairro = title_pt(bairro_raw)
        referencia = title_pt(ref) if ref else ''
        subp_canon = SUBPREF_FIX.get(subp_raw, subp_raw)
        subprefeitura = SUBPREF_DISPLAY.get(subp_canon, title_pt(subp_canon, expand=False))

        # endereço para exibição
        partes = [f'{tipo} {logradouro}']
        if num != 'S/N':
            partes.append(num)
        partes.append(bairro)
        endereco_completo = ', '.join(partes)

        # string otimizada p/ geocodificação (só a 1ª via em esquinas "com")
        via = re.split(r'\s+com\s+|\s+c/\s+', logradouro, flags=re.I)[0].strip()
        geo = [f'{tipo} {via}']
        if num != 'S/N':
            geo.append(num)
        geo += [bairro, 'São Paulo - SP']
        if re.match(r'\d{5}-\d{3}', cep):
            geo.append(cep)
        endereco_geocode = ', '.join(geo)

        out_rows.append({
            'id': cod,
            'dia': dia,
            'categoria': cat,
            'tipo_logradouro': tipo,
            'logradouro': logradouro,
            'numero': num,
            'bairro': bairro,
            'referencia': referencia,
            'cep': cep,
            'subprefeitura': subprefeitura,
            'endereco_completo': endereco_completo,
            'endereco_geocode': endereco_geocode,
            'lat': '',
            'lng': '',
            'geocode_status': '',
        })

    cols = ['id','dia','categoria','tipo_logradouro','logradouro','numero','bairro',
            'referencia','cep','subprefeitura','endereco_completo','endereco_geocode',
            'lat','lng','geocode_status']
    with open(OUT, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out_rows)

    # ---- relatório ----
    from collections import Counter
    print(f'OK -> {OUT}  ({len(out_rows)} feiras)')
    print('Subprefeituras apos merge:', len(set(x["subprefeitura"] for x in out_rows)))
    sn = sum(1 for x in out_rows if x['numero'] == 'S/N')
    print(f'Sem numero (S/N): {sn}  |  Com numero: {len(out_rows)-sn}')
    badcep = sum(1 for x in out_rows if not re.match(r'\d{5}-\d{3}', x['cep']))
    print(f'CEP fora do padrao/vazio: {badcep}')
    print('Dias:', dict(Counter(x['dia'] for x in out_rows)))
    print('Categorias:', dict(Counter(x['categoria'] for x in out_rows)))

if __name__ == '__main__':
    main()
