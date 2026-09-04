# -*- coding: utf-8 -*-
"""
Extrai os dados oficiais do painel Power BI da Prefeitura de SP (Feiras
Livres) e gera pbi_feiras.csv -- a base usada por combinar_fontes.py.

O painel publico (app.powerbi.com/view?r=...) carrega os dados batendo numa
API do Power BI (wabi-*.analysis.windows.net/public/reports/querydata) usando
a chave de recurso que vem embutida na propria URL publica. Este script bate
nessa API diretamente, sem abrir navegador.

A resposta vem num formato compacto (DSR: dicionarios de valores + delta
encoding entre linhas) que o Power BI usa pra economizar banda. A funcao
_decodifica_dsr() reverte isso pra linhas normais.

Fonte do painel: https://app.powerbi.com/view?r=<RESOURCE_KEY>
Tabela usada: "Feiras PBI - drive" (contem Latitude/Longitude/Categoria/Dia/
Endereco/Subprefeitura como colunas reais no modelo -- nao e geocodificacao
automatica do visual de mapa).
Chave de juncao com feiras_limpo.csv: N.Feira, no formato "NNNN-D".

Atualizado mensalmente pela prefeitura -- reexecute este script quando for
atualizar os dados (ver README, secao "Atualizar os dados"), depois rode
combinar_fontes.py.
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

COLUNAS = ["N.Feira", "Latitude", "Longitude", "Categoria", "Dia da semana", "Endereço", "Subprefeitura"]
NOMES_SAIDA = ["id", "lat", "lng", "categoria_pbi", "dia_pbi", "endereco_pbi", "subprefeitura_pbi"]


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


def _decodifica_dsr(dm0, vdicts, n_colunas):
    """Reverte o delta-encoding do Power BI: cada linha traz so os valores que
    MUDARAM desde a anterior; 'R' e uma mascara de bits marcando quais colunas
    repetem o valor da linha de cima. Colunas cujo valor e string (nao int)
    ja vieram por extenso -- acontece quando o dicionario da coluna estoura
    (Power BI so guarda os primeiros N valores distintos no dicionario)."""
    def resolve(val, dictkey):
        if dictkey is None or isinstance(val, str):
            return val
        return vdicts[dictkey][val]

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
    """10014 (int do Power BI) -> "1001-4" (formato usado em feiras_limpo.csv)."""
    s = str(n_feira).zfill(5)
    return s[:-1] + "-" + s[-1]


def main():
    resp = _consultar()
    dsr = resp["results"][0]["result"]["data"]["dsr"]
    ds0 = dsr["DS"][0]
    dm0 = ds0["PH"][0]["DM0"]
    vdicts = ds0.get("ValueDicts", {})

    n = len(COLUNAS)
    dictfor = {0: None, 1: None, 2: None}  # N.Feira, Latitude, Longitude sao numericas
    for i in range(3, n):
        dictfor[i] = f"D{i - 3}"  # Categoria->D0, Dia->D1, Endereco->D2, Subprefeitura->D3

    def resolve(val, i):
        dictkey = dictfor[i]
        if dictkey is None or isinstance(val, str):
            return val
        return vdicts[dictkey][val]

    linhas = _decodifica_dsr(dm0, vdicts, n_colunas=n)

    out_rows = []
    for vals in linhas:
        vals = [resolve(v, i) for i, v in enumerate(vals)]
        n_feira, lat, lon, categoria, dia, endereco, subprefeitura = vals
        out_rows.append({
            "id": _para_id_com_hifen(n_feira), "lat": lat, "lng": lon,
            "categoria_pbi": categoria, "dia_pbi": dia,
            "endereco_pbi": endereco, "subprefeitura_pbi": subprefeitura,
        })

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=NOMES_SAIDA)
        w.writeheader()
        w.writerows(out_rows)

    print(f"{OUT}: {len(out_rows)} feiras extraidas do painel oficial da prefeitura")


if __name__ == "__main__":
    main()
