// Cloudflare Pages Function — POST /api/contagem
//
// Soma quantas vezes cada botão do site foi usado, por dia (ver
// site/js/contagem.js). Chega {"eventos": {"como_chegar": 2, ...}}, os totais
// de uma visita; aqui cada um é somado ao do dia na tabela "contagens", e o
// envio em si não é guardado: nada de IP, horário ou de que toques vieram
// juntos.
//
// Abuso: o banco é o mesmo dos reports, e a cota diária de gravações do plano
// gratuito vale para a conta inteira. Por isso há um teto de envios por dia
// (tabela "contagens_dia"): passou dele, a rota recusa lendo uma linha só.
// Com o site recebendo poucas centenas de visitas por dia, 3.000 é folga; no
// pior caso (todo envio com todos os eventos) são ~54 mil gravações, e sobra
// cota para os reports.

import { origemPermitida } from "./report.js";

// o mesmo conjunto de site/js/contagem.js (os testes conferem)
export const EVENTOS = new Set([
  "ficha_aberta", "como_chegar", "compartilhar", "report_aberto", "report_enviado",
  "perto_de_mim", "feiras_hoje", "filtro_dia", "filtro_tipo", "limpar_filtros",
  "busca_feira", "busca_area", "busca_endereco", "busca_atalho", "lista_perto",
  "convite_sim", "convite_nao",
]);
export const MAX_POR_DIA = 3000;
const MAX_POR_EVENTO = 20;   // por envio: mais que isso numa visita é exagero
const MAX_CORPO = 1000;

function resposta(status) {
  return new Response(null, { status });
}

// {"eventos": {...}} -> [[evento, n], ...] só com nomes conhecidos
export function lerEventos(corpo) {
  const ev = corpo && corpo.eventos;
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return [];
  return Object.keys(ev)
    .filter((k) => EVENTOS.has(k) && Number.isInteger(ev[k]) && ev[k] > 0)
    .map((k) => [k, Math.min(ev[k], MAX_POR_EVENTO)]);
}

export async function onRequestPost({ request, env }) {
  if (!origemPermitida(request.headers.get("Origin"))) return resposta(403);
  if (!env.DB) {
    console.error("banco D1 (binding DB) não configurado: contagem perdida");
    return resposta(503);
  }

  let corpo;
  try {
    const texto = await request.text();
    if (texto.length > MAX_CORPO) return resposta(413);
    corpo = JSON.parse(texto);
  } catch {
    return resposta(400);
  }
  const eventos = lerEventos(corpo);
  if (!eventos.length) return resposta(400);

  const dia = new Date().toISOString().slice(0, 10);   // UTC
  try {
    const hoje = await env.DB.prepare("SELECT n FROM contagens_dia WHERE dia = ?").bind(dia).first();
    if (hoje && hoje.n >= MAX_POR_DIA) return resposta(429);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO contagens_dia (dia, n) VALUES (?, 1)
         ON CONFLICT(dia) DO UPDATE SET n = n + 1`
      ).bind(dia),
      ...eventos.map(([evento, n]) => env.DB.prepare(
        `INSERT INTO contagens (evento, dia, vezes) VALUES (?, ?, ?)
         ON CONFLICT(evento, dia) DO UPDATE SET vezes = vezes + excluded.vezes`
      ).bind(evento, dia, n)),
    ]);
  } catch (e) {
    console.error("contagem: falha ao gravar:", e && e.message);
    return resposta(503);
  }
  return resposta(204);
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, rota: "POST /api/contagem" }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
