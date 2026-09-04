# Feiras Livres de São Paulo — Mapa

Mapa interativo com as **968 feiras livres** da cidade de São Paulo: dia da
semana, endereço, categoria e subprefeitura. Site estático (HTML/CSS/JavaScript
puro + [Leaflet](https://leafletjs.com/)), sem build e sem back-end.

Fonte dos dados: Prefeitura de São Paulo / SMSUB (setembro/2024).

---

## Estrutura

```
feiras-livres-sp/
├── site/                 → a aplicação publicável (é só isto que vai pro ar)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── feiras-data.js    → os dados embutidos (gerado pelo pipeline)
│   ├── fonts/            → fontes self-hosted (Fraunces + Plus Jakarta Sans)
│   └── vendor/leaflet/   → Leaflet self-hosted (sem CDN)
└── data/                 → a "cozinha": pipeline que gera feiras-data.js
    ├── feiras.xlsx       → planilha oficial da prefeitura (fonte-mãe)
    ├── *.py              → scripts do pipeline (ver abaixo)
    ├── pbi_coords.csv    → coordenadas do painel oficial da prefeitura (fonte prioritária)
    ├── mymaps_coords.csv → coordenadas do Google My Maps (1º fallback)
    └── ...
```

O site é 100% first-party: abre até por `file://`, mas o ideal é servir por HTTP.

---

## Rodar localmente

Qualquer servidor estático serve a pasta `site/`. Com Python:

```bash
python -m http.server 5173 --directory site
```

Depois abra <http://localhost:5173>. Para parar: `Ctrl + C`.

> Se editar `index.html`/`style.css`/`app.js`/`feiras-data.js`, incremente o
> `?v=NN` no fim das URLs dentro do `index.html` (cache-busting) e recarregue
> com `Ctrl + Shift + R`. Quando o site for publicado num host com hash de
> arquivos, esse versionamento manual pode ser aposentado.

---

## Atualizar os dados (quando sair uma planilha nova)

Os dados são de **set/2024** e vão envelhecer. Quando a prefeitura publicar uma
versão nova, este é o caminho. Rode tudo **de dentro da pasta `data/`**.

### Pré-requisitos

```bash
pip install openpyxl shapely
```

(Os scripts de geocodificação usam só a biblioteca padrão do Python.)

Os scripts que chamam o Nominatim/OSM pedem um contato (exigência da política
de uso). Defina a variável `OSM_CONTACT` **antes** de rodá-los — assim seu
e-mail nunca fica no código:

```bash
# Windows (cmd):
set OSM_CONTACT=seu-email@exemplo.com
# PowerShell:
$env:OSM_CONTACT = "seu-email@exemplo.com"
# Linux/macOS:
export OSM_CONTACT=seu-email@exemplo.com
```

### O fluxo

```
feiras.xlsx
   │  limpar_feiras.py
   ▼
feiras_limpo.csv  ──────────────────┐
   │                                │ (coordenadas, em cascata)
   │  geocodificar.py               │
   ▼                                │
pbi_coords.csv       ┐              │
geocode_cache.json   │              │
mymaps_coords.csv    ├─ merge_coords.py ─► feiras_geo.csv
cep_coords*.json     ┘                          │
   ▲                                            │  adicionar_distrito.py
   │ resgatar_cep.py / resgatar_cep2.py         ▼  (+ distritos.geojson)
   └───────── (feiras ainda sem coord) ◄── feiras_geo.csv (com distrito)
                                                │  gerar_dados.py
                                                ▼
                                      site/feiras-data.js
```

### Passo a passo

1. **Baixar a planilha nova** e salvar como `data/feiras.xlsx`
   (fonte: <https://capital.sp.gov.br/web/abastecimento> → Feiras Livres).

2. **Limpar e normalizar** — gera `feiras_limpo.csv`
   (Title Case, expande abreviações, padroniza subprefeituras, CEP e número):
   ```bash
   python limpar_feiras.py
   ```

3. **Obter as coordenadas.** Há quatro fontes, combinadas por prioridade:

   - **Painel oficial da Prefeitura** (Power BI, atualizado mensalmente,
     prioridade máxima) → `pbi_coords.csv`. A tabela do painel guarda
     Latitude/Longitude como colunas reais (não é geocodificação automática
     do visual de mapa). Reexecute quando quiser atualizar:
     ```bash
     python atualizar_pbi_coords.py
     ```
     (Não precisa rodar toda vez — só quando o painel tiver dado atualizado.
     Bate direto na API pública do relatório, sem abrir navegador.)
   - **Google My Maps** (1º fallback, para feiras sem match no painel) →
     `mymaps_coords.csv`. Passo manual: importar as feiras no
     [My Maps](https://mymaps.google.com), deixar o Google geocodificar e
     exportar as coordenadas para esse CSV (`id,lat,lng`).
   - **Nominatim / OpenStreetMap** (2º fallback, automático, gratuito,
     1 req/s) → preenche `geocode_cache.json`:
     ```bash
     python geocodificar.py      # pode interromper e retomar; usa cache
     ```
   - **Combinar tudo** em `feiras_geo.csv` (painel da prefeitura tem
     prioridade; Google, Nominatim e CEP tapam os buracos, nessa ordem):
     ```bash
     python merge_coords.py
     ```

4. **Resgatar as feiras que sobraram sem coordenada** (as invisíveis no mapa e
   na busca). Duas passadas por CEP e, no fim, re-combinar:
   ```bash
   python resgatar_cep.py    # BrasilAPI + ViaCEP/Nominatim -> cep_coords.json
   python resgatar_cep2.py   # AwesomeAPI                    -> cep_coords2.json
   python merge_coords.py    # dobra os resgates no feiras_geo.csv
   ```
   O `merge_coords.py` valida se cada ponto cai dentro do município de SP
   (bounding box) e descarta o que estiver fora.

5. **Atribuir o distrito** por geometria (ponto-dentro-de-polígono dos 96
   distritos oficiais). Requer `shapely` e o `distritos.geojson`:
   ```bash
   python adicionar_distrito.py
   ```
   > `distritos.geojson` (7 MB) **não está no repositório** — baixe de novo do
   > GeoSampa / [codigourbano/distritos-sp](https://github.com/codigourbano/distritos-sp)
   > e coloque em `data/`.

6. **Gerar os arquivos do site**:
   ```bash
   python gerar_dados.py       # escreve ../site/feiras-data.js (dados do mapa)
   python gerar_lista.py       # escreve ../site/lista.html (pagina de SEO por bairro)
   ```

7. **Publicar a mudança**: incremente o `?v=NN` no `index.html`, teste local e
   faça o commit.

### Se as coordenadas não precisarem mudar

Se só quiser regenerar os arquivos do site a partir do `feiras_geo.csv` que já
existe (ex.: mexeu num campo de exibição), basta o último passo:

```bash
python gerar_dados.py
python gerar_lista.py
```

> `lista.html` é a página de texto rastreável pelo Google (todas as feiras por
> zona/bairro, com endereço e dia — **sem coordenadas**, de propósito).

### Estado atual

As **968 feiras estão com coordenada** — nenhuma invisível no momento. Os
passos 3–4 acima só voltam a ser necessários quando entrarem feiras novas.

---

## Publicação

A pasta `site/` é autossuficiente e pode ir para qualquer host estático
(GitHub Pages, Cloudflare Pages, Netlify...). O `.gitignore` já mantém fora do
repositório os arquivos pesados e regeneráveis de `data/` (geojson, KML cru,
viewers antigos, logs).

---

## Créditos

- Dados das feiras: **Prefeitura de São Paulo / SMSUB** (set/2024).
- Coordenadas: painel oficial da Prefeitura (Power BI, atualizado mensalmente),
  com Google (via My Maps), OpenStreetMap e CEP como fallback — podem ter
  imprecisão.
- Mapa base: © OpenStreetMap. Biblioteca: Leaflet.
