# -*- coding: utf-8 -*-
"""
Extrai Latitude/Longitude oficiais do painel Power BI da Prefeitura de SP
(Feiras Livres) e gera pbi_coords.csv, no mesmo formato de mymaps_coords.csv
(id,lat,lng) para o merge_coords.py consumir como fonte prioritaria.

O painel publico (app.powerbi.com/view?r=...) carrega os dados batendo numa
API do Power BI (wabi-*.analysis.windows.net/public/reports/querydata) usando
a chave de recurso que vem embutida na propria URL publica. Este script bate
nessa API diretamente, sem abrir navegador.

A resposta vem num formato compacto (DSR: dicionarios de valores + delta
encoding entre linhas) que o Power BI usa pra economizar banda. A funcao
_decodifica_dsr() reverte isso pra linhas normais.

Fonte do painel: https://app.powerbi.com/view?r=<RESOURCE_KEY>
Tabela usada: "Feiras PBI - drive" (contem Latitude/Longitude como colunas
reais no modelo -- nao e geocodificacao automatica do visual de mapa).
Chave de juncao com feiras_limpo.csv: N.Feira, no formato "NNNN-D".

Atualizado mensalmente pela prefeitura -- reexecute este script quando for
atualizar os dados (ver README, secao "Atualizar os dados").
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
OUT = "pbi_coords.csv"


def _corpo_da_consulta():
    """Consulta reconstruida a partir do prototypeQuery do visual de mapa
    (obtido via modelsAndExploration), pedindo N.Feira + Latitude + Longitude
    direto da tabela "Feiras PBI - drive" (sem agregacao, uma linha por feira)."""
    proto = {
        "Version": 2,
        "From": [{"Name": "f", "Entity": "Feiras PBI - drive", "Type": 0}],
        "Select": [
            {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "N.Feira"}, "Name": "f.NFeira"},
            {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Latitude"}, "Name": "f.Latitude"},
            {"Column": {"Expression": {"SourceRef": {"Source": "f"}}, "Property": "Longitude"}, "Name": "f.Longitude"},
        ],
    }
    return {
        "version": "1.0.0",
        "queries": [{
            "Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
                "Query": proto,
                "Binding": {
                    "Primary": {"Groupings": [{"Projections": [0, 1, 2]}]},
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

    linhas = _decodifica_dsr(dm0, vdicts, n_colunas=3)

    out_rows = []
    for n_feira, lat, lon in linhas:
        out_rows.append({"id": _para_id_com_hifen(n_feira), "lat": lat, "lng": lon})

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id", "lat", "lng"])
        w.writeheader()
        w.writerows(out_rows)

    print(f"{OUT}: {len(out_rows)} feiras com coordenada oficial da prefeitura")


if __name__ == "__main__":
    main()
