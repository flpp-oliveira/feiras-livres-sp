// "Perto de mim": a localização de quem usa, a lista das feiras mais
// próximas e a folha que segura essa lista no celular. Também o botão redondo
// de localização do mapa.
//
// A mesma lista mede a partir de um lugar escolhido na busca ("metrô Santa
// Cruz", um CEP): mostrarLugar. Com os dois, vale o lugar, até fechar a lista
// (o x do cabeçalho) ou ligar o "Perto de mim" de novo.

import { esc } from "./texto.js?v=74";
import { nomeFeira } from "./dados.js?v=74";
import { distKm, fmtDist } from "./geo.js?v=74";
import { estado, passa, ouvir } from "./estado.js?v=74";
import { mqEstreito, toast, setBotaoAtivo } from "./pagina.js?v=74";
import { ZOOM_LOCALIZACAO, todos, irPara, marcadorDe } from "./mapa.js?v=74";
import { fechaGaveta } from "./barra.js?v=74";
import { fecharDica, fechaConvitePorqueLigou } from "./janelas.js?v=74";

var RAIO = 2; // km considerado "perto"
var MAX_LISTA = 30;
var LONGE_KM = 30; // feira mais proxima alem disso: a pessoa esta fora da regiao

var elApp = document.getElementById("app");
var painel = document.getElementById("lista-perto");
var lpItens = document.getElementById("lp-itens");
var lpTitulo = document.getElementById("lp-titulo");
var lpCab = document.getElementById("lp-cabecalho");
var btnLpMin = document.getElementById("lp-min");
var btnLpFechar = document.getElementById("lp-fechar");
var btnVoltarLoc = document.getElementById("voltar-localizacao");
var btnPerto = document.getElementById("perto");
var lblPerto = btnPerto.querySelector(".acao-label");
var userMarker = null;
var lugarMarker = null;

function feiraMaisProximaKm(lat, lng) {
  var min = Infinity;
  todos.forEach(function (m) {
    var p = m.getLatLng(), d = distKm(lat, lng, p.lat, p.lng);
    if (d < min) min = d;
  });
  return min;
}

// leva o mapa ate a feira e abre o popup dela (itens da lista e link compartilhado)
export function focarFeira(m) {
  irPara(m.lat, m.lng, ZOOM_LOCALIZACAO, true);
  m.openPopup();
  fechaGaveta();
  if (folhaAtiva()) poeFolha(0); // no celular a lista recolhe pra feira aparecer no mapa
}

function itemLista(x) {
  var f = x.f;
  var li = document.createElement("li");
  // alcancavel pelo teclado: so com o clique, a lista era invisivel pra quem nao usa mouse
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.innerHTML =
    // sem o emoji do tipo no nome: ele empurrava o texto e desalinhava a
    // lista. O tipo so aparece quando foge da regra (932 de 976 sao tradicionais).
    '<span class="lp-info"><span class="lp-nome">' + esc(nomeFeira(f)) + "</span>" +
    '<span class="lp-sub">' + [f.bairro, f.dia.replace(" Feira", ""), f.categoria === "Tradicional" ? "" : f.categoria]
      .filter(Boolean).map(esc).join(" · ") + "</span></span>" +
    '<span class="lp-dist">' + fmtDist(x.d) + "</span>";
  li.addEventListener("click", function () { focarFeira(x.m); });
  li.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focarFeira(x.m); }
  });
  return li;
}

// de onde a lista mede: o lugar da busca, senao a localizacao
function referencia() { return estado.lugar || estado.userPos; }

function renderListaPerto() {
  var userPos = referencia();
  if (!userPos) { painel.hidden = true; return; }
  var arr = [];
  todos.forEach(function (m) {
    if (!passa(m.feira)) return;
    var p = m.getLatLng();
    arr.push({ m: m, f: m.feira, d: distKm(userPos.lat, userPos.lng, p.lat, p.lng) });
  });
  arr.sort(function (a, b) { return a.d - b.d; });
  var dentro = arr.filter(function (x) { return x.d <= RAIO; }).length;
  var de = estado.lugar ? " de " + esc(estado.lugar.nome) : "";
  lpTitulo.innerHTML = dentro
    ? "<span class=\"lp-emoji\">🧺 </span>Feiras até " + RAIO + " km" + de + " <span class=\"lp-qtd\">" + dentro + "</span>"
    : "Nenhuma feira em " + RAIO + " km" + de + " — veja as mais próximas:";
  btnLpFechar.hidden = !estado.lugar;

  lpItens.innerHTML = "";
  arr.slice(0, MAX_LISTA).forEach(function (x) { lpItens.appendChild(itemLista(x)); });

  var estavaOculto = painel.hidden;
  painel.hidden = false;
  if (estavaOculto) poeFolha(1);
}

