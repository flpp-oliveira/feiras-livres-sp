# -*- coding: utf-8 -*-
"""
Extrai os dados oficiais do painel "Feiras Livres" da Prefeitura de SP e gera
pbi_feiras.csv -- unica fonte de dados do site (ver preparar_feiras.py).

O painel publico (app.powerbi.com/view?r=...) carrega os dados batendo numa
API do Power BI (wabi-*.analysis.windows.net/public/reports/querydata) usando
a chave de recurso que vem embutida na propria URL publica. Este script bate
nessa API diretamente, sem abrir navegador.

A resposta vem num formato compacto (DSR: dicionarios de valores + delta
encoding entre linhas) que o Power BI usa pra economizar banda. A funcao
_decodifica_dsr() reverte isso pra linhas normais.

A tabela "Feiras PBI - drive" guarda Bairro, CEP, Latitude e Longitude como
colunas reais no modelo (confirmado via conceptualschema, nao so pelos
graficos do relatorio -- nenhum visual usa Bairro/CEP, mas a coluna existe).
So "Numero" nao existe separado -- fica embutido no texto de Endereco.
Chave: N.Feira, no formato "NNNN-D".

Atualizado mensalmente pela prefeitura -- reexecute quando for atualizar os
dados (ver README), depois rode preparar_feiras.py.
"""
import csv
import json
import urllib.request

RESOURCE_KEY = "8676dcf3-2da6-49f7-94e1-32a5aa441ef1"
DATASET_ID = "af780080-b39c-4c3f-81f4-b333d5ededcb"
MODEL_ID = 11570776
REPORT_ID = "13861665"
VISUAL_ID = "93ff4e9307ca8b0adb6c"  # id interno do visual de mapa no relatorio
QUERYDATA_URL = "https://wabi-brazil-south-api.analysis.windows.net/public/reports/querydata?synchronous=true"
OUT = "pbi_feiras.csv"

COLUNAS = ["N.Feira", "Latitude", "Longitude", "Categoria", "Dia da semana",
           "Endereço", "Bairro", "CEP", "Subprefeitura"]
NOMES_SAIDA = ["id", "lat", "lng", "categoria", "dia", "endereco_pbi", "bairro", "cep", "subprefeitura"]


def _corpo_da_consulta():
    """Consulta reconstruida a partir do prototypeQuery do visual de mapa
    (obtido via modelsAndExploration), pedindo as colunas acima direto da
    tabela "Feiras PBI - drive" (sem agregacao, uma linha por feira)."""
    selects = [
        {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": col}, "Name": f"f.{i}"}
        for i, col in enumerate(COLUNAS)
    ]
    proto = {
        "Version": 2,
        "From": [{"Name": "f", "Entity": "Feiras PBI - drive", "Type": 0}],
        "Select": selects,
    }
    return {
        "version": "1.0.0",
        "queries": [{
            "Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
                "Query": proto,
                "Binding": {
                    "Primary": {"Groupings": [{"Projections": list(range(len(COLUNAS)))}]},
                    "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": 2000}}},
                    "Version": 1,
                },
            }}]},
            "QueryId": "",
            "ApplicationContext": {
                "DatasetId": DATASET_ID,
                "Sources": [{"ReportId": REPORT_ID, "VisualId": VISUAL_ID}],
            },
        }],
        "cancelQueries": [],
        "modelId": MODEL_ID,
    }


def _consultar():
    body = json.dumps(_corpo_da_consulta()).encode("utf-8")
    req = urllib.request.Request(
        QUERYDATA_URL,
        data=body,
        headers={
            "X-PowerBI-ResourceKey": RESOURCE_KEY,
            "Content-Type": "application/json;charset=UTF-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def _decodifica_dsr(dm0, n_colunas):
    """Reverte o delta-encoding do Power BI: cada linha traz so os valores que
    MUDARAM desde a anterior; 'R' e uma mascara de bits marcando quais colunas
    repetem o valor da linha de cima."""
    prev = [None] * n_colunas
    linhas = []
    for entrada in dm0:
        c = entrada["C"]
        r = entrada.get("R", 0)
        vals = [None] * n_colunas
        ci = 0
        for i in range(n_colunas):
            if r & (1 << i):
                vals[i] = prev[i]
            else:
                vals[i] = c[ci]
                ci += 1
        prev = vals
        linhas.append(vals)
    return linhas


def _para_id_com_hifen(n_feira):
    """10014 (int do Power BI) -> "1001-4" (formato usado no site)."""
    s = str(n_feira).zfill(5)
    return s[:-1] + "-" + s[-1]


def main():
    resp = _consultar()
    dsr = resp["results"][0]["result"]["data"]["dsr"]
    ds0 = dsr["DS"][0]
    dm0 = ds0["PH"][0]["DM0"]
    vdicts = ds0.get("ValueDicts", {})

    n = len(COLUNAS)
    # N.Feira, Latitude, Longitude sao numericas (sem dicionario); o resto usa
    # dicionario de valores (D0, D1, D2... na ordem em que aparecem)
    dictfor = {0: None, 1: None, 2: None}
    for i in range(3, n):
        dictfor[i] = f"D{i - 3}"

    def resolve(val, i):
        dictkey = dictfor[i]
        if dictkey is None or isinstance(val, str):
            return val
        return vdicts[dictkey][val]

    linhas = _decodifica_dsr(dm0, n_colunas=n)

    out_rows = []
    for vals in linhas:
        vals = [resolve(v, i) for i, v in enumerate(vals)]
        n_feira, lat, lon, categoria, dia, endereco, bairro, cep, subprefeitura = vals
        out_rows.append({
            "id": _para_id_com_hifen(n_feira), "lat": lat, "lng": lon,
            "categoria": categoria, "dia": dia, "endereco_pbi": endereco,
            "bairro": bairro, "cep": cep, "subprefeitura": subprefeitura,
        })

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=NOMES_SAIDA)
        w.writeheader()
        w.writerows(out_rows)

    print(f"{OUT}: {len(out_rows)} feiras extraidas do painel oficial da prefeitura")


if __name__ == "__main__":
    main()
