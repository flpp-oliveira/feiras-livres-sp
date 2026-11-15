-- Banco D1 do site — só a tabela de reports de erro enviados pela população.
-- Não guarda nada além disso; o mapa em si é 100% estático.
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