// ---- a folha do celular ----
// No celular a lista "perto" e uma folha presa ao rodape, com tres paradas:
// recolhida (so o cabecalho, mapa quase inteiro a mostra), a de sempre e
// aberta (leitura). Arrasta-se so pelo cabecalho, de proposito: assim o gesto
// nunca disputa com a rolagem da lista. No computador nao ha folha: as mesmas
// paradas 0 e 1 viram o minimizar/expandir de sempre.
// A parada vigente e GUARDADA, e nao medida: medir a altura no meio da
// transicao devolve a altura antiga, e o toque seguinte decidia errado.
var paradaFolha = 1;
function folhaAtiva() { return mqEstreito.matches && !painel.hidden; }
function alturasFolha() {
  var H = window.innerHeight;
  var media = Math.round(H * 0.45);
  // a recolhida e a altura do proprio cabecalho, medida: acompanha a fonte
  return [lpCab.offsetHeight, media, Math.max(media, H - 130)];
}
function poeFolha(i) {
  paradaFolha = i;
  var min = i === 0;
  painel.classList.toggle("minimizado", min);
  btnLpMin.textContent = min ? "+" : "–";
  btnLpMin.setAttribute("aria-label", min ? "Expandir lista" : "Minimizar lista");
  painel.style.height = mqEstreito.matches ? alturasFolha()[i] + "px" : "";
  alturaCredito();
}
// o credito do mapa (rodape) fica logo acima da folha, nunca escondido por ela
function alturaCredito(h) {
  var v = folhaAtiva() ? (h != null ? h : alturasFolha()[paradaFolha]) : 0;
  document.documentElement.style.setProperty("--folha-h", v + "px");
}

var arrasto = null;
function soltaFolha() {
  if (!arrasto) return;
  var moveu = arrasto.moveu;
  arrasto = null;
  painel.classList.remove("arrastando");
  if (!moveu) { poeFolha(paradaFolha === 0 ? 1 : 0); return; } // toque simples: abre/recolhe
  var h = painel.offsetHeight, a = alturasFolha(), perto = 0;
  a.forEach(function (v, i) { if (Math.abs(v - h) < Math.abs(a[perto] - h)) perto = i; });
  poeFolha(perto);
}

// ---- onde mora a lista "perto" ----
// No computador ela ocupa o vao da barra lateral, entre os filtros e o
// rodape: o mapa fica livre e a lista fica junto dos filtros que a mudam.
// No celular ela e a folha presa ao pe da tela. O mesmo elemento muda de
// lugar (os ouvintes vao junto) quando a tela cruza o ponto de quebra.
var rodapeBarra = document.querySelector("#sidebar footer");
var antesDoToast = document.getElementById("toast");
function posicionaLista() {
  if (mqEstreito.matches) {
    if (painel.parentNode !== elApp) elApp.insertBefore(painel, antesDoToast);
  } else if (painel.nextElementSibling !== rodapeBarra) {
    rodapeBarra.parentNode.insertBefore(painel, rodapeBarra);
  }
  if (!painel.hidden) poeFolha(paradaFolha);
}

// ---- o lugar escolhido na busca ----
export function mostrarLugar(l) {
  estado.lugar = { lat: l.lat, lng: l.lng, nome: l.nome };
  if (lugarMarker) lugarMarker.remove();
  lugarMarker = marcadorDe("lugar-dot", l.lat, l.lng);
  irPara(l.lat, l.lng, ZOOM_LOCALIZACAO);
  renderListaPerto();
  if (folhaAtiva()) poeFolha(1);
}
function fecharLugar() {
  if (lugarMarker) { lugarMarker.remove(); lugarMarker = null; }
  if (!estado.lugar) return;
  estado.lugar = null;
  renderListaPerto();           // volta a medir da localizacao, se ligada
  if (painel.hidden) poeFolha(1);
}

// ---- ligar e desligar ----
function desligarPerto() {
  if (userMarker) { userMarker.remove(); userMarker = null; }
  estado.userPos = null;
  // com um lugar da busca aberto a lista fica (medindo dali)
  if (estado.lugar) renderListaPerto();
  else { painel.hidden = true; poeFolha(1); }
  setBotaoAtivo("perto", false);
  btnVoltarLoc.classList.remove("ativo");
  btnVoltarLoc.setAttribute("aria-label", "Ver as feiras perto de mim");
}

