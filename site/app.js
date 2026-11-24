/* Mapa das Feiras Livres de São Paulo */
//
// Este arquivo só liga as partes, na ordem certa. Cada parte mora num módulo
// em js/:
//
//   texto, dados, geo, busca   funções puras, sem página nem mapa (testes/)
//   estado                     o que várias partes leem, e os avisos entre elas
//   pagina                     toast, anúncio, janelas <dialog>, tamanho da tela
//   mapa                       o MapLibre: carta, pinos, ficha, movimentos
//   filtros                    chips de dia/categoria, "Feiras hoje", endereço
//   caixa-busca                a caixa de busca e as sugestões
//   perto                      "Perto de mim", a lista e a folha do celular
//   barra                      gaveta (celular) e barra recolhível (computador)
//   janelas                    aviso dos dados, convite de localização, dica
//   reporte                    "Reportar erro nesta feira"
//
// Regra da casa: ao carregar, um módulo só declara coisas. Ouvintes e
// mudanças na página acontecem nas funções inicia...(), chamadas daqui.
//
// O ?v= de todos os imports é o mesmo do index.html: sem ele, o navegador
// poderia juntar um arquivo novo com um módulo antigo do cache (há um teste
// que confere).
import { estado } from "./js/estado.js?v=76";
import { toast } from "./js/pagina.js?v=76";
import { montarIndices, criarBusca } from "./js/busca.js?v=76";
import { iniciaMapa, todos } from "./js/mapa.js?v=76";
import { iniciaFiltros, aplicar, aplicarFiltrosDoEndereco, limparTudo, sincronizaEndereco } from "./js/filtros.js?v=76";
import { iniciaCaixaBusca } from "./js/caixa-busca.js?v=76";
import { iniciaPerto, focarFeira, pedirLocalizacaoNoInicio } from "./js/perto.js?v=76";
import { iniciaBarra } from "./js/barra.js?v=76";
import { iniciaJanelas, jaViuAviso, mostrarAvisoDados, convidarLocalizacao } from "./js/janelas.js?v=76";
import { iniciaReporte } from "./js/reporte.js?v=76";
import { iniciaContagem } from "./js/contagem.js?v=76";

var FEIRAS = window.FEIRAS || [];

iniciaMapa(FEIRAS);
var indices = montarIndices(todos);
iniciaFiltros(FEIRAS);
iniciaCaixaBusca(criarBusca(todos, indices));
iniciaPerto();
iniciaBarra();
iniciaJanelas();
iniciaReporte();
iniciaContagem();

// data da base (gerada junto com os dados): o rodape ja traz o texto fixo,
// que so e trocado se o arquivo de dados trouxer outra data
if (window.FEIRAS_BASE) {
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var pedacos = String(window.FEIRAS_BASE).split("-");
  if (MESES[+pedacos[1] - 1]) document.getElementById("data-base").textContent = MESES[+pedacos[1] - 1] + " de " + pedacos[0];
}

var paramsIniciais = new URLSearchParams(location.search);
var idPedido = paramsIniciais.get("feira");
estado.feiraPedida = (idPedido && indices.porId[idPedido]) || null;

aplicarFiltrosDoEndereco(paramsIniciais);
aplicar();
estado.iniciado = true;

if (estado.feiraPedida) {
  // Link compartilhado: abre direto naquela feira, sem filtro nenhum (um
  // filtro vindo junto poderia esconder justamente o pino dela). O parametro
  // sai do endereco depois de usado, para recarregar nao reabrir o popup.
  limparTudo();
  setTimeout(function () { focarFeira(estado.feiraPedida); }, 320); // depois do enquadramento inicial
} else if (idPedido) {
  sincronizaEndereco();
  toast("Essa feira não foi encontrada — o link pode ser antigo.");
}

// espera o mapa desenhar pra nao competir com a montagem da tela
setTimeout(function () {
  if (jaViuAviso()) convidarLocalizacao();
  else mostrarAvisoDados(convidarLocalizacao);
}, 1400);

// quem ja deu a permissao antes abre com a localizacao ligada
pedirLocalizacaoNoInicio();
