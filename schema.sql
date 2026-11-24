-- Banco D1 do site: os reports de erro enviados pela população, a contagem
-- anônima das buscas que o mapa não soube responder e quantas vezes cada botão
-- foi usado por dia. Não guarda nada além disso; o mapa em si é 100% estático.
--
-- As tabelas de contagem são WITHOUT ROWID: a chave é a própria linha, e cada
-- soma grava uma linha só (a cota diária de gravações é da conta inteira).
--
-- Aplicar com:
--   wrangler d1 execute feiras-livres-reports --local --file=schema.sql    (nesta máquina)
--   wrangler d1 execute feiras-livres-reports --remote --file=schema.sql   (produção)

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feira TEXT NOT NULL,              -- id da feira na base da Prefeitura ("1001-4")
  nome TEXT,                        -- endereço, bairro e dia no momento do report
                                     -- (guardado à parte: se a base for atualizada
                                     -- depois, o report continua legível sozinho)
  tipo TEXT NOT NULL,               -- local_errado | nao_existe | dia_errado | outro
  texto TEXT,                       -- detalhe escrito por quem enviou, opcional, até 500 caracteres
  lat REAL,                         -- coordenada exibida no momento do report
  lon REAL,                         -- (onde o pino estava, não sugestão de novo local)
  lat_sugerida REAL,                -- ponto marcado pelo usuário no mapa, só em "local_errado"
  lon_sugerida REAL,
  ip_hash TEXT,                     -- código calculado do IP, só para limite de taxa contra abuso
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_feira ON reports(feira);
CREATE INDEX IF NOT EXISTS idx_reports_criado_em ON reports(criado_em);

-- Buscas sem resposta (functions/api/busca.js): só o termo, sem número e sem
-- nada de quem buscou, somado por dia. Some depois de 365 dias.
CREATE TABLE IF NOT EXISTS buscas (
  termo TEXT NOT NULL,              -- sem acento, números viram "#" ("rua harmonia #")
  tipo TEXT NOT NULL,               -- nada | parecido | endereco
  dia TEXT NOT NULL,                -- "2026-11-22" (UTC)
  vezes INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (termo, tipo, dia)
) WITHOUT ROWID;

-- quantas buscas o dia já recebeu: o teto contra abuso lê só esta linha
CREATE TABLE IF NOT EXISTS buscas_dia (
  dia TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- Botões usados (functions/api/contagem.js): só o total por dia, sem nada de
-- quem tocou. Os nomes estão em site/js/contagem.js (EVENTOS).
CREATE TABLE IF NOT EXISTS contagens (
  evento TEXT NOT NULL,             -- como_chegar, compartilhar, perto_de_mim…
  dia TEXT NOT NULL,                -- "2026-11-22" (UTC)
  vezes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (evento, dia)
) WITHOUT ROWID;

-- quantos envios de contagem o dia já recebeu (o teto contra abuso)
CREATE TABLE IF NOT EXISTS contagens_dia (
  dia TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
