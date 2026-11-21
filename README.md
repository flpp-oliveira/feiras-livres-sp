# Feiras Livres de São Paulo — Mapa

Mapa interativo com as **976 feiras livres** da cidade de São Paulo: dia da
semana, endereço, categoria, bairro e subprefeitura. Busque por região, filtre
por dia ou categoria, e veja as feiras mais perto de você.

**[feiraslivresp.com.br](https://feiraslivresp.com.br)**

O mapa roda inteiramente no navegador: o desenho, os filtros e a busca não
dependem de servidor. A única parte com back-end é o envio de reports de erro
pela população, descrita adiante.

---

## O que há aqui

| Caminho | O que é |
|---|---|
| `site/` | o site pronto (é o que o Cloudflare Pages publica) |
| `site/404.html` | página de "não encontrada" — com ela o Pages responde 404 de verdade |
| `site/app.js` | o mapa e a tela (módulo; carrega os de `site/js/`) |
| `site/js/` | funções que não dependem da página nem do mapa: texto, dados de uma feira, distâncias, busca |
| `testes/` | testes do site (ver "Testes"); fica fora de `site/` e não vai para o ar |
| `data/feiras_geo.csv` | a base das feiras, a partir do painel da Prefeitura |
| `data/gerar_dados.py` | gera `site/feiras-data.js` a partir da base e aplica `correcoes.csv` |
| `data/gerar_lista.py` | gera `site/lista.html` |
| `data/correcoes.csv` | pontos corrigidos à mão a partir dos reports analisados |
| `functions/api/report.js` | a API que recebe os reports de erro |
| `schema.sql` | a tabela onde os reports são gravados |
| `wrangler.toml` | configuração do Cloudflare Pages (banco D1 dos reports) |

---

## Links compartilháveis

- `/?feira=1001-4` abre o mapa direto no popup daquela feira (é o link do botão
  **Compartilhar** do popup). O parâmetro sai do endereço depois de usado.
- `/?dia=domingo` e `/?categoria=organica` abrem com o filtro ligado. Aceitam
  mais de um valor (`?dia=sabado,domingo`), e `?dia=hoje` vale para o dia em que
  o link for aberto. O endereço acompanha os filtros, então basta copiar o link.

---

## Atualização da base

Ao regenerar `data/feiras_geo.csv`, atualize também `DATA_BASE` em
`data/gerar_dados.py` (é o mês que o rodapé do mapa mostra) e rode, a partir de
`data/`:

```
python gerar_dados.py
python gerar_lista.py
```

---

## Testes

Duas camadas, ambas rodadas a partir da raiz do projeto ou de `testes/`.

**Funções e base** (só precisa do Node 22 ou mais novo, nada a instalar):

```
node --test "testes/*.test.mjs"
```

Cobrem busca, erro de digitação, horário, distância e a própria base: todo
dia e categoria conhecidos, todo id único, toda feira numa zona, nenhum bairro
estragado. Rode depois de regenerar a base.

**O site no celular** (Playwright; na primeira vez, dentro de `testes/`:
`npm install` e `npx playwright install chromium webkit`):

```
cd testes
npm run celular
```

Com o site local rodando (`npx wrangler pages dev`, porta 8788), abre o site
como um Android (Chrome) e como um iPhone (WebKit, o motor do Safari), toca num
pino, busca, usa "Feiras hoje" num domingo e numa segunda, "Perto de mim" na
Paulista e fora de SP, e um link `?feira=`. As fotos de cada passo ficam em
`testes/capturas/`. `npm run celular -- --url https://feiraslivresp.com.br`
testa o site no ar (o contador de visitas fica bloqueado: teste não conta como
visita).

**No Android de verdade**: com o celular no cabo USB, a "Depuração USB" ligada
(Configurações → Sobre o telefone → toque 7 vezes em "Número da versão" →
Opções do desenvolvedor) e o `adb` do Android platform-tools no PATH,
`npm run celular -- --android` roda o mesmo roteiro no Chrome do celular. O
site local chega ao celular pelo próprio cabo (`adb reverse`).

### Versão dos arquivos (`?v=`)

Ao mudar CSS ou JS, suba o número de `?v=` em **todos** os lugares de uma vez:
`site/index.html` e os `import` de `site/app.js` e `site/js/*.js`. Sem isso o
navegador pode juntar um arquivo novo com um módulo antigo guardado.

---

## Reports de erro pela população

Cada popup do mapa traz o link **Reportar erro nesta feira**. Quem conhece o
local pode indicar que o pino está no lugar errado, que a feira não acontece
mais ali, que o dia está errado ou outro problema — e, no caso de lugar errado,
marcar o ponto correto tocando no mapa.

Os envios ficam **registrados para conferência**, sem aplicação automática:
nenhuma correção entra no mapa sozinha. A que procede, depois de analisada à
mão, entra por `data/correcoes.csv` (ver "Conferência dos reports").

Cada report é gravado numa tabela D1 (SQLite). Não há anexo de imagem. O IP não
é guardado: para conter abuso fica só um código calculado dele com uma chave
secreta (HMAC com o `SEGREDO_IP`), que muda todo dia. A cada envio, a rota apaga
esse código dos reports com mais de 2 dias. Ele limita cada conexão a cinco
envios a cada dez minutos; o site inteiro aceita até 1.000 reports por dia.

### Publicação do canal de reports

O site é servido pelo Cloudflare Pages a partir de `site/`, com a função em
`functions/api/report.js`. **Antes do primeiro deploy com estes arquivos** é
preciso criar o banco, preencher o `database_id` no `wrangler.toml` (o valor
que está lá é só um exemplo) e criar o segredo:

```
wrangler d1 create feiras-livres-reports
wrangler d1 execute feiras-livres-reports --remote --file=schema.sql
wrangler pages secret put SEGREDO_IP --project-name feiras-livres-sp
```

O último pede o valor do segredo, que não fica em arquivo nenhum. Sem ele a rota
recusa os reports. O comando grava o segredo só no ambiente de produção; as
prévias de deploy usam outro ambiente (painel do Pages, Settings → Variables and
Secrets, ambiente Preview).

Para rodar tudo localmente, com um banco falso nesta máquina (o segredo local
vai num arquivo `.dev.vars`, fora do git, com uma linha `SEGREDO_IP=qualquer-valor`):

```
wrangler d1 execute feiras-livres-reports --local --file=schema.sql
wrangler pages dev
```

### Conferência dos reports

A conferência é feita à mão. Para listar os reports mais recentes, com o ponto
onde o pino estava (`lat`, `lon`) e o ponto sugerido:

```
wrangler d1 execute feiras-livres-reports --remote --command "SELECT id, feira, nome, tipo, texto, lat, lon, lat_sugerida, lon_sugerida, criado_em FROM reports ORDER BY id DESC LIMIT 50"
```

O `criado_em` está em UTC: um envio feito entre 21h e meia-noite no horário de
Brasília aparece com o dia seguinte.

Se o report procede, a correção vai para `data/correcoes.csv`, uma linha por
feira, com o ponto que o site passa a usar:

```
id;lat;lng;data;motivo
1001-4;-23.55699;-46.62845;2026-11-15;Pino uma quadra ao sul; a feira ocupa o trecho entre as ruas X e Y
```

O `gerar_dados.py` aplica as linhas depois de ler a base, que continua sendo a
da Prefeitura: só o que vai para o site muda. Cada correção aparece no progresso
com a distância do ponto movido, e ganha um "CONFIRA" quando anda mais de 1 km
(costuma ser dígito trocado). Uma linha cuja feira não está na base atual não é
aplicada, e uma cujo ponto a base já passou a declarar (a até 30 m) é avisada
para sair do arquivo. O script para, com a linha indicada, diante de cabeçalho
errado, feira repetida ou coordenada fora da cidade. Depois é regerar
(`python gerar_dados.py`) e publicar. O arquivo não leva nada de quem enviou o
report: é o registro permanente da decisão.

Feita a análise, e aplicada a correção quando houver, o report é apagado, como
promete a página de Privacidade:

```
wrangler d1 execute feiras-livres-reports --remote --command "DELETE FROM reports WHERE id = <id>"
```

Um pedido de remoção recebido por e-mail segue o mesmo caminho, mesmo antes da
análise. O código de conexão (`ip_hash`) não precisa de limpeza à mão: a própria
rota o apaga dos reports com mais de 2 dias a cada envio.

---

## Créditos

- Dados: Prefeitura de São Paulo — [Feiras Livres](https://prefeitura.sp.gov.br/web/sesana/w/feiras-livres-sp).
- Mapa base: © OpenStreetMap, © OpenMapTiles, servido pelo [OpenFreeMap](https://openfreemap.org/) (vetorial, sem chave).
  Biblioteca: [MapLibre GL JS](https://maplibre.org/) 5.24.1, copiada em `site/vendor/maplibre/`.
