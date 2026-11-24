// As janelas da chegada: o aviso sobre a qualidade dos dados, o convite para
// ligar a localização e a dica que aponta o botão "Perto de mim" para quem
// recusou o convite.

import { estado } from "./estado.js?v=76";
import { mqEstreito, abreDialogo, fechaDialogo, fechaNoVeu } from "./pagina.js?v=76";
import { map } from "./mapa.js?v=76";
import { ativarPerto } from "./perto.js?v=76";

// ---- aviso sobre a qualidade dos dados (uma vez por navegador) ----
// Mostrar a cada visita puniria justamente quem volta — e quem volta ja leu.
var CHAVE_AVISO = "feirasp:aviso-dados";
var dlgAviso = document.getElementById("aviso-dados");
export function jaViuAviso() {
  try { return localStorage.getItem(CHAVE_AVISO) === "1"; } catch (e) { return false; }
}
// depois: o que fazer quando a pessoa fechar o aviso
export function mostrarAvisoDados(depois) {
  // 'close' cobre os tres caminhos de saida: o botao, o Esc e o clique no veu
  dlgAviso.addEventListener("close", function () {
    // modo privado do Safari lanca ao gravar: nesse caso o aviso volta na proxima visita
    try { localStorage.setItem(CHAVE_AVISO, "1"); } catch (e) {}
    depois();
  }, { once: true });
  abreDialogo(dlgAviso);
}

// ---- convite para ligar a localizacao ----
// A cada visita, logo depois do aviso (ou no lugar dele, para quem ja leu).
// Aceitar e que dispara a janela do navegador; recusar — aqui ou la — deixa a
// dica apontando o botao, para a pessoa saber onde ligar depois. Se o
// navegador ja tem a resposta, perguntar de novo seria so um obstaculo:
// permitida, liga direto (pedirLocalizacaoNoInicio); negada, nao insiste.
// "Visita" e a sessao da aba: ir a lista e voltar nao pergunta de novo.
var CHAVE_CONVITE = "feirasp:convite-localizacao";
var dlgConvite = document.getElementById("convite-localizacao");
function conviteJaFeito() {
  try { return sessionStorage.getItem(CHAVE_CONVITE) === "1"; } catch (e) { return false; }
}
export function convidarLocalizacao() {
  // quem chega por um link de feira quer ver AQUELA feira, nao outra tela
  if (estado.userPos || estado.feiraPedida || estado.geoNegada || !navigator.geolocation || conviteJaFeito()) return;
  function abre() {
    if (estado.userPos) return; // a posicao chegou enquanto a permissao era consultada
    try { sessionStorage.setItem(CHAVE_CONVITE, "1"); } catch (e) {}
    dlgConvite.returnValue = "";
    abreDialogo(dlgConvite);
  }
  if (!(navigator.permissions && navigator.permissions.query)) { abre(); return; } // sem a API (Safari antigo), pergunta
  navigator.permissions.query({ name: "geolocation" })
    .then(function (p) { if (p.state === "prompt") abre(); })
    .catch(abre);
}
// a posicao chegou (ou ja se sabe que a pessoa esta fora de SP) com o convite
// aberto: nao ha mais o que perguntar, nem dica a dar
export function fechaConvitePorqueLigou() {
  if (dlgConvite.open) fechaDialogo(dlgConvite, "ligada");
}

// ---- dica apontando pro botao "Perto de mim" (depois de recusar o convite) ----
var dicaTimer;
export function fecharDica() {
  var d = document.getElementById("dica-localizacao");
  if (d.hidden) return;
  clearTimeout(dicaTimer);
  d.classList.remove("show");
  setTimeout(function () { d.hidden = true; }, 260);
}
// no computador a caixa fica a direita do botao, sobre o mapa; no celular o
// botao esta na barra do topo, e a caixa vai logo abaixo dele.
function posicionarDica(d) {
  var desktop = !mqEstreito.matches;
  var r = document.getElementById("perto").getBoundingClientRect();
  if (!r.width) { fecharDica(); return; } // barra lateral recolhida: nao ha alvo
  d.querySelector("span").textContent =
    (desktop ? "Clique" : "Toque") + " aqui para ver as feiras perto de você";
  d.classList.remove("seta-esq", "seta-cima");
  d.style.right = "auto";
  if (desktop) {
    d.style.left = Math.round(r.right + 12) + "px";
    d.style.top = Math.round(r.top + r.height / 2 - d.offsetHeight / 2) + "px";
    d.classList.add("seta-esq");
  } else {
    d.style.left = Math.round(Math.max(12, r.left + r.width / 2 - d.offsetWidth / 2)) + "px";
    d.style.top = Math.round(r.bottom + 12) + "px";
    d.classList.add("seta-cima");
  }
}
function mostrarDicaLocalizacao() {
  if (estado.userPos || estado.geoNegada) return; // ja localizado, ou negou: a dica so frustraria
  var d = document.getElementById("dica-localizacao");
  d.hidden = false;      // precisa estar visivel pra medir no posicionamento
  posicionarDica(d);
  void d.offsetWidth;
  d.classList.add("show");
  dicaTimer = setTimeout(fecharDica, 9000);
}

// ---- partida ----
export function iniciaJanelas() {
  document.getElementById("aviso-ok").addEventListener("click", function () { fechaDialogo(dlgAviso); });
  fechaNoVeu(dlgAviso);

  document.getElementById("convite-sim").addEventListener("click", function () { fechaDialogo(dlgConvite, "sim"); });
  document.getElementById("convite-nao").addEventListener("click", function () { fechaDialogo(dlgConvite, "nao"); });
  fechaNoVeu(dlgConvite);
  dlgConvite.addEventListener("close", function () {
    // Esc e clique no veu chegam com returnValue vazio: tambem e recusa.
    // "ligada" e o convite fechado pela propria posicao: nao ha dica a dar.
    if (dlgConvite.returnValue === "sim") ativarPerto(false);
    else if (dlgConvite.returnValue !== "ligada") mostrarDicaLocalizacao();
  });

  document.getElementById("dica-fechar").addEventListener("click", fecharDica);
  map.on("click", fecharDica);
  map.on("dragstart", fecharDica); // interagiu com o mapa: ja se virou sozinho
  // reposiciona depois que o layout assenta (girar o celular troca o formato,
  // e medir cedo demais pega a largura antiga)
  var dicaPosTimer;
  window.addEventListener("resize", function () {
    var d = document.getElementById("dica-localizacao");
    if (d.hidden) return;
    clearTimeout(dicaPosTimer);
    dicaPosTimer = setTimeout(function () { posicionarDica(d); }, 200);
  });
}
