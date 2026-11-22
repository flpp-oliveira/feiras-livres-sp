// Filtros de dia e categoria (os chips), o botão "Feiras hoje", o "limpar" e
// os filtros no endereço (?dia=domingo&categoria=organica).
//
// Ao mudar, aplica nos pinos e avisa "filtros" (quem mais depende disso, como
// a lista "perto de mim", ouve o aviso).

import { norm } from "./texto.js?v=74";
import { ORDEM_DIAS, NOMES_JS, corDia, slugDia, contar } from "./dados.js?v=74";
import { estado, passa, avisar } from "./estado.js?v=74";
import { toast, anuncia, setBotaoAtivo } from "./pagina.js?v=74";
import { todos, mostraPinos, feiraDoPopup, fechaPopup } from "./mapa.js?v=74";
import { limpaBusca } from "./caixa-busca.js?v=74";

var filtros = estado.filtros;
// true enquanto os chips sao clicados por codigo (nao pelo usuario)
var sincronizando = false;

export function aplicar() {
  var visiveis = todos.filter(function (m) { return passa(m.feira); });
  mostraPinos(visiveis);
  // o pino saiu do mapa: o popup dele nao fica boiando sozinho
  var aberta = feiraDoPopup();
  if (aberta && !passa(aberta)) fechaPopup();
  document.getElementById("vazio").hidden = visiveis.length !== 0;
  avisar("filtros", visiveis);
  atualizaRotuloFiltros();
  if (estado.iniciado) {
    anuncia(visiveis.length === 1 ? "1 feira no mapa" : visiveis.length + " feiras no mapa");
    sincronizaEndereco();
  }
}

// com a gaveta fechada (celular) os filtros ligados nao aparecem: o botao conta quantos sao
function atualizaRotuloFiltros() {
  var n = filtros.dias.size + filtros.categorias.size;
  document.getElementById("toggle-sidebar").textContent = "☰ Filtros" + (n ? " · " + n : "");
}

// ---- filtros no endereco (?dia=domingo&categoria=organica) ----
// O endereco acompanha os filtros: copiar o link (ou usar o "compartilhar" do
// navegador) leva a outra pessoa a mesma vista. "hoje" nao vira um dia fixo:
// quem abrir o link amanha ve as feiras do dia em que abriu.
var enderecoTimer;
export function sincronizaEndereco() {
  // adiado: um clique passa por mais de um ouvinte antes de o estado assentar
  clearTimeout(enderecoTimer);
  enderecoTimer = setTimeout(function () {
    var partes = [];
    if (document.getElementById("hoje").classList.contains("ativo")) partes.push("dia=hoje");
    else if (filtros.dias.size) partes.push("dia=" + Array.from(filtros.dias).map(slugDia).join(","));
    if (filtros.categorias.size) partes.push("categoria=" + Array.from(filtros.categorias).map(slugDia).join(","));
    try {
      history.replaceState(null, "", location.pathname + (partes.length ? "?" + partes.join("&") : ""));
    } catch (e) {} // file:// e alguns contextos embutidos recusam: o site segue sem o link
  }, 0);
}
export function aplicarFiltrosDoEndereco(params) {
  function liga(containerId, valor) {
    var pedidos = String(valor || "").split(",").map(norm).filter(Boolean);
    if (!pedidos.length) return;
    sincronizando = true;
    document.querySelectorAll("#" + containerId + " .chip").forEach(function (c) {
      if (pedidos.indexOf(slugDia(c.dataset.valor)) !== -1 && !c.classList.contains("ativo")) c.click();
    });
    sincronizando = false;
  }
  if (norm(params.get("dia") || "") === "hoje") document.getElementById("hoje").click();
  else liga("filtro-dias", params.get("dia"));
  liga("filtro-categorias", params.get("categoria"));
}

