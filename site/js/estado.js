// O que o site sabe neste momento e que mais de uma parte lê: filtros
// ligados, a posição de quem usa, a feira pedida pelo link.
//
// Cada parte muda só o que é dela. Quem precisa reagir a uma mudança de outra
// parte ouve o aviso (ouvir/avisar), em vez de a parte que mudou chamar todas
// as outras: o filtro não sabe que existe a lista "perto de mim", só avisa
// que mudou.
//
// Avisos em uso:
//   "filtros"   os filtros mudaram; dado: as feiras (marcadores) visíveis
//   "reportar"  pediram para reportar erro numa feira; dado: a feira

export var estado = {
  filtros: { dias: new Set(), categorias: new Set() },
  userPos: null,      // { lat, lng } com "Perto de mim" ligado
  lugar: null,        // { lat, lng, nome } escolhido na busca (lugares.js): a lista mede dali
  feiraPedida: null,  // marcador da feira do link ?feira=
  geoNegada: false,   // o navegador já respondeu "não" à localização
  iniciado: false     // a tela inicial está montada: antes disso os filtros
                      // são postos por código e não há o que anunciar
};

// a feira passa nos filtros ligados?
export function passa(f) {
  var fl = estado.filtros;
  if (fl.dias.size && !fl.dias.has(f.dia)) return false;
  if (fl.categorias.size && !fl.categorias.has(f.categoria)) return false;
  return true;
}

var ouvintes = {};
export function ouvir(evento, fn) {
  (ouvintes[evento] = ouvintes[evento] || []).push(fn);
}
export function avisar(evento, dado) {
  (ouvintes[evento] || []).forEach(function (fn) { fn(dado); });
}