// auto: ligada sozinha na abertura (sem avisos de erro: ninguem pediu)
export function ativarPerto(auto) {
  if (!navigator.geolocation) { if (!auto) toast("Seu navegador não suporta geolocalização"); return; }
  btnPerto.disabled = true; lblPerto.textContent = "Localizando…";
  navigator.geolocation.getCurrentPosition(function (pos) {
    btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
    // Fora da capital a lista viraria "2461 km" e o mapa pararia na borda dos
    // limites, sem a pessoa nem feira nenhuma a vista. Nenhum ponto da cidade
    // fica a mais de ~20 km de uma feira (o pior e a ponta sul de Marsilac),
    // e a Grande SP fica abaixo de 30 km: so quem esta longe cai aqui.
    if (feiraMaisProximaKm(pos.coords.latitude, pos.coords.longitude) > LONGE_KM) {
      if (estado.userPos) desligarPerto();
      fechaConvitePorqueLigou();
      // quem abre o site com a permissao ja dada nao precisa ouvir isso a cada visita
      if (!auto) toast("Parece que você está fora de São Paulo. Este mapa mostra só as feiras livres da capital.", 6000);
      return;
    }
    setBotaoAtivo("perto", true);
    fecharLugar(); // pediu a propria localizacao: a lista volta a medir dela
    var userPos = estado.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (userMarker) userMarker.remove();
    userMarker = marcadorDe("user-dot", userPos.lat, userPos.lng);
    // quem chegou por um link de feira quer ver AQUELA feira: a lista de
    // distancias aparece, mas o mapa nao sai de cima dela
    if (!estado.feiraPedida) irPara(userPos.lat, userPos.lng, ZOOM_LOCALIZACAO);
    renderListaPerto();
    btnVoltarLoc.classList.add("ativo");
    btnVoltarLoc.setAttribute("aria-label", "Voltar para minha localização");
    fecharDica();
    // a posicao chegou com o convite ainda aberto: nao ha mais o que perguntar
    fechaConvitePorqueLigou();
  }, function () {
    btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
    if (!auto) toast("Não foi possível obter sua localização");
  }, { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 });
}

// Quem JA concedeu a permissao antes e ligado direto (o navegador nao pergunta
// nada e o site abre centralizado). Quem nunca decidiu NAO recebe a janela do
// navegador no load: o "nao" fica gravado quase pra sempre, e negar por reflexo
// no segundo zero queimaria a funcao. Esses recebem o NOSSO convite
// (janelas.js), e a janela do navegador so aparece para quem aceitou.
export function pedirLocalizacaoNoInicio() {
  if (!navigator.geolocation) return;
  if (!(navigator.permissions && navigator.permissions.query)) return;
  navigator.permissions.query({ name: "geolocation" })
    .then(function (p) {
      if (p.state === "granted") ativarPerto(true);
      else if (p.state === "denied") estado.geoNegada = true;
    })
    .catch(function () {});
}

// ---- partida ----
export function iniciaPerto() {
  // filtro mudou: a lista mostra so as feiras que passam
  ouvir("filtros", function () { if (referencia()) renderListaPerto(); });
  btnLpFechar.addEventListener("click", fecharLugar);

  btnLpMin.addEventListener("click", function () { poeFolha(paradaFolha === 0 ? 1 : 0); });
  lpCab.addEventListener("pointerdown", function (e) {
    if (!mqEstreito.matches || e.target.closest("#lp-min, #lp-fechar")) return;
    arrasto = { y: e.clientY, h: painel.offsetHeight, moveu: false };
    try { lpCab.setPointerCapture(e.pointerId); } catch (err) {}
    painel.classList.add("arrastando");
  });
  lpCab.addEventListener("pointermove", function (e) {
    if (!arrasto) return;
    var dy = arrasto.y - e.clientY;
    if (Math.abs(dy) > 6) arrasto.moveu = true;
    var a = alturasFolha();
    var h = Math.min(a[2], Math.max(a[0], arrasto.h + dy));
    painel.style.height = h + "px";
    alturaCredito(h);
  });
  lpCab.addEventListener("pointerup", soltaFolha);
  lpCab.addEventListener("pointercancel", soltaFolha);
  // girar o aparelho ou cruzar o ponto de quebra muda as alturas das paradas
  window.addEventListener("resize", function () { if (!painel.hidden) poeFolha(paradaFolha); });

  // botao redondo do mapa: com a localizacao desligada ELE tambem a liga;
  // com ela ligada, volta a centralizar no usuario.
  btnVoltarLoc.addEventListener("click", function () {
    fecharDica();
    if (estado.userPos) { irPara(estado.userPos.lat, estado.userPos.lng, ZOOM_LOCALIZACAO); return; }
    ativarPerto(false);
  });
  btnPerto.addEventListener("click", function () {
    if (this.classList.contains("ativo")) { desligarPerto(); return; }
    ativarPerto(false);
  });

  if (mqEstreito.addEventListener) mqEstreito.addEventListener("change", posicionaLista);
  else mqEstreito.addListener(posicionaLista); // Safari antigo
  posicionaLista();
}