// a busca pediu dia e/ou tipo ("sábado", "orgânica", "hoje"): liga
// exatamente esses chips (o que nao foi pedido fica como estava)
export function aplicarIntencao(it) {
  function so(containerId, valores) {
    sincronizando = true;
    document.querySelectorAll("#" + containerId + " .chip").forEach(function (c) {
      if (c.classList.contains("ativo") !== (valores.indexOf(c.dataset.valor) !== -1)) c.click();
    });
    sincronizando = false;
  }
  if (it.hoje && it.dias.length === 1) {
    // o mesmo do botao "Feiras hoje" (que tambem avisa quando hoje nao tem feira)
    if (!document.getElementById("hoje").classList.contains("ativo")) document.getElementById("hoje").click();
  } else if (it.dias.length) {
    so("filtro-dias", it.dias);
    setBotaoAtivo("hoje", false);
  }
  if (it.categorias.length) so("filtro-categorias", it.categorias);
  sincronizaEndereco();
}

export function limparTudo() {
  filtros.dias.clear(); filtros.categorias.clear();
  limpaBusca();
  document.querySelectorAll(".chip.ativo").forEach(function (c) {
    c.classList.remove("ativo");
    c.setAttribute("aria-pressed", "false");
  });
  setBotaoAtivo("hoje", false);
  aplicar();
}

// ---- os chips ----
function montaChips(containerId, valores, set, comCor, contagens) {
  var box = document.getElementById(containerId);
  valores.forEach(function (v) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.valor = v;
    chip.setAttribute("aria-pressed", "false");
    var top = document.createElement("span");
    top.className = "chip-top";
    // so texto, sem bolinha nem emoji: o chip ativo e que assume a cor do dia
    if (comCor) chip.style.setProperty("--chip-cor", corDia(v));
    var rotulo = v.replace(" Feira", "");
    top.appendChild(document.createTextNode(rotulo));
    chip.appendChild(top);
    if (contagens && contagens[v] != null) {
      var q = document.createElement("span");
      q.className = "qtd";
      q.textContent = contagens[v];
      chip.appendChild(q);
    }
    chip.addEventListener("click", function () {
      if (set.has(v)) { set.delete(v); chip.classList.remove("ativo"); chip.setAttribute("aria-pressed", "false"); }
      else { set.add(v); chip.classList.add("ativo"); chip.setAttribute("aria-pressed", "true"); }
      aplicar();
    });
    box.appendChild(chip);
  });
}

// ---- partida ----
export function iniciaFiltros(feiras) {
  var diasPresentes = ORDEM_DIAS.filter(function (d) {
    return feiras.some(function (f) { return f.dia === d; });
  });
  var categorias = Array.from(new Set(feiras.map(function (f) { return f.categoria; }))).sort();

  montaChips("filtro-dias", diasPresentes, filtros.dias, true, contar(feiras, "dia"));
  montaChips("filtro-categorias", categorias, filtros.categorias, false, contar(feiras, "categoria"));

  // se o usuario mexer nos chips de dia manualmente, "Feiras hoje" deixa de valer
  document.getElementById("filtro-dias").addEventListener("click", function (e) {
    if (!sincronizando && e.target.closest(".chip")) { setBotaoAtivo("hoje", false); sincronizaEndereco(); }
  });

  document.getElementById("vazio-limpar").addEventListener("click", limparTudo);

  // ---- feiras de hoje (toggle) ----
  document.getElementById("hoje").addEventListener("click", function () {
    var ativo = this.classList.contains("ativo");
    // limpa os dias atuais (por codigo, sem desligar o proprio botao)
    sincronizando = true;
    document.querySelectorAll("#filtro-dias .chip.ativo").forEach(function (c) { c.click(); });
    sincronizando = false;

    if (ativo) {                      // estava ligado -> desliga
      setBotaoAtivo("hoje", false);
      aplicar();
      return;
    }
    var hoje = NOMES_JS[new Date().getDay()];
    var chip = document.querySelector('#filtro-dias .chip[data-valor="' + hoje + '"]');
    if (!chip) {
      toast("Hoje (" + hoje.split(" ")[0] + ") não tem feira — planeje a de amanhã! 😉");
      return;
    }
    sincronizando = true;
    chip.click();                     // ativa so o dia de hoje
    sincronizando = false;
    setBotaoAtivo("hoje", true);
    sincronizaEndereco();
    toast("🗓️ Mostrando as feiras de hoje (" + hoje + ")");
  });
}
