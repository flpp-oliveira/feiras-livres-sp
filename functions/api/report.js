// Cloudflare Pages Function — POST /api/report
//
// Recebe o report enviado pelo botão "Reportar erro nesta feira" (ver
// site/app.js, seção "reportar erro de uma feira") e grava no banco D1
// (binding "DB").
//
// Deliberadamente simples: não há moderação nem aplicação automática da
// correção — o report só fica registrado para conferência manual. O que
// procede entra no mapa por data/correcoes.csv (ver README).
//
// Não há anexo de imagem: texto e ponto marcado no mapa bastam para conferir
// uma feira, e imagem traria custo de armazenamento e cuidado de privacidade.
//
// O corpo chega como multipart/form-data, montado pelo FormData do navegador.

const TIPOS_VALIDOS = new Set(["local_errado", "nao_existe", "dia_errado", "outro"]);
const LIMITE_TEXTO = 500;
const JANELA_LIMITE_MINUTOS = 10;
const MAX_REPORTS_NA_JANELA = 5; // por IP, contra abuso básico

// Teto do site inteiro, nas últimas 24 h. O limite por IP não segura muitos
// IPs juntos enchendo o banco; um dia normal tem poucos reports, e este número
// só existe para conter abuso.
const MAX_REPORTS_GLOBAL_DIA = 1000;

// A cidade de São Paulo com folga. Um ponto sugerido fora disto é engano ou
// lixo, e não vale guardar.
const LAT_MIN = -24.1, LAT_MAX = -23.2, LON_MIN = -47.0, LON_MAX = -46.2;

// De onde o envio pode vir. O navegador manda o cabeçalho Origin em todo POST
// feito por página; sem esta conferência, qualquer outro site poderia fazer o
// navegador de quem o visita enviar reports para cá. As prévias de deploy do
// Cloudflare Pages vêm em <hash>.feiras-livres-sp.pages.dev. Sem Origin nenhum
// (curl, script) a conferência não se aplica: os limites de taxa continuam
// valendo.
const SITES = ["feiraslivresp.com.br", "feiras-livres-sp.pages.dev"];
const ORIGENS_LOCAIS = new Set(["http://localhost:8788", "http://127.0.0.1:8788"]);
export function origemPermitida(origem) {
  if (!origem) return true;
  if (ORIGENS_LOCAIS.has(origem)) return true;
  try {
    const u = new URL(origem);
    return u.protocol === "https:" &&
           SITES.some(s => u.hostname === s || u.hostname.endsWith("." + s));
  } catch {
    return false;
  }
}

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// O IP não é guardado: guarda-se um HMAC dele, que serve só para contar
// envios do mesmo endereço nos limites de taxa abaixo.
//
// Um SHA-256 simples não bastaria. São 4,3 bilhões de IPv4 e este código é
// público: calcular o hash de todos leva minutos, e cada report voltaria a
// apontar para um IP. Com HMAC, a conta exige o SEGREDO_IP, que existe só na
// configuração da Cloudflare — nem no repositório, nem no log.
//
// A data do dia entra na mensagem: o mesmo IP gera um valor diferente a cada
// dia, então nem quem tiver o banco consegue seguir uma pessoa ao longo do
// tempo. Os limites olham no máximo 24 h para trás e continuam valendo; a
// virada do dia (UTC) apenas recomeça a contagem.
async function hashIp(ip, segredo) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const dia = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.sign("HMAC", chave, enc.encode(dia + "::" + ip));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Falha do banco: o detalhe vai para o log da Cloudflare, e o formulário
// mostra a mensagem do campo "erro". 503 diz "tente de novo", que é o que se
// espera de uma falha passageira.
function falhaDeServidor(etapa, e) {
  console.error(`report: falha na ${etapa}:`, e && e.message);
  return json({ erro: "não foi possível salvar o report agora, tente de novo em instantes" }, 503);
}

