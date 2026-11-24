// A caixa de busca do topo e suas sugestões clicáveis. A conta de quem
// combina com o termo fica em busca.js, e a procura de endereços em
// lugares.js; aqui só a tela.
//
// As sugestões, de cima para baixo:
//  - o filtro pedido ("Ver as feiras de sábado no mapa"), quando o termo é só
//    dia, tipo ou "perto de mim";
//  - os lugares do serviço de endereços, quando a busca daqui não achou de
//    verdade (busca.js, procurarLugar): enquanto ele responde, "Procurando o
//    endereço…" e nada mais, para a lista não pular debaixo do dedo;
//  - as áreas (zona, distrito, bairro) e as feiras.
//
// A busca que termina sem resposta daqui fica anotada (registro-busca.js) e
// vai, anônima, quando as sugestões fecham.

import { esc } from "./texto.js?v=76";
import { nomeFeira } from "./dados.js?v=76";
import { descreverIntencao } from "./busca.js?v=76";
import { buscarLugares } from "./lugares.js?v=76";
import { ZOOM_LOCALIZACAO, irPara, enquadra } from "./mapa.js?v=76";
import { fechaGaveta } from "./barra.js?v=76";
import { toast } from "./pagina.js?v=76";
import { aplicarIntencao } from "./filtros.js?v=76";
import { ativarPerto, mostrarLugar } from "./perto.js?v=76";
import { anotar, esquecer, enviarPendente, iniciaRegistroBusca } from "./registro-busca.js?v=76";

var busca = document.getElementById("busca");
var caixaSugestoes = document.getElementById("busca-sugestoes");
var buscador = null;

// espera a mais, depois de a pessoa parar de digitar, antes de ir ao servico
// de enderecos (cada palavra digitada nao vira uma consulta)
var ESPERA_LUGAR_MS = 350;
var lugaresPorTexto = {};   // a mesma consulta nao vai duas vezes
var pedidoLugar = null;     // AbortController da consulta em andamento
var esperaLugar = null;

// navegacao por teclado nas sugestoes (setas + Enter)
var idxRealce = -1;
function opcoesSugestao() {
  return caixaSugestoes.querySelectorAll('li[role="option"]');
}
function setRealce(i) {
  var itens = opcoesSugestao();
  if (idxRealce >= 0 && itens[idxRealce]) itens[idxRealce].classList.remove("realce");
  idxRealce = i;
  if (i >= 0 && itens[i]) {
    itens[i].classList.add("realce");
    itens[i].scrollIntoView({ block: "nearest" });
    busca.setAttribute("aria-activedescendant", itens[i].id);
  } else {
    busca.removeAttribute("aria-activedescendant");
  }
}

function cancelaLugar() {
  clearTimeout(esperaLugar);
  if (pedidoLugar) { pedidoLugar.abort(); pedidoLugar = null; }
}

function fecharSugestoes() {
  cancelaLugar();
  enviarPendente();
  caixaSugestoes.hidden = true;
  caixaSugestoes.innerHTML = "";
  busca.setAttribute("aria-expanded", "false");
  idxRealce = -1;
  busca.removeAttribute("aria-activedescendant");
}

// apaga o termo e fecha as sugestoes (o "limpar" dos filtros)
export function limpaBusca() {
  busca.value = "";
  fecharSugestoes();
}

// ---- o que cada sugestao faz ----

function temFiltro(it) { return it.dias.length || it.categorias.length; }

// o termo pedia dia ou tipo: liga os filtros (os chips mostram o que ficou)
function usaFiltro(it) {
  aplicarIntencao(it);
  // o "Feiras hoje" avisa sozinho (e diz quando hoje nao tem feira)
  if (!it.hoje) toast("🗓️ Mostrando as " + descreverIntencao(it));
}

function irParaFeira(m, it) {
  if (temFiltro(it)) aplicarIntencao(it);
  irPara(m.lat, m.lng, ZOOM_LOCALIZACAO, true);
  m.openPopup();
  fecharSugestoes();
  busca.value = m.feira.logradouro;
  fechaGaveta();
}

function irParaArea(area, it) {
  if (temFiltro(it)) aplicarIntencao(it);
  enquadra(area.marcadores.map(function (m) { return m.getLatLng(); }), 0.15);
  fecharSugestoes();
  busca.value = area.label;
  fechaGaveta();
}

function irParaLugar(l) {
  fecharSugestoes();
  busca.value = l.nome;
  fechaGaveta();
  mostrarLugar(l);
}

// ---- a lista ----

var seq = 0;
function opcao(classe, icone, nome, sub, acao) {
  var li = document.createElement("li");
  if (classe) li.className = classe;
  li.id = "busca-opcao-" + (seq++);
  li.setAttribute("role", "option");
  li.innerHTML =
    (icone ? '<span class="sug-icone" aria-hidden="true">' + icone + "</span>" : "") +
    '<span class="lp-info"><span class="lp-nome">' + esc(nome) + "</span>" +
    '<span class="lp-sub">' + esc(sub) + "</span></span>";
  li.addEventListener("click", acao);
  return li;
}
function aviso(texto, classe) {
  var li = document.createElement("li");
  li.className = classe || "vazio";
  li.textContent = texto;
  return li;
}
function qtd(n) { return n + " feira" + (n === 1 ? "" : "s"); }

function mostra(itens) {
  caixaSugestoes.innerHTML = "";
  idxRealce = -1;
  busca.removeAttribute("aria-activedescendant");
  itens.forEach(function (li) { caixaSugestoes.appendChild(li); });
  caixaSugestoes.hidden = false;
  busca.setAttribute("aria-expanded", "true");
}

