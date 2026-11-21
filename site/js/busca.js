// A busca da barra do topo: feiras (rua, bairro, distrito, zona) e áreas
// inteiras (zona, distrito, bairro). Só a conta; a caixa de sugestões fica
// no app.js. Sem página nem mapa: testável no Node.
//
// Cada item recebido é um "marcador" do app: { feira: <registro da base>, ... }.
// O que volta aponta para esses mesmos objetos.

import { norm, distanciaFuzzyMin } from "./texto.js?v=72";
import { zonaDe } from "./dados.js?v=72";

export var MAX_SUGESTOES = 8;
export var MAX_AREAS = 4;

// indices p/ busca por area (bairro/distrito/zona) e p/ achar a feira pelo id
export function montarIndices(marcadores) {
  var porBairro = {}, porDistrito = {}, porZona = {}, porId = {};
  marcadores.forEach(function (m) {
    var f = m.feira;
    porId[f.id] = m;
    if (f.bairro) (porBairro[f.bairro] = porBairro[f.bairro] || []).push(m);
    if (f.distrito) (porDistrito[f.distrito] = porDistrito[f.distrito] || []).push(m);
    var z = zonaDe(f);
    if (z) (porZona[z] = porZona[z] || []).push(m);
  });
  return { porBairro: porBairro, porDistrito: porDistrito, porZona: porZona, porId: porId };
}

export function criarBusca(marcadores, indices) {
  // O texto de cada feira e de cada area sai sem acento uma vez so, aqui: a
  // busca roda a cada tecla e nao precisa refazer isso para as ~1000 feiras.
  var feiras = marcadores.map(function (m) {
    var f = m.feira;
    return {
      m: m, f: f,
      // join() converte null/undefined em "" (evita casar a palavra "null")
      alvo: norm([f.logradouro, f.bairro, f.subprefeitura, f.distrito, zonaDe(f)].join(" ")),
      rua: norm(f.logradouro)
    };
  });
  function listaAreas(rotulo, mapa) {
    return Object.keys(mapa).map(function (label) {
      return { tipo: rotulo, label: label, chave: norm(label), marcadores: mapa[label] };
    });
  }
  var areas = [].concat(
    listaAreas("Zona", indices.porZona),
    listaAreas("Distrito", indices.porDistrito),
    listaAreas("Bairro", indices.porBairro)
  );

  // feiras cujo texto contem o termo; se nenhuma, as que chegam perto
  // (erro de digitacao). Devolve [{ m, f }], no maximo MAX_SUGESTOES.
  function buscarFeiras(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var resultados = [];
    feiras.forEach(function (x) {
      var pos = x.alvo.indexOf(q);
      if (pos === -1) return;
      resultados.push({ m: x.m, f: x.f, pos: pos, comecaComRua: x.rua.indexOf(q) === 0, fuzzy: false });
    });
    // nada bateu exato -> tenta tolerando erro de digitacao (so entao, pra
    // nao competir/confundir com os resultados exatos, que sao mais confiaveis)
    if (!resultados.length) {
      feiras.forEach(function (x) {
        var d = distanciaFuzzyMin(q, x.alvo);
        if (d === null) return;
        resultados.push({ m: x.m, f: x.f, pos: 0, comecaComRua: false, fuzzy: true, dist: d });
      });
    }
    resultados.sort(function (a, b) {
      if (a.fuzzy !== b.fuzzy) return a.fuzzy ? 1 : -1;
      if (a.fuzzy) return a.dist - b.dist;
      if (a.comecaComRua !== b.comecaComRua) return a.comecaComRua ? -1 : 1;
      if (a.pos !== b.pos) return a.pos - b.pos;
      return a.f.logradouro.localeCompare(b.f.logradouro, "pt-BR");
    });
    return resultados.slice(0, MAX_SUGESTOES);
  }

  // zonas, distritos e bairros que batem com o termo -> "atalho" p/ ver a
  // area toda. Devolve [{ tipo, label, marcadores }], no maximo MAX_AREAS.
  function buscarAreas(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var achadas = areas.filter(function (a) { return a.chave.indexOf(q) !== -1; });
    if (!achadas.length) {
      areas.forEach(function (a) {
        var d = distanciaFuzzyMin(q, a.chave);
        if (d !== null) achadas.push({ tipo: a.tipo, label: a.label, marcadores: a.marcadores, dist: d });
      });
      achadas.sort(function (a, b) { return a.dist - b.dist; });
      return achadas.slice(0, MAX_AREAS);
    }
    achadas.sort(function (a, b) { return b.marcadores.length - a.marcadores.length; });
    return achadas.slice(0, MAX_AREAS);
  }

  return { feiras: buscarFeiras, areas: buscarAreas };
}
