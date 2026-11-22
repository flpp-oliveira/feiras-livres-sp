// A barra lateral dos filtros: no celular é uma gaveta que abre pelo botão
// "☰ Filtros"; no computador pode ser recolhida pela setinha.

import { map } from "./mapa.js?v=74";
import { fecharDica } from "./janelas.js?v=74";

var elApp = document.getElementById("app");
var btnToggle = document.getElementById("toggle-sidebar");

// ---- gaveta de filtros (celular) ----
// No celular a busca e os dois atalhos ficam sempre a vista, no topo; os
// filtros de dia e categoria abrem por este botao.
function poeGaveta(aberta) {
  elApp.classList.toggle("sidebar-aberta", aberta);
  btnToggle.setAttribute("aria-expanded", aberta ? "true" : "false");
}
export function fechaGaveta() { poeGaveta(false); }

// ---- partida ----
export function iniciaBarra() {
  btnToggle.addEventListener("click", function () { poeGaveta(!elApp.classList.contains("sidebar-aberta")); });
  map.on("click", fechaGaveta);

  var btnColapsar = document.getElementById("colapsar-sidebar");
  btnColapsar.addEventListener("click", function () {
    fecharDica(); // com a barra recolhida o "Perto de mim" some, e a dica ficaria orfa
    var colapsada = elApp.classList.toggle("sidebar-colapsada");
    btnColapsar.textContent = colapsada ? "›" : "‹";
    btnColapsar.setAttribute("aria-label", colapsada ? "Expandir filtros" : "Colapsar filtros");
  });
}
