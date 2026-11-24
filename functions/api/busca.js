// Cloudflare Pages Function — POST /api/busca
//
// Recebe, anônimo, o termo de uma busca que o mapa não soube responder (ver
// site/js/registro-busca.js) e soma no banco D1 (binding "DB"), tabela
// "buscas": uma linha por termo, tipo e dia, com quantas vezes apareceu. Serve
// para ensinar a busca palavras novas.
//
// Não guarda IP, nem código dele, nem hora, nem nada de quem buscou. O termo é
// limpo de novo aqui (sem número, sem e-mail), porque o que chega pode não ter
// vindo do site.
//
// Abuso: o banco é o mesmo dos reports, e encher a cota diária de gravações
// do plano gratuito pararia os reports também. Por isso há um teto do dia
// (tabela "buscas_dia", uma linha por dia): passou dele, a rota recusa lendo
// uma linha só, sem gravar nada.

import { origemPermitida } from "./report.js";

const TIPOS = new Set(["nada", "parecido", "endereco"]);
const MAX_TERMO = 60;
const MAX_CORPO = 500;
export const MAX_POR_DIA = 3000;
const GUARDA_DIAS = 365;   // o que a página de Privacidade promete

// a mesma conta de site/js/registro-busca.js (os testes conferem)
export function termoAnonimo(s) {
  const t = String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\S*@\S*/g, " ")
    .replace(/[0-9]+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .replace(/#(\s*#)*/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[a-z]{2}/.test(t)) return "";
  return t.slice(0, MAX_TERMO).trim();
}

function resposta(status) {
  return new Response(null, { status });
}

export async function onRequestPost({ request, env }) {
  if (!origemPermitida(request.headers.get("Origin"))) return resposta(403);
  if (!env.DB) {
    console.error("banco D1 (binding DB) não configurado: busca não registrada");
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
  const termo = termoAnonimo(corpo && corpo.termo);
  const tipo = String((corpo && corpo.tipo) || "");
  if (!termo || !TIPOS.has(tipo)) return resposta(400);

  // dia em UTC: a conta é por dia, a hora não importa
  const dia = new Date().toISOString().slice(0, 10);
  let hoje;
  try {
    hoje = await env.DB.prepare("SELECT n FROM buscas_dia WHERE dia = ?").bind(dia).first();
    if (hoje && hoje.n >= MAX_POR_DIA) return resposta(429);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO buscas_dia (dia, n) VALUES (?, 1)
         ON CONFLICT(dia) DO UPDATE SET n = n + 1`
      ).bind(dia),
      env.DB.prepare(
        `INSERT INTO buscas (termo, tipo, dia, vezes) VALUES (?, ?, ?, 1)
         ON CONFLICT(termo, tipo, dia) DO UPDATE SET vezes = vezes + 1`
      ).bind(termo, tipo, dia),
    ]);
  } catch (e) {
    console.error("busca: falha ao gravar:", e && e.message);
    return resposta(503);
  }

  // A primeira busca do dia apaga o que passou do prazo. As Pages Functions
  // não têm agendamento; assim a limpeza não depende de ninguém lembrar.
  if (!hoje) {
    try {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM buscas WHERE dia < date('now', ?)").bind(`-${GUARDA_DIAS} days`),
        env.DB.prepare("DELETE FROM buscas_dia WHERE dia < date('now', ?)").bind(`-${GUARDA_DIAS} days`),
      ]);
    } catch (e) {
      console.error("busca: falha ao apagar as antigas:", e && e.message);
    }
  }

  return resposta(204);
}

// GET só para conferir que a rota está viva; não mostra nada do banco
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, rota: "POST /api/busca" }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
