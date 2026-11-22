// Peças de tela usadas por várias partes: o aviso rápido (toast), o anúncio
// para leitor de tela, as janelas <dialog>, os botões de liga/desliga e o
// tamanho da tela.

// celular (abaixo disto o layout muda: folha no rodapé, gaveta de filtros)
export var mqEstreito = window.matchMedia("(max-width: 760px)");
// quem pediu menos movimento no sistema nao ve o mapa deslizar
export var semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// so onde ha mouse: no toque, uma dica de "passar por cima" ficaria presa
export var temMouse = window.matchMedia("(hover: hover)").matches;

// ---- toast (mensagens rapidas) ----
var toastTimer;
export function toast(msg, ms) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 3200);
}

// ---- anuncio para leitor de tela ----
// O mapa muda sem que nada perto do foco mude: quem nao enxerga a tela nao
// saberia que o filtro surtiu efeito. A espera junta mudancas em sequencia
// (ex.: "Feiras hoje" desliga um dia e liga outro) num anuncio so.
var anuncioTimer;
export function anuncia(texto) {
  clearTimeout(anuncioTimer);
  anuncioTimer = setTimeout(function () {
    document.getElementById("anuncio").textContent = texto;
  }, 500);
}

export function setBotaoAtivo(id, on) {
  var b = document.getElementById(id);
  b.classList.toggle("ativo", on);
  b.setAttribute("aria-pressed", on ? "true" : "false");
}

// ---- janelas (<dialog>) ----
export function abreDialogo(d) {
  if (d.open) return;
  if (d.showModal) d.showModal();
  else d.setAttribute("open", ""); // navegador antigo: abre sem o veu
}
export function fechaDialogo(d, valor) {
  if (d.close) d.close(valor);
  else { d.removeAttribute("open"); d.dispatchEvent(new Event("close")); }
}
// Clique no veu fecha; clique dentro da caixa nao. Comparar e.target com o
// dialog NAO basta: o preenchimento da caixa pertence ao proprio <dialog>.
// O que separa os dois e a geometria.
export function fechaNoVeu(d) {
  d.addEventListener("click", function (e) {
    if (e.target !== d) return;
    var r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fechaDialogo(d);
  });
}