function numOuNull(v) {
  // campo ausente no formulário chega como null, e campo vazio como "".
  // Number() converte os dois para 0, que passaria por Number.isFinite e
  // gravaria a coordenada 0,0 (um ponto no oceano) como se fosse informada.
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function dentroDeSP(lat, lon) {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!origemPermitida(request.headers.get("Origin"))) {
    return json({ erro: "origem não permitida" }, 403);
  }

  const tipoConteudo = request.headers.get("content-type") || "";
  if (!tipoConteudo.includes("multipart/form-data")) {
    return json({ erro: "content-type inválido, esperado multipart/form-data" }, 400);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  const feira = String(form.get("feira") || "").trim();
  const tipo = String(form.get("tipo") || "").trim();
  const texto = String(form.get("texto") || "").trim().slice(0, LIMITE_TEXTO);
  // O nome vem do formulário e quem envia pode trocá-lo: serve só de lembrete
  // para quem revisa. O endereço oficial é o da base, pelo id.
  const nome = String(form.get("nome") || "").trim().slice(0, 200);
  const lat = numOuNull(form.get("lat"));
  const lon = numOuNull(form.get("lon"));
  let latSug = numOuNull(form.get("lat_sugerida"));
  let lonSug = numOuNull(form.get("lon_sugerida"));

  // id da feira como vem da base da Prefeitura: "1001-4"
  if (!/^\d{1,6}-\d$/.test(feira)) {
    return json({ erro: "feira inválida" }, 400);
  }
  if (!TIPOS_VALIDOS.has(tipo)) {
    return json({ erro: "tipo inválido" }, 400);
  }
  if (tipo === "outro" && !texto) {
    return json({ erro: "descreva o problema" }, 400);
  }
  // ponto sugerido só acompanha "local errado", vem inteiro (lat E lon) e cai
  // dentro da cidade; fora disso é descartado, e o resto do report segue
  if (tipo !== "local_errado" || latSug === null || lonSug === null || !dentroDeSP(latSug, lonSug)) {
    latSug = null;
    lonSug = null;
  }

  // Sem o segredo a rota RECUSA, em vez de voltar calada a um hash que
  // qualquer um reverte. O motivo vai para o log, nunca o valor do segredo.
  if (!env.SEGREDO_IP) {
    console.error("SEGREDO_IP não configurado: report recusado");
    return json({ erro: "servidor sem configuração para receber reports" }, 500);
  }
  if (!env.DB) {
    console.error("banco D1 (binding DB) não configurado: report recusado");
    return json({ erro: "servidor sem configuração para receber reports" }, 500);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
  const ipHash = await hashIp(ip, env.SEGREDO_IP);

  // Limite básico de taxa: sem isso, um script poderia inundar o banco.
  // A janela é calculada pelo próprio SQLite: criado_em é gravado por
  // datetime('now') ("2026-08-31 13:39:51"), formato diferente do ISO do
  // JavaScript ("2026-08-31T13:39:51.000Z"). Como a comparação é textual,
  // misturar os dois faz o filtro nunca casar e o limite não valer nada.
  //
  // Contar e gravar não são uma operação só: k requisições exatamente
  // simultâneas do mesmo IP podem contar antes de qualquer gravação e passar
  // todas, estourando o limite em até k-1. Para conter abuso, basta.
  //
  // Primeiro o limite do IP, que lê só os últimos 10 minutos. O teto do dia lê
  // as linhas de 24 h, e o banco cobra por linha lida: contado para todo envio,
  // um IP já bloqueado poderia gastar a cota diária só levando 429.
  try {
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM reports
        WHERE ip_hash = ? AND criado_em >= datetime('now', ?)`
    ).bind(ipHash, `-${JANELA_LIMITE_MINUTOS} minutes`).all();
    if ((results?.[0]?.n ?? 0) >= MAX_REPORTS_NA_JANELA) {
      return json({ erro: "muitos reports em pouco tempo, tente novamente mais tarde" }, 429);
    }
    const { results: dia } = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM reports WHERE criado_em >= datetime('now', '-1 day')`
    ).all();
    if ((dia?.[0]?.n ?? 0) >= MAX_REPORTS_GLOBAL_DIA) {
      return json({ erro: "o site recebeu muitos reports hoje, tente novamente mais tarde" }, 429);
    }
  } catch (e) {
    return falhaDeServidor("contagem dos limites", e);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO reports
         (feira, nome, tipo, texto, lat, lon, lat_sugerida, lon_sugerida, ip_hash, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(feira, nome, tipo, texto, lat, lon, latSug, lonSug, ipHash).run();
  } catch (e) {
    return falhaDeServidor("gravação do report", e);
  }

  // O código de conexão só serve aos limites acima, que olham no máximo 24 h
  // para trás. Passados 2 dias ele não protege mais nada, então sai — e sai
  // aqui, a cada report recebido, porque as Pages Functions não têm
  // agendamento e um comando manual dependeria de alguém lembrar de rodar.
  // É o prazo que a página de Privacidade promete.
  // A limpeza falhar não desfaz o report já gravado: fica para o próximo.
  try {
    await env.DB.prepare(
      `UPDATE reports SET ip_hash = NULL
        WHERE ip_hash IS NOT NULL AND criado_em < datetime('now', '-2 days')`
    ).run();
  } catch (e) {
    console.error("falha ao apagar códigos de conexão antigos:", e && e.message);
  }

  return json({ ok: true });
}

// GET só existe para checagem manual/humana de que a rota está viva; não
// expõe dado nenhum do banco.
export async function onRequestGet() {
  return json({ ok: true, rota: "POST /api/report" });
}
