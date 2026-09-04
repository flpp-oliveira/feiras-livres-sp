# Feiras Livres de São Paulo — Mapa

Mapa interativo com as **975 feiras livres** da cidade de São Paulo: dia da
semana, endereço, categoria e subprefeitura. Site estático (HTML/CSS/JavaScript
puro + [Leaflet](https://leafletjs.com/)), sem build e sem back-end.

Fonte dos dados: painel oficial "Feiras Livres" da Prefeitura de São Paulo
(Power BI, atualizado mensalmente). A planilha antiga (SMSUB, set/2024) ainda
é usada para enriquecer 960 dessas 975 com Bairro/CEP/Número — ver
[Atualizar os dados](#atualizar-os-dados-quando-o-painel-tiver-dado-novo).

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
    ├── pbi_feiras.csv    → extrato do painel oficial (fonte-mãe: id, lat/lng,
    │                       categoria, dia, endereço, subprefeitura)
    ├── feiras.xlsx       → planilha antiga da prefeitura (só p/ enriquecer
    │                       Bairro/CEP/Número de quem já existia em set/2024)
    ├── feiras_limpo.csv  → planilha antiga, limpa e normalizada
    └── *.py              → scripts do pipeline (ver abaixo)
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

## Atualizar os dados (quando o painel tiver dado novo)

O painel da prefeitura é atualizado mensalmente. Este é o caminho pra puxar
uma atualização. Rode tudo **de dentro da pasta `data/`**.

Não tem mais cascata de geocodificação (Google/Nominatim/CEP) — essa era a
solução de quando não existia fonte oficial com coordenada pronta. Hoje a
lista de feiras **é** a do painel; a planilha antiga só empresta Bairro/CEP/
Número pra quem já existia nela.

### Pré-requisitos

```bash
pip install openpyxl shapely
```

### O fluxo

```
pbi_feiras.csv  ┐
                ├─ combinar_fontes.py ─► feiras_geo.csv ─► adicionar_distrito.py ─► gerar_dados.py ─► site/feiras-data.js
feiras_limpo.csv┘                                              (+ distritos.geojson)
     ▲
     │ limpar_feiras.py
feiras.xlsx (planilha antiga, so p/ enriquecer)
```

### Passo a passo

1. **Puxar o painel atualizado** — bate direto na API pública do relatório
   Power BI (sem abrir navegador) e gera `pbi_feiras.csv`:
   ```bash
   python atualizar_pbi_coords.py
   ```

2. **Combinar com a planilha antiga** (Bairro/CEP/Número de quem já existia
   em set/2024; quem é novo no painel entra só com o que o painel tem):
   ```bash
   python combinar_fontes.py
   ```

3. **Atribuir o distrito** por geometria (ponto-dentro-de-polígono dos 96
   distritos oficiais). Requer `shapely` e o `distritos.geojson`:
   ```bash
   python adicionar_distrito.py
   ```
   > `distritos.geojson` (7 MB) **não está no repositório** — baixe de novo do
   > GeoSampa / [codigourbano/distritos-sp](https://github.com/codigourbano/distritos-sp)
   > e coloque em `data/`.

4. **Gerar os arquivos do site**:
   ```bash
   python gerar_dados.py       # escreve ../site/feiras-data.js (dados do mapa)
   python gerar_lista.py       # escreve ../site/lista.html (pagina de SEO por bairro)
   ```

5. **Publicar a mudança**: incremente o `?v=NN` no `index.html`, teste local e
   faça o commit.

### Se a planilha antiga (set/2024) sair de circulação de vez

Ela só é usada hoje pra enriquecer Bairro/CEP/Número de 960 das 975 feiras.
Se um dia isso não importar mais, dá pra tirar `feiras.xlsx`/`feiras_limpo.csv`
do fluxo e usar só `pbi_feiras.csv` direto — é só ajustar `combinar_fontes.py`
pra não procurar match na planilha.

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

As **975 feiras do painel estão com coordenada** (960 com dado completo da
planilha antiga, 15 novas só com o que o painel tem — sem Bairro/CEP/Número).

---

## Publicação

A pasta `site/` é autossuficiente e pode ir para qualquer host estático
(GitHub Pages, Cloudflare Pages, Netlify...). O `.gitignore` já mantém fora do
repositório os arquivos pesados e regeneráveis de `data/` (geojson, KML cru,
viewers antigos, logs).

---

## Créditos

- Dados: painel oficial "Feiras Livres" da **Prefeitura de São Paulo** (Power
  BI, atualizado mensalmente), com a planilha SMSUB (set/2024) enriquecendo
  Bairro/CEP/Número de parte das feiras.
- Mapa base: © OpenStreetMap. Biblioteca: Leaflet.