// o que a busca mostrou no fim: sem feira de verdade, fica anotado
function anotaResultado(termo, r, lugares) {
  // o tipo diz o que a pessoa viu: um endereço oferecido, só nomes parecidos,
  // ou nada (o erro de digitação se vê no próprio termo)
  if (lugares && lugares.length) anotar(termo, "endereco");
  else if (!r.areas.length && !r.feiras.length) anotar(termo, "nada");
  else if (r.aproximado) anotar(termo, "parecido");
  else esquecer();
}

// as sugestoes daqui (areas e feiras), na ordem de sempre
function itensLocais(r) {
  var it = r.intencao, itens = [];
  if (temFiltro(it) && (r.areas.length || r.feiras.length)) {
    itens.push(aviso("Só as " + descreverIntencao(it), "nota"));
  }
  r.areas.forEach(function (a, i) {
    var li = opcao("area", "", a.label, a.tipo + " · " + qtd(a.marcadores.length), function () { irParaArea(a, it); });
    if (i === r.areas.length - 1 && r.feiras.length) li.classList.add("divisor");
    itens.push(li);
  });
  r.feiras.forEach(function (x) {
    var f = x.f;
    itens.push(opcao("", "", nomeFeira(f), f.bairro + " · " + f.dia.replace(" Feira", ""), function () { irParaFeira(x.m, it); }));
  });
  return itens;
}

function mostrarSugestoes(termo) {
  cancelaLugar();
  seq = 0;
  // apagou a busca: desistiu, nada vai
  if (!termo.trim()) { esquecer(); fecharSugestoes(); return; }
  esquecer();
  var r = buscador.buscar(termo, new Date());
  var it = r.intencao;

  if (it.vazio) { mostra([aviso("Digite uma rua, bairro, CEP ou dia da semana")]); return; }

  if (it.perto) {
    mostra([opcao("acao", "📍", "Ver as feiras perto de mim", "usa a localização do seu aparelho", function () {
      limpaBusca();
      fechaGaveta();
      ativarPerto(false);
    })]);
    return;
  }

  // so dia e/ou tipo: o filtro e a sugestao
  if (!it.palavras.length && !it.cep) {
    if (!r.totalIntencao) { mostra([aviso("Não há " + descreverIntencao(it))]); return; }
    mostra([opcao("acao", "🗓️", "Ver as " + descreverIntencao(it) + " no mapa", qtd(r.totalIntencao), function () {
      limpaBusca();
      fechaGaveta();
      usaFiltro(it);
    })]);
    return;
  }

  var locais = itensLocais(r);
  if (!r.procurarLugar) {
    anotaResultado(termo, r);
    mostra(locais.length ? locais : [aviso("Nenhuma feira encontrada")]);
    return;
  }

  // a busca daqui nao achou de verdade: o servico de enderecos responde antes
  // de a lista aparecer (os parecidos vem depois dos lugares)
  var chave = it.cep || it.textoLugar;
  var pronto = lugaresPorTexto[chave];
  if (pronto) { mostraComLugares(pronto, locais, termo, r); return; }
  mostra([aviso("Procurando o endereço…", "vazio buscando")]);
  esperaLugar = setTimeout(function () {
    var ctrl = pedidoLugar = new AbortController();
    buscarLugares(it.textoLugar, it.cep, ctrl.signal).then(function (res) {
      if (ctrl.signal.aborted) return;
      pedidoLugar = null;
      lugaresPorTexto[chave] = res;
      mostraComLugares(res, locais, termo, r);
    }, function () {
      if (pedidoLugar !== ctrl) return; // a pessoa seguiu digitando
      pedidoLugar = null;
      // fora do ar ou lento: fica o que a busca daqui achou
      anotaResultado(termo, r);
      mostra(locais.length ? locais : [aviso("Nenhuma feira encontrada")]);
    });
  }, ESPERA_LUGAR_MS);
}

function mostraComLugares(res, locais, termo, r) {
  anotaResultado(termo, r, res.lugares);
  var itens = res.lugares.map(function (l) {
    return opcao("lugar", "📍", l.nome, (l.sub ? l.sub + " · " : "") + "ver as feiras mais perto", function () { irParaLugar(l); });
  });
  if (itens.length && locais.length) itens[itens.length - 1].classList.add("divisor");
  itens = itens.concat(locais);
  if (!itens.length) {
    itens = [aviso(res.foraDeSP
      ? "Esse CEP é de " + res.foraDeSP + ". O mapa mostra só as feiras da cidade de São Paulo."
      : "Nenhuma feira nem endereço encontrado")];
  }
  mostra(itens);
}

// ---- partida ----
// novoBuscador: o de criarBusca() (busca.js)
export function iniciaCaixaBusca(novoBuscador) {
  buscador = novoBuscador;
  iniciaRegistroBusca();
  var t;
  busca.addEventListener("input", function () {
    clearTimeout(t);
    cancelaLugar();
    var v = this.value;
    t = setTimeout(function () { mostrarSugestoes(v); }, 180);
  });
  busca.addEventListener("focus", function () {
    if (this.value.trim()) mostrarSugestoes(this.value);
  });
  busca.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharSugestoes(); this.blur(); return; }
    if (caixaSugestoes.hidden) return;
    var itens = opcoesSugestao();
    if (!itens.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setRealce((idxRealce + 1) % itens.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setRealce((idxRealce - 1 + itens.length) % itens.length); }
    else if (e.key === "Enter") { e.preventDefault(); itens[idxRealce >= 0 ? idxRealce : 0].click(); }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".busca-wrap")) fecharSugestoes();
  });
}
