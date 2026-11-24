// Quantas vezes cada botão do site é usado, por dia. Vai para POST
// /api/contagem (functions/api/contagem.js), que só soma: "Como chegar: 37 no
// dia 22". Nada de quem tocou, nada de cookie, nada que ligue um toque a
// outro: a página junta os toques da visita e manda só os totais quando some
// da tela (fechou a aba, trocou de app); o servidor soma no dia e esquece o
// envio.
//
// Conta só toque de verdade (e.isTrusted): o site também "clica" sozinho nos
// chips ao aplicar um filtro pedido na busca, e isso não é uso.

// o nome que vai para o banco e o que ele quer dizer (o mesmo conjunto fica
// em functions/api/contagem.js; os testes conferem)
export var EVENTOS = {
  ficha_aberta: "abriu a ficha de uma feira",
  como_chegar: "tocou em Como chegar",
  compartilhar: "tocou em Compartilhar",
  report_aberto: "abriu o Reportar erro",
  report_enviado: "enviou um report",
  perto_de_mim: "tocou em Perto de mim",
  feiras_hoje: "tocou em Feiras hoje",
  filtro_dia: "tocou num chip de dia",
  filtro_tipo: "tocou num chip de tipo",
  limpar_filtros: "tocou em Limpar filtros",
  busca_feira: "escolheu uma feira na busca",
  busca_area: "escolheu um bairro, distrito ou zona na busca",
  busca_endereco: "escolheu um endereço na busca",
  busca_atalho: "escolheu um atalho na busca (um dia, perto de mim)",
  lista_perto: "tocou numa feira da lista de perto",
  convite_sim: "aceitou o convite para usar a localização",
  convite_nao: "recusou o convite para usar a localização"
};

// do mais específico para o mais geral: vale o primeiro que casar
export var ALVOS = [
  [".btn-rota", "como_chegar"],
  [".btn-compartilhar", "compartilhar"],
  [".btn-reportar", "report_aberto"],
  ["#perto", "perto_de_mim"],
  ["#hoje", "feiras_hoje"],
  ["#filtro-dias .chip", "filtro_dia"],
  ["#filtro-categorias .chip", "filtro_tipo"],
  ["#vazio-limpar", "limpar_filtros"],
  ["#busca-sugestoes li.lugar", "busca_endereco"],
  ["#busca-sugestoes li.acao", "busca_atalho"],
  ["#busca-sugestoes li.area", "busca_area"],
  ['#busca-sugestoes li[role="option"]', "busca_feira"],
  ["#lp-itens li", "lista_perto"],
  ["#convite-sim", "convite_sim"],
  ["#convite-nao", "convite_nao"]
];

var ROTA = "/api/contagem";
var pendentes = {};

export function marcar(evento) {
  if (!Object.prototype.hasOwnProperty.call(EVENTOS, evento)) return;
  pendentes[evento] = (pendentes[evento] || 0) + 1;
}

export function enviarContagem() {
  if (!Object.keys(pendentes).length) return;
  var corpo = JSON.stringify({ eventos: pendentes });
  pendentes = {};
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ROTA, corpo)) return;
    fetch(ROTA, { method: "POST", body: corpo, keepalive: true, credentials: "omit" })
      .catch(function () {});
  } catch (e) { /* sem contagem, o site segue igual */ }
}

export function iniciaContagem() {
  // na captura: o toque conta antes de o botão fechar a lista ou trocar a tela
  document.addEventListener("click", function (e) {
    if (!e.isTrusted || !e.target.closest) return;
    for (var i = 0; i < ALVOS.length; i++) {
      if (e.target.closest(ALVOS[i][0])) { marcar(ALVOS[i][1]); return; }
    }
  }, true);
  addEventListener("pagehide", enviarContagem);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") enviarContagem();
  });
}
