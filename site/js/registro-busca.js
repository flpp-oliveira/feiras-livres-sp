// O que as pessoas procuram e o mapa não acha: o termo vai, anônimo, para
// POST /api/busca (functions/api/busca.js), e serve para ensinar a busca
// palavras novas.
//
// Só vai a busca que terminou sem resposta daqui:
//  - "nada": nem feira, nem área, nem endereço;
//  - "parecido": só nomes parecidos daqui (erro de digitação) e nenhum endereço;
//  - "endereco": nenhuma feira com aquele nome, mas o serviço de endereços
//    achou o lugar (uma estação, um shopping, uma rua sem feira).
// Busca que achou feira, dia da semana ("sábado") e "perto de mim" não vão.
//
// Vai só o termo, sem acento, sem número (o número da casa, o CEP) e sem
// palavra com @; nada de quem digitou. E só o termo final: enquanto a pessoa
// digita nada sai. Sai quando as sugestões fecham (tocou no mapa, escolheu
// uma sugestão, Esc) ou quando a página some (fechou a aba). Apagou a busca:
// desistiu, e nada vai.

import { norm } from "./texto.js?v=76";

var ROTA = "/api/busca";
export var MAX_TERMO = 60;
export var TIPOS_REGISTRO = ["nada", "parecido", "endereco"];

// A mesma conta fica no servidor (functions/api/busca.js), que não confia no
// que chega; testes/funcoes.test.mjs confere que as duas dão o mesmo.
export function termoAnonimo(s) {
  var t = norm(String(s || ""))
    .replace(/\S*@\S*/g, " ")      // e-mail
    .replace(/[0-9]+/g, "#")       // número da casa, CEP, telefone
    .replace(/[^a-z#]+/g, " ")
    .replace(/#(\s*#)*/g, "#")     // "#-#" do CEP vira um só
    .replace(/\s+/g, " ")
    .trim();
  // sem duas letras seguidas não há palavra para aprender
  if (!/[a-z]{2}/.test(t)) return "";
  return t.slice(0, MAX_TERMO).trim();
}

var pendente = null;
var enviados = {};   // na mesma visita, o mesmo termo vai uma vez

// a busca mostrou o resultado final deste termo
export function anotar(termo, tipo) {
  var t = termoAnonimo(termo);
  pendente = t && TIPOS_REGISTRO.indexOf(tipo) !== -1 ? { termo: t, tipo: tipo } : null;
}

// o termo achou o que queria, ou a pessoa apagou: não vai nada
export function esquecer() { pendente = null; }

export function enviarPendente() {
  if (!pendente) return;
  var p = pendente;
  pendente = null;
  var chave = p.tipo + ":" + p.termo;
  if (enviados[chave]) return;
  enviados[chave] = true;
  var corpo = JSON.stringify(p);
  try {
    // o beacon sai mesmo com a aba fechando
    if (navigator.sendBeacon && navigator.sendBeacon(ROTA, corpo)) return;
    fetch(ROTA, { method: "POST", body: corpo, keepalive: true, credentials: "omit" })
      .catch(function () {});
  } catch (e) { /* sem registro, a busca segue igual */ }
}

export function iniciaRegistroBusca() {
  addEventListener("pagehide", enviarPendente);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") enviarPendente();
  });
}
